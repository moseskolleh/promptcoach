// EcoPrompt Coach - Shared Calculator Module
// Environmental impact calculations with interpolation

// ========================================
// DATA STORAGE
// ========================================

let MODEL_DATA = null;
let INFRASTRUCTURE = null;
let CONVERSIONS = null;

// ========================================
// DATA LOADING
// ========================================

/**
 * Load data from JSON files (for Chrome extension)
 * @returns {Promise<boolean>} True if data loaded successfully
 */
async function loadData() {
  try {
    const baseUrl = typeof chrome !== 'undefined' && chrome.runtime
      ? chrome.runtime.getURL('')
      : '';

    const [modelsResponse, infraResponse, conversionsResponse] = await Promise.all([
      fetch(`${baseUrl}data/model_benchmarks.json`),
      fetch(`${baseUrl}data/infrastructure.json`),
      fetch(`${baseUrl}data/conversion_factors.json`)
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
        host: model.host,
        hostKey: model.host.toLowerCase().replace(' ', '_'),
        sizeClass: model.size_class,
        gpuCount: model.gpu_count,
        criticalPowerKw: model.critical_power_kw,
        short: {
          energy: model.performance.short.energy_wh_mean,
          energyStd: model.performance.short.energy_wh_std,
          latency: model.performance.short.latency_p50,
          tps: model.performance.short.tps_p50
        },
        medium: {
          energy: model.performance.medium.energy_wh_mean,
          energyStd: model.performance.medium.energy_wh_std,
          latency: model.performance.medium.latency_p50,
          tps: model.performance.medium.tps_p50
        },
        long: {
          energy: model.performance.long.energy_wh_mean,
          energyStd: model.performance.long.energy_wh_std,
          latency: model.performance.long.latency_p50,
          tps: model.performance.long.tps_p50
        }
      };
    });

    // Transform infrastructure data
    INFRASTRUCTURE = {};
    for (const [key, value] of Object.entries(infraData.providers)) {
      INFRASTRUCTURE[key] = {
        name: value.name,
        pue: value.pue,
        wueOnsite: value.wue_onsite_l_per_kwh,
        wueOffsite: value.wue_offsite_l_per_kwh,
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

/**
 * Check if data is loaded
 * @returns {boolean} True if data is loaded
 */
function isDataLoaded() {
  return MODEL_DATA !== null && INFRASTRUCTURE !== null;
}

/**
 * Get list of available models
 * @returns {Array} Array of model objects with id and name
 */
function getAvailableModels() {
  if (!MODEL_DATA) return [];
  return Object.entries(MODEL_DATA).map(([id, data]) => ({
    id: id,
    name: data.name,
    provider: data.provider,
    sizeClass: data.sizeClass
  }));
}

// ========================================
// QUERY CATEGORY DETECTION
// ========================================

/**
 * Determine query category based on token counts
 * Categories from paper: short (400), medium (2000), long (11500)
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {string} Category: 'short', 'medium', or 'long'
 */
function getQueryCategory(inputTokens, outputTokens) {
  const totalTokens = inputTokens + outputTokens;
  if (totalTokens <= 500) return 'short';
  if (totalTokens <= 2500) return 'medium';
  return 'long';
}

// ========================================
// ENERGY INTERPOLATION
// ========================================

/**
 * Interpolate energy between categories for more accurate estimates
 * @param {Object} model - Model data object
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {Object} Interpolated energy with confidence interval
 */
function interpolateEnergy(model, inputTokens, outputTokens) {
  const totalTokens = inputTokens + outputTokens;

  // Category boundaries (from paper)
  const categories = {
    short: { tokens: 400, energy: model.short.energy, std: model.short.energyStd },
    medium: { tokens: 2000, energy: model.medium.energy, std: model.medium.energyStd },
    long: { tokens: 11500, energy: model.long.energy, std: model.long.energyStd }
  };

  let energy, energyStd;

  if (totalTokens <= categories.short.tokens) {
    // Below short: linear extrapolation from 0
    const ratio = totalTokens / categories.short.tokens;
    energy = categories.short.energy * ratio;
    energyStd = categories.short.std * ratio;
  } else if (totalTokens <= categories.medium.tokens) {
    // Between short and medium: linear interpolation
    const ratio = (totalTokens - categories.short.tokens) /
                  (categories.medium.tokens - categories.short.tokens);
    energy = categories.short.energy + ratio * (categories.medium.energy - categories.short.energy);
    energyStd = categories.short.std + ratio * (categories.medium.std - categories.short.std);
  } else if (totalTokens <= categories.long.tokens) {
    // Between medium and long: linear interpolation
    const ratio = (totalTokens - categories.medium.tokens) /
                  (categories.long.tokens - categories.medium.tokens);
    energy = categories.medium.energy + ratio * (categories.long.energy - categories.medium.energy);
    energyStd = categories.medium.std + ratio * (categories.long.std - categories.medium.std);
  } else {
    // Above long: linear extrapolation
    const ratio = totalTokens / categories.long.tokens;
    energy = categories.long.energy * ratio;
    energyStd = categories.long.std * ratio;
  }

  return {
    energy: energy,
    energyStd: energyStd,
    confidenceInterval: {
      min: Math.max(0, energy - energyStd),
      max: energy + energyStd
    }
  };
}

// ========================================
// IMPACT CALCULATION
// ========================================

/**
 * Calculate environmental impact for a specific model
 * @param {string} modelId - Model identifier
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {number} energyMultiplier - Task type energy multiplier (default 1.0)
 * @returns {Object|null} Impact data or null if model not found
 */
function calculateImpact(modelId, inputTokens, outputTokens, energyMultiplier = 1.0) {
  if (!MODEL_DATA || !INFRASTRUCTURE) return null;

  const model = MODEL_DATA[modelId];
  if (!model) return null;

  // Get infrastructure data
  const infraKey = model.hostKey;
  const infrastructure = INFRASTRUCTURE[infraKey];
  if (!infrastructure) return null;

  // Get interpolated energy
  const energyData = interpolateEnergy(model, inputTokens, outputTokens);

  // Apply task type multiplier
  const energyWh = energyData.energy * energyMultiplier;
  const energyKwh = energyWh / 1000;

  // Calculate water consumption
  // Formula: Water (L) = (E / PUE) × WUEsite + E × WUEsource
  const waterOnsite = (energyKwh / infrastructure.pue) * infrastructure.wueOnsite;
  const waterOffsite = energyKwh * infrastructure.wueOffsite;
  const waterL = waterOnsite + waterOffsite;
  const waterMl = waterL * 1000;

  // Calculate carbon emissions
  // Formula: Carbon (kgCO2e) = E × CIF
  const carbonKg = energyKwh * infrastructure.cif;
  const carbonG = carbonKg * 1000;

  return {
    model: {
      id: modelId,
      name: model.name,
      provider: model.provider,
      host: model.host,
      sizeClass: model.sizeClass
    },
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens
    },
    category: getQueryCategory(inputTokens, outputTokens),
    energy: {
      wh: energyWh,
      kwh: energyKwh,
      confidenceInterval: {
        minWh: Math.max(0, energyData.confidenceInterval.min * energyMultiplier),
        maxWh: energyData.confidenceInterval.max * energyMultiplier
      }
    },
    water: {
      ml: waterMl,
      l: waterL,
      breakdown: {
        onsiteMl: waterOnsite * 1000,
        offsiteMl: waterOffsite * 1000
      }
    },
    carbon: {
      gCO2e: carbonG,
      kgCO2e: carbonKg
    },
    multipliers: {
      energy: energyMultiplier,
      pue: infrastructure.pue,
      wueOnsite: infrastructure.wueOnsite,
      wueOffsite: infrastructure.wueOffsite,
      cif: infrastructure.cif
    }
  };
}

/**
 * Calculate average impact across all models
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {number} energyMultiplier - Task type energy multiplier
 * @returns {Object|null} Average impact data
 */
function calculateAverageImpact(inputTokens, outputTokens, energyMultiplier = 1.0) {
  if (!MODEL_DATA) return null;

  const impacts = [];
  for (const modelId of Object.keys(MODEL_DATA)) {
    const impact = calculateImpact(modelId, inputTokens, outputTokens, energyMultiplier);
    if (impact) impacts.push(impact);
  }

  if (impacts.length === 0) return null;

  const avgEnergy = impacts.reduce((sum, i) => sum + i.energy.wh, 0) / impacts.length;
  const avgWater = impacts.reduce((sum, i) => sum + i.water.ml, 0) / impacts.length;
  const avgCarbon = impacts.reduce((sum, i) => sum + i.carbon.gCO2e, 0) / impacts.length;

  const minEnergy = Math.min(...impacts.map(i => i.energy.wh));
  const maxEnergy = Math.max(...impacts.map(i => i.energy.wh));

  return {
    isAverage: true,
    modelCount: impacts.length,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens
    },
    energy: {
      wh: avgEnergy,
      kwh: avgEnergy / 1000,
      range: { minWh: minEnergy, maxWh: maxEnergy }
    },
    water: {
      ml: avgWater,
      l: avgWater / 1000
    },
    carbon: {
      gCO2e: avgCarbon,
      kgCO2e: avgCarbon / 1000
    },
    multiplier: energyMultiplier
  };
}

// ========================================
// COMPARISONS
// ========================================

/**
 * Format energy into relatable comparison with dual-layer display
 * Scientific conversion factors based on real-world measurements
 * @param {number} wh - Energy in watt-hours
 * @returns {string} Human-readable comparison for backwards compatibility
 * Use formatEnergyComparisonDetailed() for dual-layer display
 */
function formatEnergyComparison(wh) {
  const detailed = formatEnergyComparisonDetailed(wh);
  return detailed.primary;
}

/**
 * Format energy with dual-layer display (relatable + technical)
 * Conversion factors:
 * - Smartphone (0-100%): 15 Wh (iPhone 14 Pro: 14.2Wh, Samsung S23: 15.5Wh)
 * - LED bulb (10W): 10 Wh per hour
 * - Room lighting: 15 Wh per hour (typical LED room setup)
 * - Laptop: 50 Wh per hour (average usage)
 * @param {number} wh - Energy in watt-hours
 * @returns {Object} {primary: relatable metric, secondary: technical measurement}
 */
function formatEnergyComparisonDetailed(wh) {
  const SMARTPHONE_CHARGE = 15; // Wh for 0-100%
  const ROOM_LIGHT_HOUR = 15; // Wh per hour
  const LAPTOP_HOUR = 50; // Wh per hour

  let primary = '';
  let secondary = '';

  if (wh < 1) {
    const percent = ((wh / SMARTPHONE_CHARGE) * 100).toFixed(1);
    primary = `${percent}% smartphone charge`;
  } else if (wh < 15) {
    const phones = (wh / SMARTPHONE_CHARGE).toFixed(2);
    if (phones < 0.1) {
      const percent = ((wh / SMARTPHONE_CHARGE) * 100).toFixed(0);
      primary = `${percent}% of a smartphone charge`;
    } else {
      primary = `${phones} smartphone charge${parseFloat(phones) !== 1 ? 's' : ''}`;
    }
  } else if (wh < 50) {
    const hours = (wh / ROOM_LIGHT_HOUR).toFixed(1);
    primary = `Light a room for ${hours} hour${parseFloat(hours) !== 1 ? 's' : ''}`;
  } else {
    const hours = (wh / LAPTOP_HOUR).toFixed(1);
    primary = `Run a laptop for ${hours} hour${parseFloat(hours) !== 1 ? 's' : ''}`;
  }

  if (wh < 1) {
    secondary = `${wh.toFixed(3)} Wh`;
  } else if (wh < 1000) {
    secondary = `${wh.toFixed(2)} Wh`;
  } else {
    const kwh = (wh / 1000).toFixed(3);
    secondary = `${kwh} kWh`;
  }

  return { primary, secondary };
}

/**
 * Format water into relatable comparison for backwards compatibility
 * @param {number} ml - Water in milliliters
 * @returns {string} Human-readable comparison
 */
function formatWaterComparison(ml) {
  const detailed = formatWaterComparisonDetailed(ml);
  return detailed.primary;
}

/**
 * Format water with dual-layer display (relatable + technical)
 * Conversion factors:
 * - Shower (10 min): 100 liters (10L/min average flow)
 * - Dishwasher cycle: 15 liters (modern energy-efficient)
 * - Washing machine cycle: 50 liters (average load)
 * - Drinking glass: 250 ml
 * - Water bottle: 500 ml
 * @param {number} ml - Water in milliliters
 * @returns {Object} {primary: relatable metric, secondary: technical measurement}
 */
function formatWaterComparisonDetailed(ml) {
  const liters = ml / 1000;

  const GLASS = 0.25; // liters
  const BOTTLE = 0.5; // liters
  const DISHWASHER = 15; // liters
  const WASHING_MACHINE = 50; // liters
  const SHOWER_10MIN = 100; // liters

  let primary = '';
  let secondary = '';

  if (liters < GLASS) {
    const percent = ((ml / 250) * 100).toFixed(0);
    primary = `${percent}% of a drinking glass`;
  } else if (liters < 1) {
    const glasses = (liters / GLASS).toFixed(1);
    primary = `${glasses} drinking glass${parseFloat(glasses) !== 1 ? 'es' : ''}`;
  } else if (liters < 15) {
    const bottles = (liters / BOTTLE).toFixed(1);
    primary = `${bottles} water bottle${parseFloat(bottles) !== 1 ? 's' : ''}`;
  } else if (liters < 50) {
    const dishwashers = (liters / DISHWASHER).toFixed(1);
    primary = `${dishwashers} dishwasher cycle${parseFloat(dishwashers) !== 1 ? 's' : ''}`;
  } else if (liters < 100) {
    const washers = (liters / WASHING_MACHINE).toFixed(1);
    primary = `${washers} washing machine cycle${parseFloat(washers) !== 1 ? 's' : ''}`;
  } else {
    const showers = (liters / SHOWER_10MIN).toFixed(1);
    primary = `${showers} 10-minute shower${parseFloat(showers) !== 1 ? 's' : ''}`;
  }

  if (ml < 1000) {
    secondary = `${ml.toFixed(1)} mL`;
  } else if (liters < 1000) {
    secondary = `${liters.toFixed(2)} L`;
  } else {
    const m3 = (liters / 1000).toFixed(3);
    secondary = `${m3} m³`;
  }

  return { primary, secondary };
}

/**
 * Format carbon into relatable comparison for backwards compatibility
 * @param {number} gCO2e - Carbon in grams CO2 equivalent
 * @returns {string} Human-readable comparison
 */
function formatCarbonComparison(gCO2e) {
  const detailed = formatCarbonComparisonDetailed(gCO2e);
  return detailed.primary;
}

/**
 * Format carbon with dual-layer display (relatable + technical)
 * Conversion factors:
 * - Standard sedan: 180-200 g CO2e per km (EPA average for gas vehicles)
 * - Tree absorption: ~20 kg CO2e per year per mature tree
 * - Smartphone production: ~80 kg CO2e
 * @param {number} gCO2e - Carbon in grams CO2 equivalent
 * @returns {Object} {primary: relatable metric, secondary: technical measurement}
 */
function formatCarbonComparisonDetailed(gCO2e) {
  const CAR_G_PER_KM = 190; // g CO2e per km (average sedan)
  const TREE_KG_PER_YEAR = 20; // kg CO2e per year

  let primary = '';
  let secondary = '';

  const kgCO2e = gCO2e / 1000;

  if (gCO2e < 20) {
    const meters = Math.round((gCO2e / CAR_G_PER_KM) * 1000);
    primary = `Driving ${meters} meter${meters !== 1 ? 's' : ''} in a sedan`;
  } else if (gCO2e < 1000) {
    const km = (gCO2e / CAR_G_PER_KM).toFixed(2);
    primary = `Driving ${km} km in a standard sedan`;
  } else if (kgCO2e < 100) {
    const km = (gCO2e / CAR_G_PER_KM).toFixed(1);
    primary = `Driving ${km} km in a standard sedan`;
  } else {
    const treePercent = ((kgCO2e / TREE_KG_PER_YEAR) * 100).toFixed(1);
    primary = `${treePercent}% of yearly tree CO₂ absorption`;
  }

  if (gCO2e < 1000) {
    secondary = `${gCO2e.toFixed(2)} g CO₂e`;
  } else if (kgCO2e < 1000) {
    secondary = `${kgCO2e.toFixed(3)} kg CO₂e`;
  } else {
    const tonnes = (kgCO2e / 1000).toFixed(3);
    secondary = `${tonnes} tonnes CO₂e`;
  }

  return { primary, secondary };
}

/**
 * Get all comparisons for an impact
 * @param {Object} impact - Impact data object
 * @returns {Object} Comparisons for energy, water, and carbon
 */
function getComparisons(impact) {
  return {
    energy: formatEnergyComparison(impact.energy.wh),
    water: formatWaterComparison(impact.water.ml),
    carbon: formatCarbonComparison(impact.carbon.gCO2e)
  };
}

// ========================================
// ECO SCORE CALCULATION
// ========================================

/**
 * Calculate eco-efficiency score (0-100)
 * Higher is better (more efficient)
 * @param {number} energyWh - Energy in watt-hours
 * @returns {number} Score from 0-100
 */
function calculateEcoScore(energyWh) {
  // Range based on model data: 0.070 Wh (best) to 33.634 Wh (worst)
  const minEnergy = 0.070;  // LLaMA 3.2 1B short
  const maxEnergy = 33.634; // DeepSeek-R1 long

  // Logarithmic scale for better distribution
  const logMin = Math.log(minEnergy);
  const logMax = Math.log(maxEnergy);
  const logEnergy = Math.log(Math.max(energyWh, minEnergy));

  // Invert so lower energy = higher score
  const score = 100 - ((logEnergy - logMin) / (logMax - logMin)) * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get score label based on score value
 * @param {number} score - Eco score (0-100)
 * @returns {string} Score label
 */
function getScoreLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Poor';
  return 'Very Poor';
}

// ========================================
// MODEL COMPARISON
// ========================================

/**
 * Compare multiple models for the same query
 * @param {Array<string>} modelIds - Array of model IDs to compare
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {Object} Comparison results with recommendation
 */
function compareModels(modelIds, inputTokens, outputTokens) {
  const results = [];

  for (const modelId of modelIds) {
    const impact = calculateImpact(modelId, inputTokens, outputTokens);
    if (impact) {
      results.push({
        ...impact,
        ecoScore: calculateEcoScore(impact.energy.wh),
        comparisons: getComparisons(impact)
      });
    }
  }

  // Sort by energy (most efficient first)
  results.sort((a, b) => a.energy.wh - b.energy.wh);

  const best = results[0];
  const worst = results[results.length - 1];

  return {
    results: results,
    recommendation: best ? best.model.id : null,
    best: best,
    worst: worst,
    potentialSavings: best && worst ? {
      energyWh: worst.energy.wh - best.energy.wh,
      waterMl: worst.water.ml - best.water.ml,
      carbonG: worst.carbon.gCO2e - best.carbon.gCO2e,
      percentage: Math.round(((worst.energy.wh - best.energy.wh) / worst.energy.wh) * 100)
    } : null
  };
}

// ========================================
// AUTO-DETECT MODEL FROM WEBSITE
// ========================================

/**
 * Auto-detect model based on website hostname
 * @param {string} hostname - Website hostname
 * @returns {string|null} Suggested model ID or null
 */
function autoDetectModel(hostname) {
  const modelMap = {
    'chatgpt.com': 'gpt-4o',
    'chat.openai.com': 'gpt-4o',
    'openai.com': 'gpt-4o',
    'claude.ai': 'claude-3.5-sonnet',
    'anthropic.com': 'claude-3.5-sonnet',
    'gemini.google.com': 'gemini-2.0-flash',
    'bard.google.com': 'gemini-2.0-flash',
    'copilot.microsoft.com': 'gpt-4o',
    'bing.com': 'gpt-4o',
    'poe.com': 'claude-3.5-sonnet', // Default, Poe has multiple
    'perplexity.ai': 'gpt-4o-mini', // Uses multiple, default to efficient
    'you.com': 'gpt-4o-mini',
    'mistral.ai': 'mistral-large'
  };

  for (const [domain, modelId] of Object.entries(modelMap)) {
    if (hostname.includes(domain)) {
      return modelId;
    }
  }

  return null;
}

// ========================================
// EXPORTS
// ========================================

// For Chrome extension
if (typeof window !== 'undefined') {
  window.EcoPromptCalculator = {
    loadData,
    isDataLoaded,
    getAvailableModels,
    getQueryCategory,
    interpolateEnergy,
    calculateImpact,
    calculateAverageImpact,
    formatEnergyComparison,
    formatWaterComparison,
    formatCarbonComparison,
    formatEnergyComparisonDetailed,
    formatWaterComparisonDetailed,
    formatCarbonComparisonDetailed,
    getComparisons,
    calculateEcoScore,
    getScoreLabel,
    compareModels,
    autoDetectModel,
    // Expose data getters
    getModelData: () => MODEL_DATA,
    getInfrastructure: () => INFRASTRUCTURE
  };
}

// For Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadData,
    isDataLoaded,
    getAvailableModels,
    getQueryCategory,
    interpolateEnergy,
    calculateImpact,
    calculateAverageImpact,
    formatEnergyComparison,
    formatWaterComparison,
    formatCarbonComparison,
    getComparisons,
    calculateEcoScore,
    getScoreLabel,
    compareModels,
    autoDetectModel
  };
}
