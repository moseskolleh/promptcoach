// EcoPrompt Coach - Popup JavaScript
// Environmental impact calculator with research-based data

// ========================================
// SETTINGS & STATE
// ========================================

const SETTINGS_KEY = 'ecoprompt_settings';
const HISTORY_KEY = 'ecoprompt_history';

let settings = {
  autoDetect: true,
  defaultModel: 'gpt-4o',
  showBadge: true,
  showBanner: true,
  showConfidence: true,
  liveCalculation: true,
  trackHistory: false
};

let currentModel = null;
let liveCalculationTimeout = null;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
  // Load settings
  await loadSettings();

  // Load calculator data
  if (typeof EcoPromptCalculator !== 'undefined') {
    await EcoPromptCalculator.loadData();
    populateModelDropdown();
  }

  // Detect current website and set model
  detectCurrentSite();

  // Set up event listeners
  setupEventListeners();

  // Initialize library tab
  renderLibrary();
});

// ========================================
// SETTINGS
// ========================================

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      if (result[SETTINGS_KEY]) {
        settings = { ...settings, ...result[SETTINGS_KEY] };
      }
      resolve(settings);
    });
  });
}

// ========================================
// MODEL SELECTION
// ========================================

function populateModelDropdown() {
  const select = document.getElementById('model-select');
  if (!select || typeof EcoPromptCalculator === 'undefined') return;

  // Keep auto-detect option
  select.innerHTML = '<option value="auto">Auto-detect</option>';

  const models = EcoPromptCalculator.getAvailableModels();
  if (!models || models.length === 0) return;

  // Group by provider
  const providers = {};
  models.forEach(model => {
    if (!providers[model.provider]) {
      providers[model.provider] = [];
    }
    providers[model.provider].push(model);
  });

  // Create optgroups
  for (const [provider, providerModels] of Object.entries(providers)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = provider;

    providerModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name} (${model.sizeClass})`;
      optgroup.appendChild(option);
    });

    select.appendChild(optgroup);
  }

  // Set saved default if not auto-detect
  if (!settings.autoDetect && settings.defaultModel) {
    select.value = settings.defaultModel;
    currentModel = settings.defaultModel;
    updateModelStatus(`Using: ${getModelName(settings.defaultModel)}`);
  }
}

function getModelName(modelId) {
  if (typeof EcoPromptCalculator === 'undefined') return modelId;
  const models = EcoPromptCalculator.getAvailableModels();
  const model = models.find(m => m.id === modelId);
  return model ? model.name : modelId;
}

function detectCurrentSite() {
  // Get current tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      try {
        const url = new URL(tabs[0].url);
        const hostname = url.hostname;

        if (settings.autoDetect && typeof EcoPromptCalculator !== 'undefined') {
          const detectedModel = EcoPromptCalculator.autoDetectModel(hostname);
          if (detectedModel) {
            currentModel = detectedModel;
            updateModelStatus(`Detected: ${getModelName(detectedModel)}`);
            document.getElementById('model-select').value = 'auto';
          } else {
            currentModel = settings.defaultModel;
            updateModelStatus(`Default: ${getModelName(settings.defaultModel)}`);
          }
        }
      } catch (e) {
        currentModel = settings.defaultModel;
        updateModelStatus(`Default: ${getModelName(settings.defaultModel)}`);
      }
    }
  });
}

function updateModelStatus(message) {
  const statusEl = document.getElementById('model-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
  // Settings button
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Model selection
  document.getElementById('model-select')?.addEventListener('change', (e) => {
    if (e.target.value === 'auto') {
      detectCurrentSite();
    } else {
      currentModel = e.target.value;
      updateModelStatus(`Using: ${getModelName(e.target.value)}`);
    }
  });

  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabName}-tab`) {
          content.classList.add('active');
        }
      });

      if (tabName === 'library') {
        renderLibrary();
      }
    });
  });

  // Impact Calculator
  const impactPromptInput = document.getElementById('impact-prompt-input');
  const calculateBtn = document.getElementById('calculate-btn');

  impactPromptInput?.addEventListener('input', () => {
    updatePromptInfo();

    // Live calculation if enabled
    if (settings.liveCalculation) {
      clearTimeout(liveCalculationTimeout);
      liveCalculationTimeout = setTimeout(() => {
        if (impactPromptInput.value.trim().length > 20) {
          calculateImpact();
        }
      }, 800);
    }
  });

  calculateBtn?.addEventListener('click', calculateImpact);

  // Prompt Optimizer
  const promptInput = document.getElementById('prompt-input');
  const analyzeBtn = document.getElementById('analyze-btn');
  const tokenCount = document.getElementById('token-count');

  promptInput?.addEventListener('input', () => {
    if (typeof EcoPromptAnalyzer !== 'undefined') {
      const tokens = EcoPromptAnalyzer.estimateTokens(promptInput.value);
      tokenCount.textContent = tokens;
    }
  });

  analyzeBtn?.addEventListener('click', analyzePrompt);

  // Optimizer buttons
  document.getElementById('copy-optimized-btn')?.addEventListener('click', () => {
    const text = document.getElementById('optimized-prompt-text').textContent;
    navigator.clipboard.writeText(text);
    showNotification('Optimized prompt copied!');
  });

  document.getElementById('save-to-library-btn')?.addEventListener('click', async () => {
    const card = document.querySelector('.optimized-prompt-card');
    const text = card.dataset.optimizedPrompt;
    const tokens = parseInt(card.dataset.tokens);
    const taskType = card.dataset.taskType;

    await promptLibrary.save({ text, tokens, taskType });
    showNotification('Saved to library!');
  });

  // Library buttons
  document.getElementById('add-prompt-btn')?.addEventListener('click', () => {
    const text = prompt('Enter prompt to save:');
    if (text && text.trim()) {
      const tokens = typeof EcoPromptAnalyzer !== 'undefined'
        ? EcoPromptAnalyzer.estimateTokens(text)
        : Math.ceil(text.split(/\s+/).length / 0.75);
      const taskType = typeof EcoPromptAnalyzer !== 'undefined'
        ? EcoPromptAnalyzer.detectTaskType(text).displayName
        : 'General';
      promptLibrary.save({ text: text.trim(), tokens, taskType }).then(() => {
        renderLibrary();
        showNotification('Prompt added!');
      });
    }
  });

  document.getElementById('clear-library-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all saved prompts?')) {
      promptLibrary.clear().then(() => {
        renderLibrary();
        showNotification('Library cleared');
      });
    }
  });
}

// ========================================
// PROMPT INFO UPDATE
// ========================================

function updatePromptInfo() {
  const text = document.getElementById('impact-prompt-input')?.value || '';

  if (typeof EcoPromptAnalyzer !== 'undefined') {
    const tokens = EcoPromptAnalyzer.estimateTokens(text);
    const taskType = EcoPromptAnalyzer.detectTaskType(text);
    const outputEstimate = EcoPromptAnalyzer.estimateOutputTokens(taskType.type, tokens);

    document.getElementById('impact-token-count').textContent = tokens;
    document.getElementById('impact-task-type').textContent = taskType.displayName;
    document.getElementById('impact-output-estimate').textContent = `~${outputEstimate.estimated}`;
  } else {
    // Fallback
    const words = text.trim().split(/\s+/).length;
    const tokens = Math.ceil(words / 0.75);
    document.getElementById('impact-token-count').textContent = tokens;
    document.getElementById('impact-task-type').textContent = '-';
    document.getElementById('impact-output-estimate').textContent = '~300';
  }
}

// ========================================
// IMPACT CALCULATION
// ========================================

function calculateImpact() {
  const promptText = document.getElementById('impact-prompt-input')?.value?.trim();

  if (!promptText) {
    return;
  }

  if (typeof EcoPromptCalculator === 'undefined' || typeof EcoPromptAnalyzer === 'undefined') {
    alert('Error: Calculator not loaded. Please reload the extension.');
    return;
  }

  // Analyze prompt
  const tokens = EcoPromptAnalyzer.estimateTokens(promptText);
  const taskType = EcoPromptAnalyzer.detectTaskType(promptText);
  const outputEstimate = EcoPromptAnalyzer.estimateOutputTokens(taskType.type, tokens);

  let impact;
  const modelId = currentModel || settings.defaultModel;

  if (modelId && modelId !== 'auto') {
    // Calculate for specific model
    impact = EcoPromptCalculator.calculateImpact(
      modelId,
      tokens,
      outputEstimate.estimated,
      taskType.energyMultiplier
    );
  } else {
    // Calculate average across all models
    impact = EcoPromptCalculator.calculateAverageImpact(
      tokens,
      outputEstimate.estimated,
      taskType.energyMultiplier
    );
  }

  if (!impact) {
    alert('Error calculating impact. Please try again.');
    return;
  }

  // Get comparisons
  const comparisons = {
    energy: EcoPromptCalculator.formatEnergyComparison(impact.energy.wh),
    water: EcoPromptCalculator.formatWaterComparison(impact.water.ml),
    carbon: EcoPromptCalculator.formatCarbonComparison(impact.carbon.gCO2e)
  };

  // Calculate eco score
  const ecoScore = EcoPromptCalculator.calculateEcoScore(impact.energy.wh);
  const scoreLabel = EcoPromptCalculator.getScoreLabel(ecoScore);

  // Generate suggestions
  const suggestions = generateSuggestions(impact, taskType);

  // Display results
  displayResults(impact, comparisons, ecoScore, scoreLabel, suggestions);

  // Track history if enabled
  if (settings.trackHistory) {
    trackQuery(impact, promptText);
  }
}

function generateSuggestions(impact, taskType) {
  const suggestions = [];

  // Model efficiency suggestion
  if (impact.energy.wh > 1) {
    suggestions.push({
      title: 'Use Efficient Models',
      description: 'GPT-4o mini, Gemini Flash, or Claude 3.5 Haiku can handle most tasks with 70% less energy',
      savings: '70'
    });
  }

  // Task-specific suggestion
  if (taskType.energyMultiplier > 1) {
    suggestions.push({
      title: `Optimize for ${taskType.displayName}`,
      description: `This task type uses ${taskType.energyMultiplier}x energy. Consider simplifying or breaking into smaller requests.`,
      savings: Math.round((1 - 1/taskType.energyMultiplier) * 100).toString()
    });
  }

  // Token reduction suggestion
  if (impact.tokens && impact.tokens.input > 200) {
    suggestions.push({
      title: 'Reduce Token Usage',
      description: 'Remove unnecessary context and polite phrases to save energy',
      savings: '30'
    });
  }

  return suggestions;
}

// ========================================
// DISPLAY RESULTS
// ========================================

function displayResults(impact, comparisons, ecoScore, scoreLabel, suggestions) {
  const resultsSection = document.getElementById('results');
  resultsSection.classList.remove('hidden');

  // Energy
  document.getElementById('energy-value').textContent = `${impact.energy.wh.toFixed(3)} Wh`;
  document.getElementById('energy-comparison').textContent = comparisons.energy;

  // Confidence interval
  const confidenceEl = document.getElementById('energy-confidence');
  if (confidenceEl && settings.showConfidence && impact.energy.confidenceInterval) {
    confidenceEl.textContent = `Range: ${impact.energy.confidenceInterval.minWh.toFixed(3)} - ${impact.energy.confidenceInterval.maxWh.toFixed(3)} Wh`;
    confidenceEl.style.display = 'block';
  } else if (confidenceEl) {
    confidenceEl.style.display = 'none';
  }

  // Water
  document.getElementById('water-value').textContent = `${impact.water.ml.toFixed(2)} mL`;
  document.getElementById('water-comparison').textContent = comparisons.water;

  // Carbon
  document.getElementById('carbon-value').textContent = `${impact.carbon.gCO2e.toFixed(3)} gCO2e`;
  document.getElementById('carbon-comparison').textContent = comparisons.carbon;

  // Eco Score
  const scoreFill = document.getElementById('score-fill');
  const scoreText = document.getElementById('score-text');
  scoreFill.style.width = `${ecoScore}%`;
  scoreText.textContent = `${ecoScore}/100 - ${scoreLabel}`;

  // Suggestions
  const suggestionsSection = document.getElementById('suggestions');
  const suggestionsList = document.getElementById('suggestions-list');

  if (suggestions && suggestions.length > 0) {
    suggestionsSection.classList.remove('hidden');
    suggestionsList.innerHTML = '';

    suggestions.forEach(suggestion => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerHTML = `
        <h4>${suggestion.title}</h4>
        <p>${suggestion.description}</p>
        <p class="savings">💚 Save up to ${suggestion.savings}% energy</p>
      `;
      suggestionsList.appendChild(item);
    });
  } else {
    suggestionsSection.classList.add('hidden');
  }

  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========================================
// PROMPT ANALYSIS
// ========================================

function analyzePrompt() {
  const text = document.getElementById('prompt-input')?.value?.trim();
  if (!text) {
    alert('Please enter a prompt to analyze');
    return;
  }

  if (typeof EcoPromptAnalyzer === 'undefined') {
    alert('Error: Analyzer not loaded. Please reload the extension.');
    return;
  }

  const analysis = EcoPromptAnalyzer.analyzePrompt(text);
  displayAnalysis(analysis);
}

function displayAnalysis(analysis) {
  const resultsSection = document.getElementById('analysis-results');
  const statsDiv = document.getElementById('analysis-stats');
  const tipsDiv = document.getElementById('optimization-tips');
  const optimizedCard = document.querySelector('.optimized-prompt-card');
  const optimizedText = document.getElementById('optimized-prompt-text');

  resultsSection.classList.remove('hidden');

  statsDiv.innerHTML = `
    <div class="stat-item">
      <div class="stat-label">Tokens</div>
      <div class="stat-value">${analysis.tokens}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Task Type</div>
      <div class="stat-value">${analysis.taskType}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Optimized</div>
      <div class="stat-value">${analysis.optimizedTokenEstimate}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Savings</div>
      <div class="stat-value">${analysis.tokens - analysis.optimizedTokenEstimate}</div>
    </div>
  `;

  if (analysis.tips.length > 0) {
    tipsDiv.innerHTML = analysis.tips.map(tip => `
      <div class="tip-item">
        <div class="tip-title">${tip.title}</div>
        <div class="tip-description">${tip.description}</div>
        <div class="tip-impact">💡 ${tip.impact}</div>
      </div>
    `).join('');
  } else {
    tipsDiv.innerHTML = '<p style="color: #4caf50;">✅ Your prompt is already well-optimized!</p>';
  }

  if (analysis.politeWords.totalTokensSaved > 0) {
    const optimized = EcoPromptAnalyzer.generateOptimizedPrompt(analysis.originalText, analysis);
    optimizedCard.classList.remove('hidden');
    optimizedText.textContent = optimized;

    optimizedCard.dataset.optimizedPrompt = optimized;
    optimizedCard.dataset.tokens = analysis.optimizedTokenEstimate;
    optimizedCard.dataset.taskType = analysis.taskType;
    optimizedCard.dataset.taskTypeRaw = analysis.taskTypeRaw;
  } else {
    optimizedCard.classList.add('hidden');
  }

  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========================================
// HISTORY TRACKING
// ========================================

async function trackQuery(impact, promptText) {
  const history = await getHistory();
  const entry = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    model: currentModel || 'average',
    tokens: impact.tokens?.total || 0,
    energy: impact.energy.wh,
    water: impact.water.ml,
    carbon: impact.carbon.gCO2e,
    promptPreview: promptText.substring(0, 50)
  };

  history.push(entry);

  // Keep last 1000 entries
  if (history.length > 1000) {
    history.shift();
  }

  chrome.storage.local.set({ [HISTORY_KEY]: history });
}

async function getHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_KEY], (result) => {
      resolve(result[HISTORY_KEY] || []);
    });
  });
}

// ========================================
// PROMPT LIBRARY
// ========================================

class PromptLibrary {
  constructor() {
    this.storageKey = 'ecoprompt_library';
  }

  async getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        resolve(result[this.storageKey] || []);
      });
    });
  }

  async save(prompt) {
    const prompts = await this.getAll();
    const newPrompt = {
      id: Date.now(),
      text: prompt.text,
      tokens: prompt.tokens,
      taskType: prompt.taskType,
      createdAt: new Date().toISOString(),
      title: prompt.title || this.generateTitle(prompt.text)
    };
    prompts.unshift(newPrompt);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: prompts }, () => {
        resolve(newPrompt);
      });
    });
  }

  async delete(id) {
    const prompts = await this.getAll();
    const filtered = prompts.filter(p => p.id !== id);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: filtered }, resolve);
    });
  }

  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: [] }, resolve);
    });
  }

  generateTitle(text) {
    const maxLength = 50;
    const trimmed = text.trim().substring(0, maxLength);
    return trimmed.length < text.trim().length ? trimmed + '...' : trimmed;
  }
}

const promptLibrary = new PromptLibrary();

async function renderLibrary() {
  const prompts = await promptLibrary.getAll();
  const listElement = document.getElementById('library-list');

  if (!listElement) return;

  if (prompts.length === 0) {
    listElement.innerHTML = '<p class="empty-state">No saved prompts yet. Start by analyzing a prompt and saving it!</p>';
    return;
  }

  listElement.innerHTML = prompts.map(prompt => `
    <div class="library-item" data-id="${prompt.id}">
      <div class="library-item-header">
        <div>
          <div class="library-item-title">${prompt.title}</div>
          <div class="library-item-meta">${new Date(prompt.createdAt).toLocaleDateString()}</div>
        </div>
        <div class="library-item-actions">
          <button class="icon-btn copy-prompt" title="Copy">📋</button>
          <button class="icon-btn delete-prompt" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="library-item-prompt">${prompt.text}</div>
      <div class="library-item-stats">
        <span>🔤 ${prompt.tokens} tokens</span>
        <span>📁 ${prompt.taskType}</span>
      </div>
    </div>
  `).join('');

  listElement.querySelectorAll('.copy-prompt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.closest('.library-item').dataset.id);
      const prompt = prompts.find(p => p.id === id);
      if (prompt) {
        navigator.clipboard.writeText(prompt.text);
        showNotification('Prompt copied to clipboard!');
      }
    });
  });

  listElement.querySelectorAll('.delete-prompt').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.closest('.library-item').dataset.id);
      await promptLibrary.delete(id);
      renderLibrary();
      showNotification('Prompt deleted');
    });
  });
}

// ========================================
// NOTIFICATIONS
// ========================================

function showNotification(message) {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #4caf50;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000;
    font-size: 14px;
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 2000);
}
