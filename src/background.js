// Agregar caché al inicio del archivo
const audioCache = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'translate') {
		console.log('🌐 Solicitando traducción:', request.text);
		const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${request.targetLang}&dt=t&q=${encodeURIComponent(request.text)}`;

		fetch(url, {
			method: 'GET',
			credentials: 'omit',
		})
			.then((response) => {
				console.log('📥 Respuesta cruda:', response);
				return response.json();
			})
			.then((data) => {
				console.log('📦 Datos de traducción:', data);
				if (data && data[0] && data[0][0]) {
					sendResponse({success: true, text: data[0][0][0]});
				} else {
					throw new Error('Invalid translation response');
				}
			})
			.catch((error) => {
				console.error('❌ Error de traducción:', error);
				sendResponse({success: false, error: error.message});
			});

		return true;
	}

	if (request.action === 'synthesize') {
		const cacheKey = `${request.text}_${request.targetLang}`;

		// Verificar caché
		if (audioCache.has(cacheKey)) {
			console.log('🎵 Audio encontrado en caché');
			sendResponse({
				success: true,
				audioData: audioCache.get(cacheKey),
			});
			return true;
		}

		const params = new URLSearchParams({
			ie: 'UTF-8',
			tl: request.targetLang,
			q: request.text.slice(0, 200), // Limitar longitud
			client: 'gtx',
			total: 1,
			idx: 0,
			ttsspeed: 1,
		});

		const url = `https://translate.google.com/translate_tts?${params}`;

		fetch(url, {
			headers: {'Content-Type': 'audio/mpeg'},
		})
			.then((response) => response.blob())
			.then((blob) => {
				const reader = new FileReader();
				reader.onloadend = () => {
					// Guardar en caché
					audioCache.set(cacheKey, reader.result);
					if (audioCache.size > 100) {
						// Limpiar caché si es muy grande
						const firstKey = audioCache.keys().next().value;
						audioCache.delete(firstKey);
					}
					sendResponse({
						success: true,
						audioData: reader.result, // Esto será una URL base64
					});
				};
				reader.readAsDataURL(blob);
			})
			.catch((error) => {
				console.error('Error en síntesis:', error);
				sendResponse({success: false, error: error.message});
			});

		return true;
	}
});
