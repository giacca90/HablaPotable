// Agregar caché al inicio del archivo
const audioCache = new Map();

// Añadir función de reintento
async function retryOperation(operation, maxRetries = 3, delay = 500) {
	let lastError;

	for (let i = 0; i < maxRetries; i++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			console.warn(`Intento ${i + 1}/${maxRetries} fallido:`, error);
			if (i < maxRetries - 1) {
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}
	throw lastError;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'translate') {
		const translateOperation = async () => {
			const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${request.targetLang}&dt=t&q=${encodeURIComponent(request.text)}`;

			const response = await fetch(url, {
				method: 'GET',
				credentials: 'omit',
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status} \n ${response.text}`);
			}

			const data = await response.json();
			if (!data || !Array.isArray(data[0]) || !data[0][0]) {
				throw new Error('Formato de respuesta inválido');
			}

			return data[0][0][0];
		};

		retryOperation(translateOperation)
			.then((text) => sendResponse({success: true, text}))
			.catch((error) =>
				sendResponse({
					success: false,
					error: `Error de traducción después de reintentos: ${error.message}`,
				}),
			);

		return true;
	}

	if (request.action === 'synthesize') {
		const cacheKey = `${request.text}_${request.targetLang}`;

		if (audioCache.has(cacheKey)) {
			sendResponse({
				success: true,
				audioData: audioCache.get(cacheKey),
			});
			return true;
		}

		const synthesizeOperation = async () => {
			const params = new URLSearchParams({
				ie: 'UTF-8',
				tl: request.targetLang,
				q: request.text.slice(0, 200),
				client: 'gtx',
				total: 1,
				idx: 0,
				ttsspeed: 1,
			});

			const url = `https://translate.google.com/translate_tts?${params}`;
			const response = await fetch(url, {
				headers: {
					'Content-Type': 'audio/mpeg',
					Accept: 'audio/mpeg',
				},
			});

			if (!response.ok) {
				const errorMessage = await response.text();
				throw new Error(`HTTP error! status: ${response.status} \n ${errorMessage}`);
			}

			const blob = await response.blob();
			if (blob.size === 0) {
				throw new Error('Audio blob vacío recibido');
			}

			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result);
				reader.onerror = () => reject(new Error('Error al leer el blob'));
				reader.readAsDataURL(blob);
			});
		};

		retryOperation(synthesizeOperation)
			.then((audioData) => {
				audioCache.set(cacheKey, audioData);
				if (audioCache.size > 100) {
					const firstKey = audioCache.keys().next().value;
					audioCache.delete(firstKey);
				}
				sendResponse({success: true, audioData});
			})
			.catch((error) =>
				sendResponse({
					success: false,
					error: `Error de síntesis después de reintentos: ${error.message}`,
				}),
			);

		return true;
	}
});
