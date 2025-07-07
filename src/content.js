console.log('🎯 HABLA-POTABLE: Iniciando extensión');

// Sistema de logging mejorado
const log = {
	info: (msg, ...args) => console.log('%c🎯 HABLA-POTABLE:', 'color: #4CAF50; font-weight: bold;', msg, ...args),
	error: (msg, error) => console.error('%c❌ HABLA-POTABLE:', 'color: #f44336; font-weight: bold;', msg, '\nError:', error),
	warn: (msg, ...args) => console.warn('%c⚠️ HABLA-POTABLE:', 'color: #ff9800; font-weight: bold;', msg, ...args),
};

// Verificación inicial
try {
	if (!window.chrome || !chrome.runtime || !chrome.storage) {
		throw new Error('API de Chrome no disponible');
	}
	log.info('APIs de Chrome disponibles');
} catch (error) {
	log.error('Error inicial:', error);
	throw error;
}

// Variables de estado globales
const config = {
	lastSubtitle: '',
	targetLanguage: 'es',
	volume: 100,
	speed: 100,
	isEnabled: true,
};

// Variables para el control de procesamiento
let isProcessing = false;
let lastProcessedText = '';
let lastDetectedSubtitle = '';
let YTsubs = '';

// Cargar configuraciones de manera segura
chrome.storage.sync
	.get(['targetLanguage', 'volume', 'speed', 'isEnabled'])
	.then((data) => {
		Object.assign(config, data);
		log.info('Configuración cargada:', config);
	})
	.catch((error) => {
		log.error('Error cargando configuración:', error);
	});

// Unificar los listeners de configuración en uno solo
chrome.storage.onChanged.addListener((changes, namespace) => {
	try {
		for (let [key, {newValue, oldValue}] of Object.entries(changes)) {
			if (key in config) {
				config[key] = newValue;
				log.info(`Configuración actualizada: ${key} =`, newValue);

				// Si cambia el idioma o se desactiva/activa la extensión, reiniciar el procesamiento
				if ((key === 'targetLanguage' && oldValue !== newValue) || key === 'isEnabled') {
					log.info('🔄 Cambio importante detectado, reiniciando procesamiento...');
					resetProcessingState();
				}
			}
		}
	} catch (error) {
		log.error('Error en listener de cambios:', error);
	}
});

// Nueva función para resetear el estado
function resetProcessingState() {
	lastProcessedText = '';
	isProcessing = false;

	// Limpiar cola de audio
	if (audioQueue.currentAudioElement) {
		audioQueue.currentAudioElement.pause();
		audioQueue.currentAudioElement = null;
	}
	audioQueue.items = [];
	audioQueue.isPlaying = false;
	audioQueue.lastPlayedText = '';
}

// Manejar mensajes del popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'checkSubtitles') {
		const hasSubtitles = !!detectSubtitles();
		sendResponse({hasSubtitles});
	}
	return true;
});

// Función para detectar subtítulos según la plataforma
function detectSubtitles() {
	let subtitleText = '';

	try {
		if (window.location.hostname.includes('udemy.com')) {
			const subtitleElement = document.querySelector('[data-purpose="captions-cue-text"]');
			if (subtitleElement) {
				subtitleText = subtitleElement.textContent.trim();
				// Comprobar si es el mismo subtítulo
				if (subtitleText === lastDetectedSubtitle) {
					return null;
				}
				lastDetectedSubtitle = subtitleText;
			}
		} else if (window.location.hostname.includes('youtube.com')) {
			// Solo procesar si estamos en una página de video
			if (!window.location.pathname.includes('/watch')) {
				return null;
			}

			const elements = document.querySelectorAll('span.ytp-caption-segment');
			const videoElement = document.querySelector('video');

			// Solo proceder si tenemos video y subtítulos
			if (videoElement && elements.length > 0) {
				const videoRect = videoElement.getBoundingClientRect();
				const videoMiddle = videoRect.top + videoRect.height / 2;

				for (const element of elements) {
					// Solo procesar elementos visibles
					if (element.offsetParent !== null && element.textContent.trim()) {
						const elementRect = element.getBoundingClientRect();
						const elementMiddle = elementRect.top + elementRect.height / 2;

						// Verificar si el subtítulo está en la mitad inferior del video
						if (elementMiddle > videoMiddle) {
							subtitleText += ' ' + element.textContent.trim();
							log.info('Subtítulo detectado en posición:', {
								videoMiddle,
								elementMiddle,
								text: element.textContent.trim(),
							});
						}
					}
				}

				// Procesar el texto acumulado
				if (subtitleText.trim()) {
					if (subtitleText === lastDetectedSubtitle) {
						return null;
					}
					if (lastDetectedSubtitle === '') {
						YTsubs = subtitleText;
					} else {
						const words = subtitleText.trim().split(' ');
						const lastWord = words[words.length - 1];
						if (!YTsubs.includes(lastWord)) {
							YTsubs += ' ' + lastWord;
						}
					}
					lastDetectedSubtitle = subtitleText;
				}
			}
			return null;
		} else if (window.location.hostname.includes('coursera.org')) {
			const courseraElement = document.querySelector('.rc-SubtitleContent, .cue-text');
			subtitleText = courseraElement?.textContent.trim() || '';
			// Comprobar duplicados para Coursera
			if (subtitleText === lastDetectedSubtitle) {
				return null;
			}
			lastDetectedSubtitle = subtitleText;
		}

		if (subtitleText) {
			log.info(`Subtítulo detectado en ${window.location.hostname}:`, subtitleText);
			return subtitleText;
		} else {
			return null;
		}
	} catch (error) {
		log.error('Error detectando subtítulos', error);
		return null;
	}
}

// Modificar initializePlatformObservers para manejar el estado enabled/disabled
function initializePlatformObservers() {
	// Limpiar estados previos
	resetProcessingState();
	if (observer) observer.disconnect();

	function startObservation() {
		if (!config.isEnabled) return;

		log.info('🔄 Iniciando observación de subtítulos');

		const observerConfig = {
			childList: true,
			subtree: true,
			characterData: true,
		};

		// Quitar referencia incorrecta a targetNode
		observer.observe(document.body, observerConfig);
		log.info('🎯 Observer conectado al body');

		// Hacer una primera detección
		const initialSubtitles = detectSubtitles();
		if (initialSubtitles) {
			log.info('✨ Subtítulos iniciales encontrados');
			processSubtitle(initialSubtitles);
		}
	}

	// Iniciar observación inmediatamente si está habilitado
	if (config.isEnabled) {
		startObservation();
	}

	// Reconectar el observer cada hora
	setInterval(() => {
		if (observer) {
			observer.disconnect();
			startObservation();
		}
	}, 3600000);

	// Procesar subtítulos de YouTube cada 4 segundos
	if (window.location.hostname.includes('youtube.com')) {
		setInterval(() => {
			if (config.isEnabled && YTsubs && YTsubs.trim() !== '') {
				log.info('🔄 Procesando subtitulos de YouTube:', YTsubs);
				processSubtitle(YTsubs);
				YTsubs = ''; // Limpiar después de procesar
			}
		}, 3000);
	}
}

// Modificar el observer para manejar la desaparición/reaparición
const observer = new MutationObserver((mutations) => {
	if (!config.isEnabled) return;

	// Verificar cambios en cada mutación
	mutations.forEach((mutation) => {
		// Si se agregaron nodos, verificar si contienen subtítulos
		if (mutation.addedNodes.length > 0 || mutation.type === 'characterData') {
			const sub = detectSubtitles();
			if (sub) {
				processSubtitle(sub);
			}
		}
	});
});

// Nueva función para procesar subtítulos
async function processSubtitle(text) {
	if (!text || !config.isEnabled || isProcessing) return;

	try {
		// Triple verificación de duplicados
		if (text === lastDetectedSubtitle && text === lastProcessedText && !isProcessing) {
			log.info('🔄 Subtítulo duplicado ignorado:', text);
			return;
		}

		// Si el idioma cambió, permitir reprocesar
		if (text === lastProcessedText && !isProcessing) {
			log.info('🔄 Reprocesando texto en nuevo idioma:', config.targetLanguage);
		}

		isProcessing = true;
		lastProcessedText = text;
		log.info(`🎯 Procesando en ${config.targetLanguage}:`, text);

		const translatedText = await translateText(text);
		if (translatedText) {
			log.info('🔄 Traducido:', translatedText);
			await synthesizeSpeech(translatedText);
		}
	} catch (error) {
		log.error('Error procesando subtítulo:', error);
		if (lastProcessedText === text) {
			lastProcessedText = '';
		}
	} finally {
		isProcessing = false;
	}
}

// Actualizar configuración de audioQueue para reproducción secuencial
const audioQueue = {
	items: [],
	currentlyPlaying: null,
	isPlaying: false,
	currentAudioElement: null,
	lastPlayedText: '',
	minProcessingInterval: 50, // Intervalo mínimo entre audios
};

// Modificar processAudioQueue para reproducción estrictamente secuencial
async function processAudioQueue() {
	if (audioQueue.isPlaying || audioQueue.items.length === 0) return;

	try {
		audioQueue.isPlaying = true;

		while (audioQueue.items.length > 0) {
			const {text, audioData} = audioQueue.items[0];

			// Detener audio actual si existe
			if (audioQueue.currentAudioElement) {
				audioQueue.currentAudioElement.pause();
				audioQueue.currentAudioElement = null;
			}

			// Reproducir el audio actual
			try {
				await new Promise((resolve, reject) => {
					const audio = new Audio(audioData);
					audioQueue.currentAudioElement = audio;
					audio.volume = config.volume / 100;
					audio.playbackRate = config.speed / 100;

					audio.onended = () => {
						audioQueue.items.shift();
						audioQueue.currentAudioElement = null;
						resolve();
					};

					audio.onerror = reject;

					audio
						.play()
						.then(() => log.info('▶️ Reproduciendo:', text))
						.catch(reject);
				});

				// Pequeña pausa entre audios para claridad
				if (audioQueue.items.length > 0) {
					await new Promise((resolve) => setTimeout(resolve, audioQueue.minProcessingInterval));
				}
			} catch (error) {
				log.error('Error reproduciendo audio, reintentando:', error);
				await new Promise((resolve) => setTimeout(resolve, 500));
				// No eliminamos el audio de la cola para reintentarlo
			}
		}
	} catch (error) {
		log.error('Error en cola de audio:', error);
	} finally {
		audioQueue.isPlaying = false;
		audioQueue.currentAudioElement = null;
	}
}

// Reemplazar la función translateText
async function translateText(text) {
	if (!text) return null;

	try {
		// Usar directamente el mensaje al background
		return new Promise((resolve, reject) => {
			chrome.runtime.sendMessage(
				{
					action: 'translate',
					text: text,
					targetLang: config.targetLanguage,
				},
				(response) => {
					if (chrome.runtime.lastError) {
						reject(chrome.runtime.lastError);
						return;
					}
					if (response?.success) {
						//log.info('Traducción exitosa:', response.text);
						resolve(response.text);
					} else {
						reject(new Error(response?.error || 'Error de traducción'));
					}
				},
			);
		});
	} catch (error) {
		log.error('Error en traducción:', error);
		return null;
	}
}

// Agregar caché para audio
const audioCache = new Map();

// Modificar synthesizeSpeech para mantener la secuencialidad
async function synthesizeSpeech(text) {
	if (!text) return false;

	try {
		const chunks = text.match(/.{1,100}(?:[.!?]|$)/g) || [text];

		for (const chunk of chunks) {
			const response = await new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(
					{
						action: 'synthesize',
						text: chunk,
						targetLang: config.targetLanguage,
					},
					(response) => {
						if (!response?.success) {
							reject(new Error(response?.error || 'Error en síntesis'));
							return;
						}
						resolve(response);
					},
				);
			});

			if (response.audioData) {
				audioQueue.items.push({
					text: chunk,
					audioData: response.audioData,
				});
				processAudioQueue().catch(log.error);
			}
		}
		return true;
	} catch (error) {
		log.error('Error en síntesis:', error);
		return false;
	}
}

// Simplificar los listeners de inicialización
document.addEventListener('DOMContentLoaded', () => {
	log.info('🎬 DOM Content Loaded');
	initializePlatformObservers();
});

// Ejecutar también cuando la página esté completamente cargada
window.addEventListener('load', () => {
	log.info('🎬 Window Loaded');
	initializePlatformObservers();
});

// Reinicializar cuando cambia la URL (para navegación SPA en YouTube)
let lastUrl = location.href;
new MutationObserver(() => {
	if (location.href !== lastUrl) {
		lastUrl = location.href;
		setTimeout(initializePlatformObservers, 1500);
	}
}).observe(document, {subtree: true, childList: true});

// Asegurar que la extensión se inicia
log.info('Extensión cargada completamente');
