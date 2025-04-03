const API_KEY = 'TU_API_KEY'; // Registrarse en https://www.voicerss.org/

export async function textToSpeech(text, lang) {
	const url = `https://api.voicerss.org/?key=${API_KEY}&hl=${lang}&src=${encodeURIComponent(text)}`;
	return url;
}
