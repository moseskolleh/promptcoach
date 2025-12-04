// EcoPrompt Coach - Shared Analyzer Module
// Shared code for token estimation, task detection, and prompt optimization

// ========================================
// TOKEN ESTIMATION
// ========================================

/**
 * Estimate token count from text
 * Approximation: 1 token ≈ 0.75 words for English text
 * @param {string} text - The text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text || text.trim().length === 0) return 0;

  // Count words (split by whitespace)
  const words = text.trim().split(/\s+/).length;

  // Count punctuation and special characters (often separate tokens)
  const specialChars = (text.match(/[.,!?;:()[\]{}"'-]/g) || []).length;

  // Code blocks often have more tokens per word
  const codeBlocks = (text.match(/```[\s\S]*?```/g) || []).length;

  // Rough approximation: words / 0.75 + special chars + code adjustment
  const estimatedTokens = Math.ceil(words / 0.75 + specialChars * 0.5 + codeBlocks * 10);

  return estimatedTokens;
}

// ========================================
// TASK TYPE DETECTION
// ========================================

const TASK_TYPES = {
  IMAGE_GENERATION: {
    keywords: [
      'generate image', 'create image', 'draw', 'illustrate', 'picture of',
      'photo of', 'dall-e', 'midjourney', 'stable diffusion', 'image of',
      'artwork', 'render', 'visualization', 'painting', 'sketch'
    ],
    inputMultiplier: 1.2,
    outputMultiplier: 0.3,
    energyMultiplier: 3.0,
    displayName: 'Image Generation',
    description: 'Uses 3x more energy than text tasks'
  },
  AGENTIC_TASK: {
    keywords: [
      'research', 'analyze multiple', 'compare sources', 'investigate',
      'browse', 'search for', 'find information', 'autonomous', 'agent',
      'multi-step', 'gather data', 'compile report'
    ],
    inputMultiplier: 1.5,
    outputMultiplier: 2.5,
    energyMultiplier: 2.0,
    displayName: 'Agentic/Research Task',
    description: 'Multiple model calls increase energy usage'
  },
  CODE_GENERATION: {
    keywords: [
      'write code', 'create function', 'implement', 'debug', 'program',
      'script', 'algorithm', 'refactor', 'fix bug', 'class', 'method',
      'api', 'endpoint', 'database query'
    ],
    inputMultiplier: 1.0,
    outputMultiplier: 1.5,
    energyMultiplier: 1.2,
    displayName: 'Code Generation',
    description: 'Moderate energy with longer outputs'
  },
  CREATIVE_WRITING: {
    keywords: [
      'write story', 'poem', 'essay', 'article', 'creative', 'blog post',
      'narrative', 'fiction', 'novel', 'character', 'plot', 'screenplay'
    ],
    inputMultiplier: 1.0,
    outputMultiplier: 2.0,
    energyMultiplier: 1.3,
    displayName: 'Creative Writing',
    description: 'Longer outputs typical'
  },
  DATA_ANALYSIS: {
    keywords: [
      'analyze data', 'analyze this', 'examine', 'interpret', 'statistics',
      'trends', 'insights', 'dashboard', 'metrics', 'correlation', 'report'
    ],
    inputMultiplier: 1.3,
    outputMultiplier: 1.5,
    energyMultiplier: 1.4,
    displayName: 'Data Analysis',
    description: 'Complex reasoning required'
  },
  TEXT_SUMMARIZATION: {
    keywords: [
      'summarize', 'summary', 'tldr', 'brief overview', 'key points',
      'condense', 'excerpt', 'main ideas', 'recap', 'bullet points'
    ],
    inputMultiplier: 1.2,
    outputMultiplier: 0.4,
    energyMultiplier: 0.7,
    displayName: 'Summarization',
    description: 'Shorter outputs save energy'
  },
  TRANSLATION: {
    keywords: [
      'translate', 'translation', 'in spanish', 'in french', 'in german',
      'to english', 'language', 'localize', 'convert to'
    ],
    inputMultiplier: 1.0,
    outputMultiplier: 1.0,
    energyMultiplier: 0.6,
    displayName: 'Translation',
    description: 'Efficient task type'
  },
  QUESTION_ANSWERING: {
    keywords: [
      'what is', 'how to', 'why', 'when', 'where', 'who', 'explain',
      'tell me about', 'describe', 'define', 'what are', 'how does'
    ],
    inputMultiplier: 0.8,
    outputMultiplier: 1.0,
    energyMultiplier: 0.8,
    displayName: 'Q&A',
    description: 'Simple and efficient'
  },
  GENERAL: {
    keywords: [],
    inputMultiplier: 1.0,
    outputMultiplier: 1.0,
    energyMultiplier: 1.0,
    displayName: 'General',
    description: 'Standard task'
  }
};

/**
 * Detect task type from prompt text
 * @param {string} text - The prompt text to analyze
 * @returns {Object} Task type information with confidence score
 */
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
    description: taskConfig.description,
    confidence: Math.min(100, maxScore * 15), // Convert to percentage (0-100)
    inputMultiplier: taskConfig.inputMultiplier,
    outputMultiplier: taskConfig.outputMultiplier,
    energyMultiplier: taskConfig.energyMultiplier
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
  { pattern: /\bi'd like\b/gi, word: "I'd like", tokens: 3 },
  { pattern: /\bsorry\b/gi, word: 'sorry', tokens: 1 },
  { pattern: /\bexcuse me\b/gi, word: 'excuse me', tokens: 2 },
  { pattern: /\bi appreciate\b/gi, word: 'I appreciate', tokens: 2 },
  { pattern: /\bi beg\b/gi, word: 'I beg', tokens: 2 },
  { pattern: /\bwould you mind\b/gi, word: 'would you mind', tokens: 3 },
  { pattern: /\bif you (?:could|would|can)\b/gi, word: 'if you could/would/can', tokens: 3 },
  { pattern: /\bif (?:it's|it is) (?:not too much|possible)\b/gi, word: "if it's possible", tokens: 4 }
];

/**
 * Detect polite words and phrases in text
 * @param {string} text - The text to analyze
 * @returns {Object} Found phrases and total tokens that could be saved
 */
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
// OUTPUT TOKEN ESTIMATION
// ========================================

/**
 * Estimate expected output tokens based on task type and input
 * @param {string} taskType - The detected task type
 * @param {number} inputTokens - Number of input tokens
 * @returns {Object} Estimated output tokens with range
 */
function estimateOutputTokens(taskType, inputTokens) {
  const baseOutputTokens = {
    IMAGE_GENERATION: 50,      // Image prompts generate short descriptions
    AGENTIC_TASK: 800,         // Research tasks generate comprehensive reports
    CODE_GENERATION: 400,      // Code with explanations
    CREATIVE_WRITING: 600,     // Stories, essays tend to be longer
    DATA_ANALYSIS: 500,        // Analysis with insights
    TEXT_SUMMARIZATION: 150,   // Summaries are short
    TRANSLATION: inputTokens,  // Translation roughly matches input
    QUESTION_ANSWERING: 200,   // Direct answers
    GENERAL: 300               // Default
  };

  const base = baseOutputTokens[taskType] || 300;
  const taskConfig = TASK_TYPES[taskType] || TASK_TYPES.GENERAL;

  // Adjust based on input length
  const inputAdjustment = Math.min(inputTokens * 0.3, 200);
  const estimated = Math.round(base * taskConfig.outputMultiplier + inputAdjustment);

  return {
    estimated: estimated,
    min: Math.round(estimated * 0.5),
    max: Math.round(estimated * 1.5),
    taskMultiplier: taskConfig.outputMultiplier
  };
}

// ========================================
// OPTIMIZATION TIPS
// ========================================

/**
 * Generate optimization tips based on analysis
 * @param {Object} politeWords - Detected polite words
 * @param {Object} taskType - Detected task type
 * @param {number} tokens - Token count
 * @returns {Array} Array of optimization tips
 */
function getOptimizationTips(politeWords, taskType, tokens) {
  const tips = [];

  // Tip 1: Remove polite phrases
  if (politeWords.totalTokensSaved > 0) {
    const examples = politeWords.found.slice(0, 2).map(f => f.example).join('", "');
    tips.push({
      type: 'polite_words',
      icon: 'Optimise Prompt.png',
      title: 'Remove Polite Phrases',
      description: `Found phrases like "${examples}". AI doesn't need politeness - save tokens!`,
      impact: `Save ~${politeWords.totalTokensSaved} tokens`,
      priority: 'high',
      savingsPercent: Math.round((politeWords.totalTokensSaved / tokens) * 100)
    });
  }

  // Tip 2: Task-specific warnings
  if (taskType.type === 'IMAGE_GENERATION') {
    tips.push({
      type: 'task_specific',
      icon: 'Optimise Prompt.png',
      title: 'High Energy Task Detected',
      description: 'Image generation uses 3x more energy. Be specific with style, colors, and composition.',
      impact: 'Reduce regeneration by 50-70%',
      priority: 'high',
      savingsPercent: 60
    });
  } else if (taskType.type === 'AGENTIC_TASK') {
    tips.push({
      type: 'task_specific',
      icon: 'Optimise Prompt.png',
      title: 'Multi-Step Task Warning',
      description: 'Research tasks use 2x energy due to multiple calls. Be specific to minimize iterations.',
      impact: 'Reduce overhead by 40-50%',
      priority: 'high',
      savingsPercent: 45
    });
  } else if (taskType.type === 'CODE_GENERATION') {
    tips.push({
      type: 'task_specific',
      icon: 'Optimise Prompt.png',
      title: 'Code Generation Tip',
      description: 'Include language, libraries, and input/output examples for first-try success.',
      impact: 'Get working code faster',
      priority: 'medium',
      savingsPercent: 30
    });
  } else if (taskType.type === 'QUESTION_ANSWERING' && tokens > 200) {
    tips.push({
      type: 'task_specific',
      icon: 'Optimise Prompt.png',
      title: 'Simplify Question',
      description: 'Simple questions work better when kept concise and direct.',
      impact: 'Faster response',
      priority: 'medium',
      savingsPercent: 25
    });
  }

  // Tip 3: Length optimization
  if (tokens > 500) {
    tips.push({
      type: 'length',
      icon: 'Optimise Prompt.png',
      title: 'Consider Shorter Prompt',
      description: 'Long prompts can be less effective. Focus on key requirements.',
      impact: `Target: ~${Math.floor(tokens * 0.7)} tokens`,
      priority: 'medium',
      savingsPercent: 30
    });
  }

  // Tip 4: Model alternatives (always include)
  tips.push({
    type: 'model',
    icon: 'Alternative Available.png',
    title: 'Use More Efficient Models',
    description: getModelRecommendation(taskType.type),
    impact: 'Save 50-70% energy',
    priority: 'high',
    savingsPercent: 60
  });

  return tips;
}

/**
 * Get model recommendation based on task type
 * @param {string} taskType - The task type
 * @returns {string} Model recommendation description
 */
function getModelRecommendation(taskType) {
  const recommendations = {
    IMAGE_GENERATION: 'Use DALL-E 3, Midjourney, or Stable Diffusion - optimized for images',
    TEXT_SUMMARIZATION: 'GPT-4o mini or Gemini Flash handle summaries efficiently (70% savings)',
    CODE_GENERATION: 'Claude 3.5 Sonnet excels at code. LLaMA 3.3 70B uses 60% less energy',
    TRANSLATION: 'GPT-4o mini or Gemini Flash work great (70% savings)',
    AGENTIC_TASK: 'Consider manual research. For automation, use GPT-4o mini for simple tasks',
    CREATIVE_WRITING: 'Try GPT-4o mini for drafts (70% savings), refine with larger models if needed',
    DATA_ANALYSIS: 'Claude 3.5 Sonnet or GPT-4o for complex analysis, smaller models for simple tasks',
    QUESTION_ANSWERING: 'GPT-4o mini, Gemini Flash, or Claude 3.5 Haiku handle Q&A well (70% savings)',
    GENERAL: 'Start with GPT-4o mini, Gemini Flash, or Claude 3.5 Haiku. Upgrade only if needed.'
  };

  return recommendations[taskType] || recommendations.GENERAL;
}

// ========================================
// OPTIMIZED PROMPT GENERATION
// ========================================

/**
 * Generate an optimized version of the prompt
 * @param {string} originalText - The original prompt
 * @param {Object} analysis - The analysis result
 * @returns {string} Optimized prompt text
 */
function generateOptimizedPrompt(originalText, analysis) {
  let optimized = originalText;

  // Remove polite phrases
  if (analysis.politeWords.found.length > 0) {
    for (const polite of analysis.politeWords.found) {
      const phrase = POLITE_PHRASES.find(p => p.word === polite.phrase);
      if (phrase) {
        optimized = optimized.replace(phrase.pattern, '').trim();
        optimized = optimized.replace(/\s+/g, ' ');
      }
    }
  }

  // Clean up double spaces and trim
  optimized = optimized.replace(/\s+/g, ' ').trim();

  // Capitalize first letter if needed
  if (optimized.length > 0) {
    optimized = optimized.charAt(0).toUpperCase() + optimized.slice(1);
  }

  return optimized;
}

// ========================================
// MAIN ANALYSIS FUNCTION
// ========================================

/**
 * Perform complete analysis of a prompt
 * @param {string} text - The prompt text to analyze
 * @returns {Object|null} Complete analysis or null if text is empty
 */
function analyzePrompt(text) {
  if (!text || text.trim().length === 0) return null;

  const tokens = estimateTokens(text);
  const taskType = detectTaskType(text);
  const politeWords = detectPoliteWords(text);
  const outputEstimate = estimateOutputTokens(taskType.type, tokens);
  const tips = getOptimizationTips(politeWords, taskType, tokens);

  return {
    originalText: text,
    tokens: tokens,
    taskType: taskType.displayName,
    taskTypeRaw: taskType.type,
    taskConfidence: taskType.confidence,
    taskDescription: taskType.description,
    energyMultiplier: taskType.energyMultiplier,
    politeWords: politeWords,
    outputEstimate: outputEstimate,
    tips: tips,
    optimizedTokenEstimate: tokens - politeWords.totalTokensSaved
  };
}

// ========================================
// EXPORTS
// ========================================

// For Chrome extension (content scripts and popup)
if (typeof window !== 'undefined') {
  window.EcoPromptAnalyzer = {
    estimateTokens,
    detectTaskType,
    detectPoliteWords,
    estimateOutputTokens,
    getOptimizationTips,
    getModelRecommendation,
    generateOptimizedPrompt,
    analyzePrompt,
    TASK_TYPES,
    POLITE_PHRASES
  };
}

// For Node.js (testing and backend)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    estimateTokens,
    detectTaskType,
    detectPoliteWords,
    estimateOutputTokens,
    getOptimizationTips,
    getModelRecommendation,
    generateOptimizedPrompt,
    analyzePrompt,
    TASK_TYPES,
    POLITE_PHRASES
  };
}
