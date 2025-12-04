// EcoPrompt Coach - Settings Page JavaScript

// Default settings
const DEFAULT_SETTINGS = {
  autoDetect: true,
  defaultModel: 'gpt-4o',
  showBadge: true,
  showBanner: true,
  showConfidence: true,
  liveCalculation: true,
  trackHistory: false
};

// Storage key
const SETTINGS_KEY = 'ecoprompt_settings';
const HISTORY_KEY = 'ecoprompt_history';

// Model data cache
let modelData = null;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
  // Load model data
  await loadModelData();

  // Populate model dropdown
  populateModelDropdown();

  // Load saved settings
  await loadSettings();

  // Set up event listeners
  setupEventListeners();
});

// ========================================
// DATA LOADING
// ========================================

async function loadModelData() {
  try {
    const response = await fetch('data/model_benchmarks.json');
    const data = await response.json();
    modelData = {};

    data.models.forEach(model => {
      modelData[model.model_id] = {
        name: model.name,
        provider: model.provider,
        sizeClass: model.size_class,
        shortEnergy: model.performance.short.energy_wh_mean
      };
    });
  } catch (error) {
    console.error('Error loading model data:', error);
  }
}

function populateModelDropdown() {
  const select = document.getElementById('default-model');
  select.innerHTML = '';

  if (!modelData) {
    select.innerHTML = '<option value="">Error loading models</option>';
    return;
  }

  // Group models by provider
  const providers = {};
  for (const [id, model] of Object.entries(modelData)) {
    if (!providers[model.provider]) {
      providers[model.provider] = [];
    }
    providers[model.provider].push({ id, ...model });
  }

  // Create optgroups
  for (const [provider, models] of Object.entries(providers)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = provider;

    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} (${model.sizeClass})`;
      optgroup.appendChild(option);
    });

    select.appendChild(optgroup);
  }
}

// ========================================
// SETTINGS MANAGEMENT
// ========================================

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      const settings = result[SETTINGS_KEY] || DEFAULT_SETTINGS;

      // Apply settings to UI
      document.getElementById('auto-detect-toggle').checked = settings.autoDetect;
      document.getElementById('default-model').value = settings.defaultModel;
      document.getElementById('show-badge').checked = settings.showBadge;
      document.getElementById('show-banner').checked = settings.showBanner;
      document.getElementById('show-confidence').checked = settings.showConfidence;
      document.getElementById('live-calculation').checked = settings.liveCalculation;
      document.getElementById('track-history').checked = settings.trackHistory;

      // Update model info display
      updateModelInfo(settings.defaultModel);

      // Update model select visibility
      updateModelSelectVisibility(settings.autoDetect);

      resolve(settings);
    });
  });
}

async function saveSettings() {
  const settings = {
    autoDetect: document.getElementById('auto-detect-toggle').checked,
    defaultModel: document.getElementById('default-model').value,
    showBadge: document.getElementById('show-badge').checked,
    showBanner: document.getElementById('show-banner').checked,
    showConfidence: document.getElementById('show-confidence').checked,
    liveCalculation: document.getElementById('live-calculation').checked,
    trackHistory: document.getElementById('track-history').checked
  };

  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
      // Notify content scripts of settings change
      chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });
      resolve();
    });
  });
}

function resetToDefaults() {
  document.getElementById('auto-detect-toggle').checked = DEFAULT_SETTINGS.autoDetect;
  document.getElementById('default-model').value = DEFAULT_SETTINGS.defaultModel;
  document.getElementById('show-badge').checked = DEFAULT_SETTINGS.showBadge;
  document.getElementById('show-banner').checked = DEFAULT_SETTINGS.showBanner;
  document.getElementById('show-confidence').checked = DEFAULT_SETTINGS.showConfidence;
  document.getElementById('live-calculation').checked = DEFAULT_SETTINGS.liveCalculation;
  document.getElementById('track-history').checked = DEFAULT_SETTINGS.trackHistory;

  updateModelInfo(DEFAULT_SETTINGS.defaultModel);
  updateModelSelectVisibility(DEFAULT_SETTINGS.autoDetect);
}

// ========================================
// UI UPDATES
// ========================================

function updateModelInfo(modelId) {
  const infoDiv = document.getElementById('model-info');
  const model = modelData ? modelData[modelId] : null;

  if (model) {
    document.getElementById('model-provider').textContent = model.provider;
    document.getElementById('model-size').textContent = model.sizeClass;
    document.getElementById('model-energy').textContent = `${model.shortEnergy.toFixed(3)} Wh`;
    infoDiv.style.display = 'block';
  } else {
    infoDiv.style.display = 'none';
  }
}

function updateModelSelectVisibility(autoDetect) {
  const container = document.getElementById('model-select-container');
  container.style.opacity = autoDetect ? '0.6' : '1';
}

function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.style.background = type === 'success' ? '#4caf50' : '#f44336';
  notification.style.display = 'block';

  setTimeout(() => {
    notification.style.display = 'none';
  }, 3000);
}

// ========================================
// HISTORY MANAGEMENT
// ========================================

async function clearHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([HISTORY_KEY], () => {
      showNotification('History cleared');
      resolve();
    });
  });
}

async function exportData() {
  const data = await new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY, HISTORY_KEY, 'ecoprompt_library'], (result) => {
      resolve(result);
    });
  });

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ecoprompt-data-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification('Data exported');
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
  // Auto-detect toggle
  document.getElementById('auto-detect-toggle').addEventListener('change', (e) => {
    updateModelSelectVisibility(e.target.checked);
  });

  // Model selection change
  document.getElementById('default-model').addEventListener('change', (e) => {
    updateModelInfo(e.target.value);
  });

  // Save button
  document.getElementById('save-settings').addEventListener('click', async () => {
    await saveSettings();
    showNotification('Settings saved!');
  });

  // Reset button
  document.getElementById('reset-defaults').addEventListener('click', () => {
    if (confirm('Reset all settings to defaults?')) {
      resetToDefaults();
      showNotification('Settings reset to defaults');
    }
  });

  // Clear history button
  document.getElementById('clear-history').addEventListener('click', async () => {
    if (confirm('Clear all history data? This cannot be undone.')) {
      await clearHistory();
    }
  });

  // Export data button
  document.getElementById('export-data').addEventListener('click', exportData);
}
