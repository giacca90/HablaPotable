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

// Escuchar cambios en la configuración de manera segura
chrome.storage.onChanged.addListener((changes, namespace) => {
	try {
		for (let [key, {newValue}] of Object.entries(changes)) {
			if (key in config) {
				config[key] = newValue;
				log.info(`Configuración actualizada: ${key} =`, newValue);
			}
		}
	} catch (error) {
		log.error('Error en listener de cambios:', error);
	}
});

// Cargar configuraciones
chrome.storage.sync.get(['targetLanguage', 'volume', 'speed', 'isEnabled'], (data) => {
	if (data.targetLanguage) config.targetLanguage = data.targetLanguage;
	if (data.volume) config.volume = data.volume;
	if (data.speed) config.speed = data.speed;
	if (data.isEnabled !== undefined) config.isEnabled = data.isEnabled;
});

// Escuchar cambios en la configuración
chrome.storage.onChanged.addListener((changes) => {
	if (changes.targetLanguage) config.targetLanguage = changes.targetLanguage.newValue;
	if (changes.volume) config.volume = changes.volume.newValue;
	if (changes.speed) config.speed = changes.speed.newValue;
	if (changes.isEnabled) config.isEnabled = changes.isEnabled.newValue;
});

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
	log.info('Iniciando detección de subtítulos');
	let subtitleText = '';

	try {
		if (window.location.hostname.includes('udemy.com')) {
			// Usar solo el selector específico de Udemy
			const subtitleElement = document.querySelector('[data-purpose="captions-cue-text"]');
			if (subtitleElement) {
				subtitleText = subtitleElement.textContent.trim();
				log.info('✅ Subtítulo Udemy encontrado:', {
					texto: subtitleText,
					elemento: subtitleElement,
				});
			}
		} else if (window.location.hostname.includes('youtube.com')) {
			// YouTube - múltiples intentos de detección
			const ytSelectors = ['.ytp-caption-segment', '.captions-text', '.caption-window span', '.caption-visual-line', '.ytp-caption-window-container span'];

			for (const selector of ytSelectors) {
				const elements = document.querySelectorAll(selector);
				for (const element of elements) {
					if (element.offsetParent !== null && element.textContent.trim()) {
						subtitleText = element.textContent.trim();
						break;
					}
				}
				if (subtitleText) break;
			}
		} else if (window.location.hostname.includes('coursera.org')) {
			const courseraElement = document.querySelector('.rc-SubtitleContent, .cue-text');
			subtitleText = courseraElement?.textContent.trim() || '';
		}

		if (subtitleText) {
			log.info(`Subtítulo detectado en ${window.location.hostname}:`, subtitleText);
		} else {
			log.warn(`No se encontró subtítulo en ${window.location.hostname}`);
		}
		return subtitleText;
	} catch (error) {
		log.error('Error detectando subtítulos', error);
		return '';
	}
}

// Modificar initializePlatformObservers para ser más simple y frecuente
function initializePlatformObservers() {
	if (!window.location.hostname.includes('udemy.com')) return;

	// Limpiar estados previos
	if (observer) observer.disconnect();
	lastProcessedText = '';
	isProcessing = false;

	log.info('🔄 Iniciando observación de subtítulos');

	// Buscar la etiqueta cada 100ms
	const searchInterval = setInterval(() => {
		const subtitleElement = document.querySelector('[data-purpose="captions-cue-text"]');
		if (subtitleElement) {
			const currentText = subtitleElement.textContent?.trim();

			if (currentText && currentText !== lastProcessedText) {
				log.info('📝 Nuevo subtítulo detectado:', currentText);
				handleSubtitleChange(currentText);
			}
		}
	}, 100);

	// Limpiar después de 1 hora (o cuando se cambie de video)
	setTimeout(() => clearInterval(searchInterval), 3600000);
}

// Nueva función para verificar y procesar subtítulos
function checkAndProcessSubtitles() {
	const subtitleElement = document.querySelector('[data-purpose="captions-cue-text"]');
	if (subtitleElement) {
		const currentText = subtitleElement.textContent?.trim();
		if (currentText && currentText !== lastProcessedText) {
			log.info('📝 Subtítulo detectado:', currentText);
			handleSubtitleChange(currentText);
		}
	}
}

// Modificar el observer para manejar la desaparición/reaparición
const observer = new MutationObserver((mutations) => {
	if (!config.isEnabled) return;

	// Verificar cambios en cada mutación
	mutations.forEach((mutation) => {
		// Si se agregaron nodos, verificar si contienen subtítulos
		if (mutation.addedNodes.length > 0) {
			checkAndProcessSubtitles();
		}
		// Si hubo cambios en el texto
		else if (mutation.type === 'characterData') {
			checkAndProcessSubtitles();
		}
	});
});

// Nueva función para procesar subtítulos
async function processSubtitle(text) {
	try {
		// Guardar texto actual antes de procesar
		const textToProcess = text;
		lastProcessedText = text;

		log.info('🎯 Procesando:', textToProcess);
		const translatedText = await translateText(textToProcess);

		if (translatedText) {
			log.info('🔄 Traducido:', translatedText);
			await synthesizeSpeech(translatedText);
		}
	} catch (error) {
		log.error('Error procesando subtítulo:', error);
		// Solo resetear si no hay un nuevo texto en proceso
		if (lastProcessedText === text) {
			lastProcessedText = '';
		}
	}
}

// Simplificar el handleSubtitleChange
async function handleSubtitleChange(text) {
	if (!text || !config.isEnabled || text === lastProcessedText) return;

	try {
		log.info('🎯 Procesando:', text);
		lastProcessedText = text;

		const translatedText = await translateText(text);
		if (translatedText) {
			log.info('🔄 Traducido:', translatedText);
			await synthesizeSpeech(translatedText);
		}
	} catch (error) {
		log.error('Error procesando subtítulo:', error);
		lastProcessedText = ''; // Permitir reintentar en caso de error
	}
}

// Mejorar el processAudioQueue para manejar errores y reintentos
async function processAudioQueue() {
	if (isPlayingQueue || audioQueue.length === 0) return;
	isPlayingQueue = true;

	try {
		while (audioQueue.length > 0) {
			const audioData = audioQueue[0];
			let retryCount = 0;
			const maxRetries = 3;

			while (retryCount < maxRetries) {
				try {
					await new Promise((resolve, reject) => {
						const audio = new Audio(audioData);
						audio.volume = config.volume / 100;
						audio.playbackRate = config.speed / 100;

						// Agregar timeout para prevenir bloqueos
						const timeout = setTimeout(() => {
							reject(new Error('Timeout'));
						}, 5000);

						audio.onended = () => {
							clearTimeout(timeout);
							audioQueue.shift();
							resolve();
						};

						audio.onerror = (e) => {
							clearTimeout(timeout);
							reject(new Error(`Audio error: ${e.message}`));
						};

						audio
							.play()
							.then(() => log.info('▶️ Reproduciendo audio'))
							.catch(reject);
					});
					break; // Si tiene éxito, salir del bucle de reintentos
				} catch (error) {
					retryCount++;
					log.warn(`Reintento ${retryCount}/${maxRetries} por error:`, error);

					if (retryCount === maxRetries) {
						log.error('Error máximo de reintentos alcanzado, saltando audio');
						audioQueue.shift(); // Eliminar el audio problemático
						break;
					}

					// Esperar antes de reintentar (delay exponencial)
					await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
				}
			}
		}
	} catch (error) {
		log.error('Error procesando cola de audio:', error);
	} finally {
		isPlayingQueue = false;
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

// Mejorar control de cola de audio
const audioQueue = {
	items: [],
	currentlyPlaying: null,
	isPlaying: false,
	currentAudioElement: null,
	lastPlayedText: '',
};

// Reemplazar processAudioQueue
async function processAudioQueue() {
	if (audioQueue.isPlaying || audioQueue.items.length === 0) return;

	try {
		audioQueue.isPlaying = true;

		while (audioQueue.items.length > 0) {
			const {text, audioData} = audioQueue.items[0];

			// Si este texto ya se está reproduciendo, ignorarlo
			if (text === audioQueue.lastPlayedText) {
				audioQueue.items.shift();
				continue;
			}

			// Si hay un audio reproduciéndose, detenerlo
			if (audioQueue.currentAudioElement) {
				audioQueue.currentAudioElement.pause();
				audioQueue.currentAudioElement = null;
			}

			await new Promise((resolve, reject) => {
				const audio = new Audio(audioData);
				audioQueue.currentAudioElement = audio;
				audioQueue.lastPlayedText = text;

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
		}
	} catch (error) {
		log.error('Error procesando cola de audio:', error);
	} finally {
		audioQueue.isPlaying = false;
		audioQueue.currentAudioElement = null;
	}
}

// Modificar synthesizeSpeech para incluir el texto en la cola
async function synthesizeSpeech(text) {
	if (!text) return false;

	try {
		// Dividir textos largos
		const chunks = text.match(/.{1,100}(?:[.!?]|$)/g) || [text];

		for (const chunk of chunks) {
			// Agregar delay entre peticiones
			await new Promise((resolve) => setTimeout(resolve, 250));

			const response = await new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(
					{
						action: 'synthesize',
						text: chunk,
						targetLang: config.targetLanguage,
						volume: config.volume,
						speed: config.speed,
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
				// Usar el nuevo método de cola
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

function getNextSubtitle() {
	const currentElement = document.querySelector('[data-purpose="captions-cue-text"]');
	if (!currentElement) return null;

	// Buscar el siguiente elemento de subtítulos
	const allSubtitles = document.querySelectorAll('[data-purpose="captions-cue-text"]');
	const currentIndex = Array.from(allSubtitles).indexOf(currentElement);
	return allSubtitles[currentIndex + 1]?.textContent.trim() || null;
}

// Mejorar synthesizeSpeech para manejar límites de API
async function synthesizeSpeech(text) {
	if (!text) return false;

	try {
		// Dividir textos largos
		const chunks = text.match(/.{1,100}(?:[.!?]|$)/g) || [text];

		for (const chunk of chunks) {
			// Agregar delay entre peticiones
			await new Promise((resolve) => setTimeout(resolve, 250));

			const response = await new Promise((resolve, reject) => {
				chrome.runtime.sendMessage(
					{
						action: 'synthesize',
						text: chunk,
						targetLang: config.targetLanguage,
						volume: config.volume,
						speed: config.speed,
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
				// Usar el nuevo método de cola
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

// Función auxiliar para reproducir audio
async function playAudio(src) {
	const audio = new Audio(src);
	audio.volume = config.volume / 100;
	audio.playbackRate = config.speed / 100;

	await audio.play();
	return new Promise((resolve) => {
		audio.onended = resolve;
	});
}

// Agregar función para verificar si el video está en reproducción
function isVideoPlaying() {}

// Eliminar o reemplazar la función processSubtitle ya que no la necesitamos
// Ya que estamos usando el sistema de background para traducir

// Simplificar los listeners de inicialización
document.addEventListener('DOMContentLoaded', initializePlatformObservers);

// Ejecutar también cuando la página esté completamente cargada
window.addEventListener('load', () => {
	log.info('Página cargada, verificando observadores...');
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

const elements = Array.from(document.querySelectorAll('.captions-display, .well--captions'));
const matchingElement = elements.find((el) => el.textContent.includes('texto que buscas'));

// Agregar nuevas estructuras de datos para subtítulos
const subtitleStore = {
	subtitles: [], // Array de {start, end, text, translation, audioUrl}
	currentIndex: -1,
	isLoaded: false,
};

// Modificar la función loadSubtitlesFromVideo para tener más logs
async function loadSubtitlesFromVideo() {
	log.info('🔍 Iniciando sistema de búsqueda de video y subtítulos...');
	let attempts = 0;

	// Función para buscar el video
	const findVideo = () => {
		return new Promise((resolve) => {
			const checkVideo = () => {
				attempts++;
				const video = document.querySelector('video');
				if (video) {
					log.info(`✅ Video encontrado después de ${attempts} intentos`);
					resolve(video);
				} else {
					log.info(`⏳ Intento ${attempts}: Esperando video...`);
					setTimeout(checkVideo, 500);
				}
			};
			checkVideo();
		});
	};

	// Función para buscar subtítulos
	const findSubtitles = (video) => {
		return new Promise((resolve) => {
			let trackAttempts = 0;
			let vttAttempts = 0;

			const checkTracks = async () => {
				trackAttempts++;
				const tracks = Array.from(video.textTracks);
				log.info(`📝 Intento ${trackAttempts}: Buscando tracks...`, 'Tracks encontrados:', tracks.length);

				// Intentar con tracks
				const track = tracks.find((t) => t.kind === 'subtitles' || t.kind === 'captions');
				if (track) {
					log.info('🎯 Track encontrado:', {
						kind: track.kind,
						label: track.label,
						language: track.language,
					});

					if (track.cues?.length) {
						log.info('✅ Cues encontrados en track:', track.cues.length);
						resolve({type: 'cues', data: track.cues});
						return;
					}
				}

				// Si no hay tracks, buscar URL del VTT
				vttAttempts++;
				log.info(`📄 Intento ${vttAttempts}: Buscando archivo VTT...`);
				const vttUrl = await findVttUrl();

				if (vttUrl) {
					log.info('✅ URL de VTT encontrada:', vttUrl);
					resolve({type: 'vtt', data: vttUrl});
					return;
				}

				log.info('⏳ No se encontraron subtítulos, reintentando...');
				setTimeout(checkTracks, 500);
			};
			checkTracks();
		});
	};

	try {
		log.info('🎬 Iniciando búsqueda de video...');
		const video = await findVideo();

		log.info('🎯 Video encontrado, buscando subtítulos...');
		const subtitles = await findSubtitles(video);

		if (subtitles.type === 'cues') {
			log.info('🎯 Procesando cues:', subtitles.data.length);
			processSubtitleCues(subtitles.data);
		} else {
			log.info('🎯 Cargando archivo VTT:', subtitles.data);
			await loadVttFile(subtitles.data);
		}
	} catch (error) {
		log.error('Error en carga:', error);
	}
}

// Modificar la función findVttUrl para buscar en más lugares
async function findVttUrl() {
	log.info('🔍 Buscando URL de subtítulos...');
	try {
		// Método 1: Buscar en el player
		const transcriptBtn = document.querySelector('[data-purpose="transcript-toggle"]');
		if (transcriptBtn) {
			log.info('Encontrado botón de transcripción, buscando datos...');
			const transcriptData = transcriptBtn.getAttribute('data-transcripts');
			if (transcriptData) {
				try {
					const data = JSON.parse(transcriptData);
					if (data?.length > 0) {
						log.info('✅ URL encontrada en transcriptData:', data[0].url);
						return data[0].url;
					}
				} catch (e) {
					log.warn('Error parsing transcriptData:', e);
				}
			}
		}

		// Método 2: Buscar en la API de Udemy
		const videoId = window.location.pathname.match(/\/lecture\/(\d+)/)?.[1];
		if (videoId) {
			log.info('Intentando obtener subtítulos por ID de video:', videoId);
			const response = await fetch(`/api-2.0/users/me/subscribed-courses/lectures/${videoId}/supplementary-assets`);
			const assets = await response.json();
			const caption = assets.find((asset) => (asset.asset_type === 'Caption' && asset.title.includes('Español')) || asset.title.includes('English'));
			if (caption?.url) {
				log.info('✅ URL encontrada en API:', caption.url);
				return caption.url;
			}
		}

		// Método 3: Buscar en los scripts (el método anterior)
		const scripts = Array.from(document.scripts);
		for (const script of scripts) {
			const match = script.text.match(/subtitlesUrl"?"?\s*:\s*"([^"]+\.vtt)"/);
			if (match) {
				log.info('✅ URL encontrada en scripts:', match[1]);
				return match[1];
			}
		}

		// Método 4: Buscar directamente en el player
		const player = document.querySelector('.video-player');
		if (player) {
			const playerData = player.getAttribute('data-params');
			if (playerData) {
				try {
					const data = JSON.parse(playerData);
					if (data?.captions?.url) {
						log.info('✅ URL encontrada en player:', data.captions.url);
						return data.captions.url;
					}
				} catch (e) {
					log.warn('Error parsing playerData:', e);
				}
			}
		}

		log.warn('❌ No se encontró URL de subtítulos');
		return null;
	} catch (error) {
		log.error('Error buscando URL de subtítulos:', error);
		return null;
	}
}

// Función para encontrar URL del VTT en Udemy
async function findVttUrl() {
	// Buscar en la respuesta de la API de Udemy o en el DOM
	const scriptContent = Array.from(document.scripts).find((script) => script.text.includes('"captions"'))?.text;

	if (scriptContent) {
		const match = scriptContent.match(/"url":"([^"]+\.vtt)"/);
		return match ? match[1] : null;
	}
	return null;
}

// Función para cargar y procesar archivo VTT
async function loadVttFile(url) {
	const response = await fetch(url);
	const vttText = await response.text();
	const parsed = parseVTT(vttText);
	await processSubtitles(parsed);
}

// Función para procesar subtítulos
async function processSubtitles(subs) {
	subtitleStore.subtitles = [];
	log.info('🎯 Iniciando procesamiento de', subs.length, 'subtítulos');

	for (let i = 0; i < subs.length; i++) {
		const sub = subs[i];
		log.info(`📝 Procesando subtítulo ${i + 1}/${subs.length}:`, sub.text);

		log.info('🔄 Traduciendo:', sub.text);
		const translation = await translateText(sub.text);
		log.info('✅ Traducción completada:', translation);

		log.info('🔊 Generando audio para:', translation);
		const audioData = await synthesizeSpeech(translation);
		log.info('✅ Audio generado para el subtítulo', i + 1);

		subtitleStore.subtitles.push({
			start: sub.start,
			end: sub.end,
			text: sub.text,
			translation,
			audioData,
			index: i,
		});
	}

	log.info('✨ Proceso completo. Subtítulos procesados:', subtitleStore.subtitles.length);
	subtitleStore.isLoaded = true;
	setupVideoSync();
}

function setupVideoSync() {
	const video = document.querySelector('video');
	if (!video) {
		log.error('No se encontró el video para sincronizar');
		return;
	}

	log.info('🎬 Configurando sincronización con video');
	video.addEventListener('timeupdate', () => {
		const currentTime = video.currentTime;
		const subtitle = subtitleStore.subtitles.find((sub) => currentTime >= sub.start && currentTime < sub.end);

		if (subtitle && subtitleStore.currentIndex !== subtitle.index) {
			log.info('⏱️ Tiempo:', currentTime.toFixed(2), 'Reproduciendo subtítulo:', subtitle.index, 'Texto:', subtitle.text);
			subtitleStore.currentIndex = subtitle.index;
			playSubtitleAudio(subtitle.audioData);
		}
	});
}

function playSubtitleAudio(audioData) {
	if (!config.isEnabled) return;

	const audio = new Audio(audioData);
	audio.volume = config.volume / 100;
	audio.playbackRate = config.speed / 100;
	log.info('🔊 Reproduciendo audio', {
		volumen: audio.volume,
		velocidad: audio.playbackRate,
	});

	audio.play().catch((error) => {
		log.error('Error reproduciendo audio:', error);
	});
}

// Función para procesar cues de subtítulos
function processSubtitleCues(cues) {
	const subtitles = Array.from(cues).map((cue) => ({
		start: cue.startTime,
		end: cue.endTime,
		text: cue.text.trim(),
		index: cue.id,
	}));

	processSubtitles(subtitles);
}

// Función para parsear archivo VTT
function parseVTT(vttText) {
	const lines = vttText.trim().split('\n');
	const subtitles = [];
	let currentSub = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		if (line.includes('-->')) {
			const [start, end] = line.split('-->').map((timeStr) => {
				const [mins, secs] = timeStr.trim().split(':');
				return parseFloat(mins) * 60 + parseFloat(secs);
			});

			currentSub = {
				start,
				end,
				text: '',
				index: subtitles.length,
			};
		} else if (currentSub && line !== '') {
			currentSub.text += (currentSub.text ? '\n' : '') + line;
		} else if (currentSub && line === '') {
			if (currentSub.text) {
				subtitles.push(currentSub);
			}
			currentSub = null;
		}
	}

	if (currentSub?.text) {
		subtitles.push(currentSub);
	}

	return subtitles;
}
