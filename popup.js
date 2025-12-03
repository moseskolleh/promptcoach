// EcoPrompt Coach - Popup JavaScript
// Environmental impact calculator with research-based data

// ========================================
// DATA LOADING
// ========================================

let MODEL_DATA = null;
let INFRASTRUCTURE = null;
let CONVERSIONS = null;

// Load data from JSON files
async function loadData() {
  try {
    const [modelsResponse, infraResponse, conversionsResponse] = await Promise.all([
      fetch(chrome.runtime.getURL('data/model_benchmarks.json')),
      fetch(chrome.runtime.getURL('data/infrastructure.json')),
      fetch(chrome.runtime.getURL('data/conversion_factors.json'))
    ]);

    const modelsData = await modelsResponse.json();
    const infraData = await infraResponse.json();
    const conversionsData = await conversionsResponse.json();

    // Transform model data for easier access
    MODEL_DATA = {};
    modelsData.models.forEach(model => {
      MODEL_DATA[model.model_id] = {
        name: model.name,
        provider: model.provider,
        host: model.host.toLowerCase().replace(' ', '_'),
        short: {
          energy: model.performance.short.energy_wh_mean,
          latency: model.performance.short.latency_p50,
          tps: model.performance.short.tps_p50
        },
        medium: {
          energy: model.performance.medium.energy_wh_mean,
          latency: model.performance.medium.latency_p50,
          tps: model.performance.medium.tps_p50
        },
        long: {
          energy: model.performance.long.energy_wh_mean,
          latency: model.performance.long.latency_p50,
          tps: model.performance.long.tps_p50
        }
      };
    });

    // Transform infrastructure data
    INFRASTRUCTURE = {};
    for (const [key, value] of Object.entries(infraData.providers)) {
      INFRASTRUCTURE[key] = {
        pue: value.pue,
        wue_onsite: value.wue_onsite_l_per_kwh,
        wue_offsite: value.wue_offsite_l_per_kwh,
        cif: value.cif_kgco2e_per_kwh
      };
    }

    CONVERSIONS = conversionsData;

    return true;
  } catch (error) {
    console.error('Error loading data:', error);
    return false;
  }
}

// ========================================
// TOKEN ESTIMATION
// ========================================

function estimateTokens(text) {
  if (!text || text.trim().length === 0) return 0;
  const words = text.trim().split(/\s+/).length;
  const specialChars = (text.match(/[.,!?;:()[\]{}"'-]/g) || []).length;
  return Math.ceil(words / 0.75 + specialChars * 0.5);
}

// ========================================
// TASK TYPE DETECTION
// ========================================

const TASK_TYPES = {
  IMAGE_GENERATION: {
    keywords: ['generate image', 'create image', 'draw', 'illustrate', 'picture of', 'photo of', 'dall-e', 'midjourney', 'stable diffusion', 'image of'],
    inputMultiplier: 1.2,
    outputMultiplier: 0.3,
    energyMultiplier: 3.0,
    displayName: 'Image Generation'
  },
  AGENTIC_TASK: {
    keywords: ['research', 'analyze multiple', 'compare sources', 'investigate', 'browse', 'search for', 'find information', 'autonomous', 'agent', 'multi-step'],
    inputMultiplier: 1.5,
    outputMultiplier: 2.5,
    energyMultiplier: 2.0,
    displayName: 'Agentic/Research Task'
  },
  CODE_GENERATION: {
    keywords: ['write code', 'create function', 'implement', 'debug', 'program', 'script', 'algorithm', 'refactor', 'fix bug'],
    inputMultiplier: 1.0,
    outputMultiplier: 1.5,
    energyMultiplier: 1.2,
    displayName: 'Code Generation'
  },
  CREATIVE_WRITING: {
    keywords: ['write story', 'poem', 'essay', 'article', 'creative', 'blog post', 'narrative', 'fiction', 'novel'],
    inputMultiplier: 1.0,
    outputMultiplier: 2.0,
    energyMultiplier: 1.3,
    displayName: 'Creative Writing'
  },
  DATA_ANALYSIS: {
    keywords: ['analyze data', 'analyze this', 'examine', 'interpret', 'statistics', 'trends', 'insights', 'dashboard'],
    inputMultiplier: 1.3,
    outputMultiplier: 1.5,
    energyMultiplier: 1.4,
    displayName: 'Data Analysis'
  },
  TEXT_SUMMARIZATION: {
    keywords: ['summarize', 'summary', 'tldr', 'brief overview', 'key points', 'condense', 'excerpt'],
    inputMultiplier: 1.2,
    outputMultiplier: 0.4,
    energyMultiplier: 0.7,
    displayName: 'Summarization'
  },
  TRANSLATION: {
    keywords: ['translate', 'translation', 'in spanish', 'in french', 'in german', 'to english', 'language'],
    inputMultiplier: 1.0,
    outputMultiplier: 1.0,
    energyMultiplier: 0.6,
    displayName: 'Translation'
  },
  QUESTION_ANSWERING: {
    keywords: ['what is', 'how to', 'why', 'when', 'where', 'who', 'explain', 'tell me about', 'describe', 'define'],
    inputMultiplier: 0.8,
    outputMultiplier: 1.0,
    energyMultiplier: 0.8,
    displayName: 'Q&A'
  },
  GENERAL: {
    keywords: [],
    inputMultiplier: 1.0,
    outputMultiplier: 1.0,
    energyMultiplier: 1.0,
    displayName: 'General'
  }
};

function detectTaskType(text) {
  const lowerText = text.toLowerCase();
  let detectedType = 'GENERAL';
  let maxScore = 0;

  for (const [type, config] of Object.entries(TASK_TYPES)) {
    if (config.keywords.length === 0) continue;

    let score = 0;
    for (const keyword of config.keywords) {
      if (lowerText.includes(keyword)) {
        score += 2;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      detectedType = type;
    }
  }

  const taskConfig = TASK_TYPES[detectedType];
  return {
    type: detectedType,
    displayName: taskConfig.displayName,
    confidence: maxScore,
    inputMultiplier: taskConfig.inputMultiplier,
    outputMultiplier: taskConfig.outputMultiplier,
    energyMultiplier: taskConfig.energyMultiplier
  };
}

// ========================================
// IMPACT CALCULATION
// ========================================

function getQueryCategory(inputTokens, outputTokens) {
  const totalTokens = inputTokens + outputTokens;
  if (totalTokens <= 500) return 'short';
  if (totalTokens <= 2500) return 'medium';
  return 'long';
}

function interpolateEnergy(model, inputTokens, outputTokens) {
  const category = getQueryCategory(inputTokens, outputTokens);
  return model[category].energy;
}

function calculateImpact(modelId, inputTokens, outputTokens) {
  if (!MODEL_DATA || !INFRASTRUCTURE) return null;

  const model = MODEL_DATA[modelId];
  if (!model) return null;

  const infrastructure = INFRASTRUCTURE[model.host];
  if (!infrastructure) return null;

  const energyWh = interpolateEnergy(model, inputTokens, outputTokens);

  // Water (convert L/kWh to mL/Wh)
  const energyKwh = energyWh / 1000;
  const waterMl = (energyKwh / infrastructure.pue) * infrastructure.wue_onsite * 1000 +
                   energyKwh * infrastructure.wue_offsite * 1000;

  // Carbon (convert kgCO2e/kWh to gCO2e/Wh)
  const carbonGco2e = energyKwh * infrastructure.cif * 1000;

  return {
    energy: energyWh,
    water: waterMl,
    carbon: carbonGco2e,
    model: model.name,
    provider: model.provider
  };
}

function calculateAverageImpact(promptText) {
  if (!promptText || promptText.trim().length === 0 || !MODEL_DATA) {
    return null;
  }

  const baseInputTokens = estimateTokens(promptText);
  const taskType = detectTaskType(promptText);

  const inputTokens = Math.round(baseInputTokens * taskType.inputMultiplier);
  const baseOutputTokens = 300;
  const outputTokens = Math.round(baseOutputTokens * taskType.outputMultiplier);

  const impacts = [];
  for (const modelId of Object.keys(MODEL_DATA)) {
    const impact = calculateImpact(modelId, inputTokens, outputTokens);
    if (impact) impacts.push(impact);
  }

  if (impacts.length === 0) return null;

  const avgEnergy = impacts.reduce((sum, i) => sum + i.energy, 0) / impacts.length;
  const avgWater = impacts.reduce((sum, i) => sum + i.water, 0) / impacts.length;
  const avgCarbon = impacts.reduce((sum, i) => sum + i.carbon, 0) / impacts.length;

  const finalEnergy = avgEnergy * taskType.energyMultiplier;
  const finalWater = avgWater * taskType.energyMultiplier;
  const finalCarbon = avgCarbon * taskType.energyMultiplier;

  return {
    energy: finalEnergy,
    water: finalWater,
    carbon: finalCarbon,
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    totalTokens: inputTokens + outputTokens,
    taskType: taskType.displayName,
    taskMultiplier: taskType.energyMultiplier
  };
}

// ========================================
// COMPARISONS
// ========================================

function formatEnergyComparison(wh) {
  if (wh < 1) {
    const minutes = Math.round(wh * 60);
    return `${minutes} minutes of LED lightbulb`;
  } else if (wh < 10) {
    const percent = ((wh / 10) * 100).toFixed(1);
    return `${percent}% of smartphone charge`;
  } else {
    const minutes = Math.round((wh / 130) * 60);
    return `${minutes} minutes of 65" TV`;
  }
}

function formatWaterComparison(ml) {
  if (ml < 50) {
    const drops = Math.round(ml);
    return `~${drops} drops of water`;
  } else if (ml < 250) {
    const percent = ((ml / 250) * 100).toFixed(1);
    return `${percent}% of a coffee cup`;
  } else {
    const cups = (ml / 250).toFixed(2);
    return `${cups} coffee cups`;
  }
}

function formatCarbonComparison(gco2e) {
  if (gco2e < 1) {
    const meters = ((gco2e / 200) * 1000).toFixed(1);
    return `Driving ${meters} meters`;
  } else if (gco2e < 100) {
    const meters = Math.round((gco2e / 200) * 1000);
    return `Driving ${meters} meters`;
  } else {
    const km = (gco2e / 200).toFixed(2);
    return `Driving ${km} kilometers`;
  }
}

function getComparisons(impact) {
  return {
    energy: formatEnergyComparison(impact.energy),
    water: formatWaterComparison(impact.water),
    carbon: formatCarbonComparison(impact.carbon)
  };
}

// ========================================
// POLITE WORDS DETECTION
// ========================================

const POLITE_PHRASES = [
  { pattern: /\bplease\b/gi, word: 'please', tokens: 1 },
  { pattern: /\bthank you\b/gi, word: 'thank you', tokens: 2 },
  { pattern: /\bthanks\b/gi, word: 'thanks', tokens: 1 },
  { pattern: /\bkindly\b/gi, word: 'kindly', tokens: 1 },
  { pattern: /\bcould you\b/gi, word: 'could you', tokens: 2 },
  { pattern: /\bwould you\b/gi, word: 'would you', tokens: 2 },
  { pattern: /\bcan you\b/gi, word: 'can you', tokens: 2 },
  { pattern: /\bi would like\b/gi, word: 'I would like', tokens: 3 },
  { pattern: /\bsorry\b/gi, word: 'sorry', tokens: 1 },
];

function detectPoliteWords(text) {
  const found = [];
  let totalTokensSaved = 0;

  for (const phrase of POLITE_PHRASES) {
    const matches = text.match(phrase.pattern);
    if (matches) {
      const count = matches.length;
      found.push({
        phrase: phrase.word,
        count: count,
        tokensSaved: phrase.tokens * count,
        example: matches[0]
      });
      totalTokensSaved += phrase.tokens * count;
    }
  }

  return { found, totalTokensSaved };
}

// ========================================
// OPTIMIZATION TIPS
// ========================================

function getOptimizationTips(politeWords, taskType, tokens) {
  const tips = [];

  if (politeWords.totalTokensSaved > 0) {
    tips.push({
      type: 'polite_words',
      title: 'Remove Polite Phrases',
      description: `Found ${politeWords.found.length} polite phrase(s) that can be removed without affecting quality`,
      impact: `Save ~${politeWords.totalTokensSaved} tokens`,
      priority: 'high'
    });
  }

  if (taskType.type === 'IMAGE_GENERATION') {
    tips.push({
      type: 'task_specific',
      title: 'Image Generation Optimization',
      description: 'Image generation uses 3x more energy. Be specific with style, colors, and composition to avoid regeneration.',
      impact: 'Reduce energy usage significantly',
      priority: 'high'
    });
  } else if (taskType.type === 'AGENTIC_TASK') {
    tips.push({
      type: 'task_specific',
      title: 'Agentic Task Warning',
      description: 'Research/agentic tasks use 2x more energy due to multiple model calls. Be specific to minimize iterations.',
      impact: 'Reduce multi-call overhead',
      priority: 'high'
    });
  } else if (taskType.type === 'QUESTION_ANSWERING' && tokens > 200) {
    tips.push({
      type: 'task_specific',
      title: 'Simplify Question',
      description: 'Simple questions work better when kept concise and direct.',
      impact: 'Faster response',
      priority: 'high'
    });
  }

  if (tokens > 500) {
    tips.push({
      type: 'length',
      title: 'Consider Shorter Prompt',
      description: 'Long prompts can be less effective. Focus on key requirements.',
      impact: `Target: ~${Math.floor(tokens * 0.7)} tokens`,
      priority: 'medium'
    });
  }

  return tips;
}

function analyzePrompt(text) {
  if (!text || text.trim().length === 0) return null;

  const tokens = estimateTokens(text);
  const taskType = detectTaskType(text);
  const politeWords = detectPoliteWords(text);
  const tips = getOptimizationTips(politeWords, taskType, tokens);

  return {
    originalText: text,
    tokens: tokens,
    taskType: taskType.displayName,
    taskTypeRaw: taskType.type,
    politeWords: politeWords,
    tips: tips,
    optimizedTokenEstimate: tokens - politeWords.totalTokensSaved
  };
}

function generateOptimizedPrompt(originalText, analysis) {
  let optimized = originalText;

  if (analysis.politeWords.found.length > 0) {
    for (const polite of analysis.politeWords.found) {
      const pattern = POLITE_PHRASES.find(p => p.word === polite.phrase)?.pattern;
      if (pattern) {
        optimized = optimized.replace(pattern, '').trim();
        optimized = optimized.replace(/\s+/g, ' ');
      }
    }
  }

  return optimized;
}

// ========================================
// DISPLAY FUNCTIONS
// ========================================

function displayResults(impact, comparisons, ecoScore, suggestions) {
  const resultsSection = document.getElementById('results');
  resultsSection.classList.remove('hidden');

  document.getElementById('energy-value').textContent = `${impact.energy.toFixed(3)} Wh`;
  document.getElementById('energy-comparison').textContent = comparisons.energy;

  document.getElementById('water-value').textContent = `${impact.water.toFixed(2)} mL`;
  document.getElementById('water-comparison').textContent = comparisons.water;

  document.getElementById('carbon-value').textContent = `${impact.carbon.toFixed(3)} gCO2e`;
  document.getElementById('carbon-comparison').textContent = comparisons.carbon;

  const scoreFill = document.getElementById('score-fill');
  const scoreText = document.getElementById('score-text');
  scoreFill.style.width = `${ecoScore}%`;

  let scoreLabel = 'Poor';
  if (ecoScore >= 80) scoreLabel = 'Excellent';
  else if (ecoScore >= 60) scoreLabel = 'Good';
  else if (ecoScore >= 40) scoreLabel = 'Fair';

  scoreText.textContent = `${ecoScore}/100 - ${scoreLabel}`;

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
  }

  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
  // Load data first
  const dataLoaded = await loadData();

  if (!dataLoaded) {
    alert('Error loading environmental data. Please reload the extension.');
    return;
  }

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
  const calculateBtn = document.getElementById('calculate-btn');
  const impactPromptInput = document.getElementById('impact-prompt-input');
  const impactTaskType = document.getElementById('impact-task-type');
  const impactTokenCount = document.getElementById('impact-token-count');

  impactPromptInput.addEventListener('input', () => {
    const text = impactPromptInput.value;
    if (text.trim()) {
      const tokens = estimateTokens(text);
      const taskType = detectTaskType(text);
      impactTokenCount.textContent = tokens;
      impactTaskType.textContent = taskType.displayName;
    } else {
      impactTokenCount.textContent = '0';
      impactTaskType.textContent = '-';
    }
  });

  calculateBtn.addEventListener('click', () => {
    try {
      const promptText = impactPromptInput.value.trim();

      if (!promptText) {
        alert('Please enter a prompt to analyze');
        return;
      }

      const impact = calculateAverageImpact(promptText);
      if (!impact) {
        alert('Unable to calculate impact. Please try again.');
        return;
      }

      const comparisons = getComparisons(impact);
      const ecoScore = Math.round(100 - ((impact.energy - 0.070) / (33.634 - 0.070)) * 100);
      const finalScore = Math.max(0, Math.min(100, ecoScore));

      const suggestions = [
        {
          title: 'Use Efficient Models',
          description: 'Choose lightweight models like GPT-4o mini, Gemini Flash, or LLaMA 3.2 for simple tasks',
          savings: '70'
        },
        {
          title: `Optimize for ${impact.taskType}`,
          description: `This task type has a ${impact.taskMultiplier}x energy multiplier. Consider if a simpler approach would work.`,
          savings: Math.max(0, Math.round((1 - 1/impact.taskMultiplier) * 100))
        },
        {
          title: 'Reduce Token Usage',
          description: 'Remove unnecessary words and use concise prompts to save energy',
          savings: '30'
        }
      ];

      displayResults(impact, comparisons, finalScore, suggestions);
    } catch (error) {
      console.error('Calculation error:', error);
      alert('Error calculating impact. Please try again.');
    }
  });

  // Prompt Optimizer
  const promptInput = document.getElementById('prompt-input');
  const tokenCount = document.getElementById('token-count');
  const analyzeBtn = document.getElementById('analyze-btn');

  promptInput.addEventListener('input', () => {
    const tokens = estimateTokens(promptInput.value);
    tokenCount.textContent = tokens;
  });

  analyzeBtn.addEventListener('click', () => {
    const text = promptInput.value.trim();
    if (!text) {
      alert('Please enter a prompt to analyze');
      return;
    }

    const analysis = analyzePrompt(text);
    displayAnalysis(analysis);
  });

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
      const optimized = generateOptimizedPrompt(analysis.originalText, analysis);
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

  document.getElementById('copy-optimized-btn').addEventListener('click', () => {
    const text = document.getElementById('optimized-prompt-text').textContent;
    navigator.clipboard.writeText(text);
    showNotification('Optimized prompt copied!');
  });

  document.getElementById('save-to-library-btn').addEventListener('click', async () => {
    const card = document.querySelector('.optimized-prompt-card');
    const text = card.dataset.optimizedPrompt;
    const tokens = parseInt(card.dataset.tokens);
    const taskType = card.dataset.taskType;

    await promptLibrary.save({ text, tokens, taskType });
    showNotification('Saved to library!');
  });

  document.getElementById('add-prompt-btn').addEventListener('click', () => {
    const text = prompt('Enter prompt to save:');
    if (text && text.trim()) {
      const tokens = estimateTokens(text);
      const taskTypeInfo = detectTaskType(text);
      promptLibrary.save({ text: text.trim(), tokens, taskType: taskTypeInfo.displayName }).then(() => {
        renderLibrary();
        showNotification('Prompt added!');
      });
    }
  });

  document.getElementById('clear-library-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all saved prompts?')) {
      promptLibrary.clear().then(() => {
        renderLibrary();
        showNotification('Library cleared');
      });
    }
  });
});
