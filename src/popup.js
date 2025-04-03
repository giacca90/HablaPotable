document.addEventListener('DOMContentLoaded', () => {
	const langSelect = document.getElementById('targetLang');
	const volumeControl = document.getElementById('volume');
	const speedControl = document.getElementById('speed');
	const volumeValue = document.getElementById('volumeValue');
	const speedValue = document.getElementById('speedValue');
	const subtitleStatus = document.getElementById('subtitleStatus');
	const toggleButton = document.getElementById('toggleButton');
	const currentPage = document.getElementById('currentPage');

	// Cargar configuraciones guardadas
	chrome.storage.sync.get(['targetLanguage', 'volume', 'speed', 'isEnabled'], (data) => {
		if (data.targetLanguage) langSelect.value = data.targetLanguage;
		if (data.volume) volumeControl.value = data.volume;
		if (data.speed) speedControl.value = data.speed;

		volumeValue.textContent = `${volumeControl.value}%`;
		speedValue.textContent = `${(speedControl.value / 100).toFixed(1)}x`;

		// Establecer estado del botón
		const isEnabled = data.isEnabled ?? true;
		updateToggleButton(isEnabled);
	});

	// Mostrar página actual
	chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
		const url = new URL(tabs[0].url);
		currentPage.textContent = `Página actual: ${url.hostname}`;

		chrome.tabs.sendMessage(tabs[0].id, {action: 'checkSubtitles'}, (response) => {
			if (response && response.hasSubtitles) {
				subtitleStatus.textContent = '✅ Subtítulos detectados';
				subtitleStatus.className = 'status active';
			} else {
				subtitleStatus.textContent = '❌ No se detectaron subtítulos';
				subtitleStatus.className = 'status inactive';
			}
		});
	});

	// Manejar toggle de lectura
	toggleButton.addEventListener('click', () => {
		chrome.storage.sync.get(['isEnabled'], (data) => {
			const newState = !(data.isEnabled ?? true);
			chrome.storage.sync.set({isEnabled: newState});
			updateToggleButton(newState);
		});
	});

	function updateToggleButton(isEnabled) {
		toggleButton.textContent = isEnabled ? 'Desactivar lectura' : 'Activar lectura';
		toggleButton.classList.toggle('disabled', !isEnabled);
	}

	// Event listeners
	langSelect.addEventListener('change', (e) => {
		chrome.storage.sync.set({targetLanguage: e.target.value});
	});

	volumeControl.addEventListener('input', (e) => {
		const value = e.target.value;
		volumeValue.textContent = `${value}%`;
		chrome.storage.sync.set({volume: value});
	});

	speedControl.addEventListener('input', (e) => {
		const value = e.target.value / 100;
		speedValue.textContent = `${value.toFixed(1)}x`;
		chrome.storage.sync.set({speed: e.target.value});
	});
});
