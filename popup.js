// EcoPrompt Coach - Popup JavaScript
// Environmental impact calculator for AI models

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

// Calculate environmental impact
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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  const calculateBtn = document.getElementById('calculate-btn');
  const modelSelect = document.getElementById('model-select');
  const inputTokens = document.getElementById('input-tokens');
  const outputTokens = document.getElementById('output-tokens');

  calculateBtn.addEventListener('click', () => {
    try {
      const modelId = modelSelect.value;
      const input = parseInt(inputTokens.value);
      const output = parseInt(outputTokens.value);

      if (input < 1 || output < 1) {
        alert('Please enter valid token counts');
        return;
      }

      // Calculate impact
      const impact = calculateImpact(modelId, input, output);
      const comparisons = getComparisons(impact);
      const ecoScore = calculateEcoScore(modelId, input, output);
      const suggestions = getOptimizationSuggestions(modelId, input, output);

      // Display results
      displayResults(impact, comparisons, ecoScore, suggestions);
    } catch (error) {
      console.error('Calculation error:', error);
      alert('Error calculating impact. Please try again.');
    }
  });
});

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
