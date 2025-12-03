// EcoPrompt Coach - Popup JavaScript
// Environmental impact calculator for AI models + Prompt Optimizer + Prompt Library

// ========================================
// MODEL DATA AND IMPACT CALCULATOR
// ========================================

// Model data with performance benchmarks
const MODEL_DATA = {
  "gpt-4o": {
    name: "GPT-4o",
    provider: "OpenAI",
    host: "microsoft_azure",
    short: { energy: 0.421, latency: 0.35, tps: 150 },
    medium: { energy: 1.214, latency: 0.80, tps: 120 },
    long: { energy: 1.788, latency: 1.20, tps: 100 }
  },
  "gpt-4o-mini": {
    name: "GPT-4o mini",
    provider: "OpenAI",
    host: "microsoft_azure",
    short: { energy: 0.421, latency: 0.40, tps: 140 },
    medium: { energy: 1.418, latency: 0.90, tps: 110 },
    long: { energy: 2.106, latency: 1.35, tps: 90 }
  },
  "gpt-4.1-nano": {
    name: "GPT-4.1 nano",
    provider: "OpenAI",
    host: "microsoft_azure",
    short: { energy: 0.103, latency: 0.15, tps: 200 },
    medium: { energy: 0.271, latency: 0.30, tps: 180 },
    long: { energy: 0.454, latency: 0.50, tps: 160 }
  },
  "claude-3.7-sonnet": {
    name: "Claude 3.7 Sonnet",
    provider: "Anthropic",
    host: "aws",
    short: { energy: 0.836, latency: 0.60, tps: 130 },
    medium: { energy: 2.781, latency: 1.50, tps: 110 },
    long: { energy: 5.518, latency: 2.80, tps: 95 }
  },
  "deepseek-r1": {
    name: "DeepSeek R1",
    provider: "DeepSeek",
    host: "deepseek",
    short: { energy: 23.815, latency: 5.50, tps: 60 },
    medium: { energy: 29.000, latency: 6.80, tps: 55 },
    long: { energy: 33.634, latency: 8.00, tps: 50 }
  },
  "llama-3.3-70b": {
    name: "LLaMA 3.3 70B",
    provider: "Meta",
    host: "aws",
    short: { energy: 0.247, latency: 0.25, tps: 170 },
    medium: { energy: 0.857, latency: 0.70, tps: 140 },
    long: { energy: 1.646, latency: 1.30, tps: 120 }
  },
  "llama-3.2-1b": {
    name: "LLaMA 3.2 1B",
    provider: "Meta",
    host: "aws",
    short: { energy: 0.070, latency: 0.08, tps: 250 },
    medium: { energy: 0.218, latency: 0.18, tps: 220 },
    long: { energy: 0.342, latency: 0.30, tps: 200 }
  },
  "gemini-2.0-flash": {
    name: "Gemini 2.0 Flash",
    provider: "Google",
    host: "google_cloud",
    short: { energy: 0.095, latency: 0.12, tps: 180 },
    medium: { energy: 0.285, latency: 0.35, tps: 160 },
    long: { energy: 0.520, latency: 0.65, tps: 145 }
  },
  "gemini-1.5-flash": {
    name: "Gemini 1.5 Flash",
    provider: "Google",
    host: "google_cloud",
    short: { energy: 0.115, latency: 0.16, tps: 165 },
    medium: { energy: 0.340, latency: 0.45, tps: 145 },
    long: { energy: 0.625, latency: 0.80, tps: 130 }
  },
  "gemini-1.5-pro": {
    name: "Gemini 1.5 Pro",
    provider: "Google",
    host: "google_cloud",
    short: { energy: 0.580, latency: 0.48, tps: 135 },
    medium: { energy: 1.850, latency: 1.20, tps: 115 },
    long: { energy: 3.420, latency: 2.10, tps: 100 }
  }
};

// Infrastructure multipliers
const INFRASTRUCTURE = {
  microsoft_azure: { pue: 1.12, wue_onsite: 0.30, wue_offsite: 3.142, cif: 0.3528 },
  aws: { pue: 1.14, wue_onsite: 0.18, wue_offsite: 3.142, cif: 0.385 },
  deepseek: { pue: 1.27, wue_onsite: 1.20, wue_offsite: 6.016, cif: 0.6 },
  google_cloud: { pue: 1.10, wue_onsite: 0.25, wue_offsite: 3.142, cif: 0.32 }
};

// Helper function to get query category
function getQueryCategory(inputTokens, outputTokens) {
  const totalTokens = inputTokens + outputTokens;
  if (totalTokens <= 500) return 'short';
  if (totalTokens <= 2500) return 'medium';
  return 'long';
}

// Interpolate energy based on token count
function interpolateEnergy(model, inputTokens, outputTokens) {
  const category = getQueryCategory(inputTokens, outputTokens);
  return model[category].energy;
}

// Calculate environmental impact for a single model
function calculateImpact(modelId, inputTokens, outputTokens) {
  const model = MODEL_DATA[modelId];
  if (!model) throw new Error('Model not found');

  const infrastructure = INFRASTRUCTURE[model.host];

  // Energy (Wh)
  const energyWh = interpolateEnergy(model, inputTokens, outputTokens);

  // Water (mL)
  const waterMl = (energyWh / infrastructure.pue) * infrastructure.wue_onsite +
                   energyWh * infrastructure.wue_offsite;

  // Carbon (gCO2e)
  const carbonGco2e = energyWh * infrastructure.cif;

  return {
    energy: energyWh,
    water: waterMl,
    carbon: carbonGco2e,
    model: model.name,
    provider: model.provider
  };
}

// Calculate average impact across all models, weighted by task type
function calculateAverageImpact(promptText) {
  if (!promptText || promptText.trim().length === 0) {
    return null;
  }

  // Estimate tokens and detect task type
  const baseInputTokens = estimateTokens(promptText);
  const taskType = detectTaskType(promptText);

  // Apply task-specific multipliers
  const inputTokens = Math.round(baseInputTokens * taskType.inputMultiplier);

  // Estimate output tokens based on task type (using a baseline of 300 tokens)
  const baseOutputTokens = 300;
  const outputTokens = Math.round(baseOutputTokens * taskType.outputMultiplier);

  // Calculate impact for all models
  const impacts = [];
  for (const modelId of Object.keys(MODEL_DATA)) {
    const impact = calculateImpact(modelId, inputTokens, outputTokens);
    impacts.push(impact);
  }

  // Calculate averages
  const avgEnergy = impacts.reduce((sum, i) => sum + i.energy, 0) / impacts.length;
  const avgWater = impacts.reduce((sum, i) => sum + i.water, 0) / impacts.length;
  const avgCarbon = impacts.reduce((sum, i) => sum + i.carbon, 0) / impacts.length;

  // Apply task-specific energy multiplier
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

// Get relatable comparisons
function getComparisons(impact) {
  return {
    energy: formatEnergyComparison(impact.energy),
    water: formatWaterComparison(impact.water),
    carbon: formatCarbonComparison(impact.carbon)
  };
}

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

// Calculate eco-efficiency score (0-100, higher is better)
function calculateEcoScore(modelId, inputTokens, outputTokens) {
  const impact = calculateImpact(modelId, inputTokens, outputTokens);

  // Best and worst case scenarios for normalization
  const bestEnergy = 0.070; // LLaMA 3.2 1B short query
  const worstEnergy = 33.634; // DeepSeek R1 long query

  // Normalize to 0-100 scale (inverted, so lower energy = higher score)
  const score = Math.max(0, Math.min(100,
    100 - ((impact.energy - bestEnergy) / (worstEnergy - bestEnergy)) * 100
  ));

  return Math.round(score);
}

// Get optimization suggestions
function getOptimizationSuggestions(modelId, inputTokens, outputTokens) {
  const currentImpact = calculateImpact(modelId, inputTokens, outputTokens);
  const suggestions = [];

  // Suggest more efficient models
  const efficientModels = ['llama-3.2-1b', 'gemini-2.0-flash', 'gpt-4.1-nano'];
  for (const altModelId of efficientModels) {
    if (altModelId !== modelId) {
      const altImpact = calculateImpact(altModelId, inputTokens, outputTokens);
      const savings = ((currentImpact.energy - altImpact.energy) / currentImpact.energy) * 100;

      if (savings > 10) {
        suggestions.push({
          title: `Switch to ${MODEL_DATA[altModelId].name}`,
          description: `More energy-efficient model with similar capabilities`,
          savings: savings.toFixed(1)
        });
      }
    }
  }

  // Suggest reducing output tokens
  if (outputTokens > 300) {
    const reducedImpact = calculateImpact(modelId, inputTokens, Math.floor(outputTokens * 0.7));
    const savings = ((currentImpact.energy - reducedImpact.energy) / currentImpact.energy) * 100;

    suggestions.push({
      title: 'Reduce output length',
      description: `Request shorter responses to save ${savings.toFixed(1)}% energy`,
      savings: savings.toFixed(1)
    });
  }

  // Suggest caching/reusing prompts
  suggestions.push({
    title: 'Cache frequently used prompts',
    description: 'Save and reuse prompts to avoid redundant queries',
    savings: '100'
  });

  return suggestions.slice(0, 3);
}

function displayResults(impact, comparisons, ecoScore, suggestions) {
  // Show results section
  const resultsSection = document.getElementById('results');
  resultsSection.classList.remove('hidden');

  // Update values
  document.getElementById('energy-value').textContent = `${impact.energy.toFixed(3)} Wh`;
  document.getElementById('energy-comparison').textContent = comparisons.energy;

  document.getElementById('water-value').textContent = `${impact.water.toFixed(2)} mL`;
  document.getElementById('water-comparison').textContent = comparisons.water;

  document.getElementById('carbon-value').textContent = `${impact.carbon.toFixed(3)} gCO2e`;
  document.getElementById('carbon-comparison').textContent = comparisons.carbon;

  // Update eco score
  const scoreFill = document.getElementById('score-fill');
  const scoreText = document.getElementById('score-text');
  scoreFill.style.width = `${ecoScore}%`;

  let scoreLabel = 'Poor';
  if (ecoScore >= 80) scoreLabel = 'Excellent';
  else if (ecoScore >= 60) scoreLabel = 'Good';
  else if (ecoScore >= 40) scoreLabel = 'Fair';

  scoreText.textContent = `${ecoScore}/100 - ${scoreLabel}`;

  // Display suggestions
  const suggestionsSection = document.getElementById('suggestions');
  const suggestionsList = document.getElementById('suggestions-list');

  if (suggestions.length > 0) {
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

  // Scroll to results
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========================================
// PROMPT ANALYZER (from promptAnalyzer.js)
// ========================================

// Token counting using approximation
function estimateTokens(text) {
  if (!text || text.trim().length === 0) return 0;

  const words = text.trim().split(/\s+/).length;
  const specialChars = (text.match(/[.,!?;:()[\]{}"'-]/g) || []).length;
  const estimatedTokens = Math.ceil(words / 0.75 + specialChars * 0.5);

  return estimatedTokens;
}

// Polite words and phrases that add tokens without value
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

// Task type detection with token multipliers
const TASK_TYPES = {
  IMAGE_GENERATION: {
    keywords: ['generate image', 'create image', 'draw', 'illustrate', 'picture of', 'photo of', 'dall-e', 'midjourney', 'stable diffusion'],
    inputMultiplier: 1.2,   // Image prompts use more input tokens
    outputMultiplier: 0.3,  // But produce minimal text output
    energyMultiplier: 3.0,  // Image generation is much more energy intensive
    displayName: 'Image Generation'
  },
  AGENTIC_TASK: {
    keywords: ['research', 'analyze multiple', 'compare sources', 'investigate', 'browse', 'search for', 'find information', 'autonomous', 'agent'],
    inputMultiplier: 1.5,   // Agentic tasks have complex prompts
    outputMultiplier: 2.5,  // And generate extensive outputs
    energyMultiplier: 2.0,  // Multiple model calls
    displayName: 'Agentic/Research Task'
  },
  CODE_GENERATION: {
    keywords: ['write code', 'create function', 'implement', 'debug', 'program', 'script', 'algorithm'],
    inputMultiplier: 1.0,
    outputMultiplier: 1.5,  // Code outputs can be lengthy
    energyMultiplier: 1.2,
    displayName: 'Code Generation'
  },
  CREATIVE_WRITING: {
    keywords: ['write story', 'poem', 'essay', 'article', 'creative', 'blog post', 'narrative'],
    inputMultiplier: 1.0,
    outputMultiplier: 2.0,  // Creative content is typically long
    energyMultiplier: 1.3,
    displayName: 'Creative Writing'
  },
  DATA_ANALYSIS: {
    keywords: ['analyze data', 'analyze this', 'examine', 'interpret', 'statistics', 'trends', 'insights'],
    inputMultiplier: 1.3,   // May include data in prompt
    outputMultiplier: 1.5,
    energyMultiplier: 1.4,
    displayName: 'Data Analysis'
  },
  TEXT_SUMMARIZATION: {
    keywords: ['summarize', 'summary', 'tldr', 'brief overview', 'key points', 'condense'],
    inputMultiplier: 1.2,   // Often includes full text to summarize
    outputMultiplier: 0.4,  // Output is short
    energyMultiplier: 0.7,
    displayName: 'Summarization'
  },
  TRANSLATION: {
    keywords: ['translate', 'translation', 'in spanish', 'in french', 'in german', 'to english'],
    inputMultiplier: 1.0,
    outputMultiplier: 1.0,
    energyMultiplier: 0.6,
    displayName: 'Translation'
  },
  QUESTION_ANSWERING: {
    keywords: ['what is', 'how to', 'why', 'when', 'where', 'who', 'explain', 'tell me about', 'describe'],
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
    if (config.keywords.length === 0) continue; // Skip GENERAL

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

  // Task-specific optimization tips
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

  // Remove polite phrases
  if (analysis.politeWords.found.length > 0) {
    for (const polite of analysis.politeWords.found) {
      const pattern = POLITE_PHRASES.find(p => p.word === polite.phrase)?.pattern;
      if (pattern) {
        optimized = optimized.replace(pattern, '').trim();
        // Clean up extra spaces
        optimized = optimized.replace(/\s+/g, ' ');
      }
    }
  }

  return optimized;
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

  // Add event listeners
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
  // Simple notification - could be enhanced
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
// MAIN INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      // Update buttons
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabName}-tab`) {
          content.classList.add('active');
        }
      });

      // Load library if switching to library tab
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

  // Real-time token counting and task detection for Impact tab
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
        alert('Unable to calculate impact. Please enter a valid prompt.');
        return;
      }

      const comparisons = getComparisons(impact);

      // Calculate eco score based on average (using a representative model)
      const ecoScore = Math.round(100 - ((impact.energy - 0.070) / (33.634 - 0.070)) * 100);
      const finalScore = Math.max(0, Math.min(100, ecoScore));

      // Get suggestions (simplified without specific model)
      const suggestions = [
        {
          title: 'Use Efficient Models',
          description: 'Choose lightweight models like GPT-4o mini, Gemini Flash, or LLaMA for simple tasks',
          savings: '70'
        },
        {
          title: `Optimize for ${impact.taskType}`,
          description: `This task type has a ${impact.taskMultiplier}x energy multiplier`,
          savings: Math.round((1 - 1/impact.taskMultiplier) * 100)
        },
        {
          title: 'Reduce Token Usage',
          description: 'Remove unnecessary words and use concise prompts',
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

  // Real-time token counter
  promptInput.addEventListener('input', () => {
    const tokens = estimateTokens(promptInput.value);
    tokenCount.textContent = tokens;
  });

  // Analyze prompt
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

    // Display stats
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

    // Display tips
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

    // Show optimized prompt if there are improvements
    if (analysis.politeWords.totalTokensSaved > 0) {
      const optimized = generateOptimizedPrompt(analysis.originalText, analysis);
      optimizedCard.classList.remove('hidden');
      optimizedText.textContent = optimized;

      // Store optimized for later use
      optimizedCard.dataset.optimizedPrompt = optimized;
      optimizedCard.dataset.tokens = analysis.optimizedTokenEstimate;
      optimizedCard.dataset.taskType = analysis.taskType;
      optimizedCard.dataset.taskTypeRaw = analysis.taskTypeRaw;
    } else {
      optimizedCard.classList.add('hidden');
    }

    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Copy optimized prompt
  document.getElementById('copy-optimized-btn').addEventListener('click', () => {
    const text = document.getElementById('optimized-prompt-text').textContent;
    navigator.clipboard.writeText(text);
    showNotification('Optimized prompt copied!');
  });

  // Save to library
  document.getElementById('save-to-library-btn').addEventListener('click', async () => {
    const card = document.querySelector('.optimized-prompt-card');
    const text = card.dataset.optimizedPrompt;
    const tokens = parseInt(card.dataset.tokens);
    const taskType = card.dataset.taskType;

    await promptLibrary.save({ text, tokens, taskType });
    showNotification('Saved to library!');
  });

  // Library actions
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
