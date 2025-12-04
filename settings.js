// EcoPrompt Coach - Settings Page JavaScript

// Default settings
const DEFAULT_SETTINGS = {
  autoDetect: true,
  defaultModel: 'gpt-4o',
  showBadge: true,
  showBanner: true,
  showConfidence: true,
  liveCalculation: true,
  trackHistory: false,
  userRegion: 'default',
  taskMultipliers: {
    IMAGE_GENERATION: 3.0,
    AGENTIC_TASK: 2.0,
    CODE_GENERATION: 1.2,
    CREATIVE_WRITING: 1.3,
    DATA_ANALYSIS: 1.4,
    TEXT_SUMMARIZATION: 0.7,
    TRANSLATION: 0.6,
    QUESTION_ANSWERING: 0.8,
    GENERAL: 1.0
  }
};

const TASK_TYPE_INFO = {
  IMAGE_GENERATION: { name: 'Image Generation', desc: 'DALL-E, Midjourney, etc.', high: true },
  AGENTIC_TASK: { name: 'Agentic/Research', desc: 'Multi-step tasks, browsing', high: true },
  CODE_GENERATION: { name: 'Code Generation', desc: 'Writing and debugging code', high: false },
  CREATIVE_WRITING: { name: 'Creative Writing', desc: 'Stories, poems, essays', high: false },
  DATA_ANALYSIS: { name: 'Data Analysis', desc: 'Statistics, trends', high: false },
  TEXT_SUMMARIZATION: { name: 'Summarization', desc: 'Key points extraction', high: false },
  TRANSLATION: { name: 'Translation', desc: 'Language translation', high: false },
  QUESTION_ANSWERING: { name: 'Q&A', desc: 'Simple questions', high: false },
  GENERAL: { name: 'General', desc: 'Default multiplier', high: false }
};

const REGIONS = {
  'default': { name: 'Global Average', cif: 0.45 },
  'us-west': { name: 'US West (California)', cif: 0.25 },
  'us-east': { name: 'US East (Virginia)', cif: 0.35 },
  'us-central': { name: 'US Central (Texas)', cif: 0.40 },
  'europe-west': { name: 'Europe West (Netherlands)', cif: 0.30 },
  'europe-north': { name: 'Europe North (Sweden)', cif: 0.05 },
  'asia-east': { name: 'Asia East (Japan)', cif: 0.45 },
  'asia-south': { name: 'Asia South (India)', cif: 0.70 },
  'china': { name: 'China', cif: 0.60 },
  'australia': { name: 'Australia', cif: 0.65 },
  'brazil': { name: 'Brazil', cif: 0.10 }
};

// Storage keys
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

  // Render task multipliers
  renderMultipliers();

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
        shortEnergy: model.performance.short.energy_wh_mean,
        dataSource: model.data_source || 'measured'
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
      const sourceIndicator = model.dataSource === 'extrapolated' ? ' *' : '';
      option.textContent = `${model.name} (${model.sizeClass})${sourceIndicator}`;
      optgroup.appendChild(option);
    });

    select.appendChild(optgroup);
  }
}

function renderMultipliers() {
  const container = document.getElementById('multipliers-list');
  if (!container) return;

  container.innerHTML = '';

  for (const [type, info] of Object.entries(TASK_TYPE_INFO)) {
    const defaultValue = DEFAULT_SETTINGS.taskMultipliers[type];
    const div = document.createElement('div');
    div.className = `multiplier-item ${info.high ? 'multiplier-high' : ''}`;
    div.innerHTML = `
      <div class="multiplier-info">
        <div class="multiplier-name">${info.name}</div>
        <div class="multiplier-desc">${info.desc}</div>
      </div>
      <input type="number" class="multiplier-input"
             id="multiplier-${type}"
             value="${defaultValue}"
             min="0.1" max="10" step="0.1">
    `;
    container.appendChild(div);
  }
}

// ========================================
// SETTINGS MANAGEMENT
// ========================================

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      const settings = { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };

      // Apply settings to UI
      document.getElementById('auto-detect-toggle').checked = settings.autoDetect;
      document.getElementById('default-model').value = settings.defaultModel;
      document.getElementById('show-badge').checked = settings.showBadge;
      document.getElementById('show-banner').checked = settings.showBanner;
      document.getElementById('show-confidence').checked = settings.showConfidence;
      document.getElementById('live-calculation').checked = settings.liveCalculation;
      document.getElementById('track-history').checked = settings.trackHistory;
      document.getElementById('user-region').value = settings.userRegion || 'default';

      // Apply multipliers
      if (settings.taskMultipliers) {
        for (const [type, value] of Object.entries(settings.taskMultipliers)) {
          const input = document.getElementById(`multiplier-${type}`);
          if (input) input.value = value;
        }
      }

      // Update model info display
      updateModelInfo(settings.defaultModel);

      // Update model select visibility
      updateModelSelectVisibility(settings.autoDetect);

      resolve(settings);
    });
  });
}

async function saveSettings() {
  // Collect multipliers
  const taskMultipliers = {};
  for (const type of Object.keys(TASK_TYPE_INFO)) {
    const input = document.getElementById(`multiplier-${type}`);
    if (input) {
      taskMultipliers[type] = parseFloat(input.value) || DEFAULT_SETTINGS.taskMultipliers[type];
    }
  }

  const settings = {
    autoDetect: document.getElementById('auto-detect-toggle').checked,
    defaultModel: document.getElementById('default-model').value,
    showBadge: document.getElementById('show-badge').checked,
    showBanner: document.getElementById('show-banner').checked,
    showConfidence: document.getElementById('show-confidence').checked,
    liveCalculation: document.getElementById('live-calculation').checked,
    trackHistory: document.getElementById('track-history').checked,
    userRegion: document.getElementById('user-region').value,
    taskMultipliers: taskMultipliers
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
  document.getElementById('user-region').value = 'default';

  // Reset multipliers
  for (const [type, value] of Object.entries(DEFAULT_SETTINGS.taskMultipliers)) {
    const input = document.getElementById(`multiplier-${type}`);
    if (input) input.value = value;
  }

  updateModelInfo(DEFAULT_SETTINGS.defaultModel);
  updateModelSelectVisibility(DEFAULT_SETTINGS.autoDetect);
}

function resetMultipliers() {
  for (const [type, value] of Object.entries(DEFAULT_SETTINGS.taskMultipliers)) {
    const input = document.getElementById(`multiplier-${type}`);
    if (input) input.value = value;
  }
  showNotification('Multipliers reset to defaults');
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
// HISTORY & EXPORT MANAGEMENT
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

  // Add metadata
  const exportData = {
    exportDate: new Date().toISOString(),
    version: '1.3.0',
    ...data
  };

  // Create and download JSON
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ecoprompt-data-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification('Data exported as JSON');
}

async function exportAsCSV() {
  const data = await new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_KEY], (result) => {
      resolve(result[HISTORY_KEY] || []);
    });
  });

  if (data.length === 0) {
    showNotification('No history data to export', 'error');
    return;
  }

  // Create CSV content
  const headers = ['Date', 'Model', 'Tokens', 'Energy (Wh)', 'Water (mL)', 'Carbon (gCO2e)', 'Prompt Preview'];
  const rows = data.map(entry => [
    entry.date,
    entry.model,
    entry.tokens,
    entry.energy?.toFixed(3) || '',
    entry.water?.toFixed(2) || '',
    entry.carbon?.toFixed(3) || '',
    `"${(entry.promptPreview || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  // Download CSV
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ecoprompt-history-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification('History exported as CSV');
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

  // Reset multipliers button
  document.getElementById('reset-multipliers')?.addEventListener('click', resetMultipliers);

  // Clear history button
  document.getElementById('clear-history').addEventListener('click', async () => {
    if (confirm('Clear all history data? This cannot be undone.')) {
      await clearHistory();
    }
  });

  // Export data button
  document.getElementById('export-data').addEventListener('click', exportData);
}
