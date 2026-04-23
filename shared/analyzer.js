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
      'write story', 'write a story', 'poem', 'essay', 'blog post',
      'narrative', 'fiction', 'novel', 'screenplay', 'short story',
      'creative writing'
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
 * Escape a string for use inside a RegExp
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a keyword as whole word(s) or phrase in text.
 * Uses word boundaries on the outside so "api" does NOT match "capital"
 * and "who" does NOT match "whole".
 * @param {string} lowerText
 * @param {string} keyword - already lower-cased
 * @returns {boolean}
 */
function matchesKeyword(lowerText, keyword) {
  const kw = keyword.trim();
  if (!kw) return false;
  // Build a boundary-anchored regex. Inner spaces are literal words.
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(kw)}($|[^a-z0-9])`, 'i');
  return pattern.test(lowerText);
}

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
      if (matchesKeyword(lowerText, keyword)) {
        // Multi-word phrases are stronger signals than single words.
        const words = keyword.trim().split(/\s+/).length;
        score += words > 1 ? 3 : 2;
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
// SPECIAL QUERY TYPE DETECTION
// ========================================

/**
 * Detect special query types that should use alternative tools
 * @param {string} text - The query text
 * @returns {Object|null} Special query suggestion or null
 */
function detectSpecialQueryType(text) {
  const lowerText = text.toLowerCase();

  // Location-based queries (restaurants, addresses, directions, places)
  const locationKeywords = [
    'restaurant', 'cafe', 'coffee shop', 'food near', 'near me',
    'address', 'directions to', 'how to get to', 'location of',
    'where is', 'closest', 'nearest', 'find a place', 'place to eat',
    'parking', 'hotel', 'gas station', 'store near', 'open now'
  ];

  for (const keyword of locationKeywords) {
    if (matchesKeyword(lowerText, keyword)) {
      return {
        type: 'location',
        title: '🗺️ Use a Maps App Instead',
        description: 'For location searches, restaurants, directions, and places, use Google Maps, Apple Maps, or Waze. They provide real-time info, ratings, and navigation.',
        impact: 'Get accurate, real-time location data',
        priority: 'critical',
        savingsPercent: 100,
        alternativeTool: 'Google Maps, Apple Maps, or Waze'
      };
    }
  }

  // Weather queries
  const weatherKeywords = [
    'weather', 'temperature', 'forecast', 'rain', 'snow',
    'sunny', 'cloudy', 'humidity', 'wind', 'storm',
    'hot', 'cold', 'degrees'
  ];

  for (const keyword of weatherKeywords) {
    if (matchesKeyword(lowerText, keyword) && (
      matchesKeyword(lowerText, 'today') ||
      matchesKeyword(lowerText, 'tomorrow') ||
      matchesKeyword(lowerText, 'what') ||
      matchesKeyword(lowerText, 'current') ||
      matchesKeyword(lowerText, 'now')
    )) {
      return {
        type: 'weather',
        title: '🌤️ Use a Weather App',
        description: 'For current weather and forecasts, use dedicated weather apps (Weather.com, Weather Channel, AccuWeather) or your device\'s built-in weather app.',
        impact: 'Get real-time, accurate weather data',
        priority: 'critical',
        savingsPercent: 100,
        alternativeTool: 'Weather app or weather.com'
      };
    }
  }

  // Time and date queries
  const timeKeywords = [
    'what time', 'current time', 'time in', 'timezone',
    'what day', 'what date', 'today\'s date', 'current date',
    'time now', 'clock'
  ];

  for (const keyword of timeKeywords) {
    if (matchesKeyword(lowerText, keyword)) {
      return {
        type: 'time',
        title: '⏰ Check Your Device Clock',
        description: 'For time and date information, check your device\'s clock, calendar app, or search "time in [city]" on Google for instant results.',
        impact: 'Instant answer, zero energy',
        priority: 'critical',
        savingsPercent: 100,
        alternativeTool: 'Device clock or Google search'
      };
    }
  }

  // Math and calculations
  const mathKeywords = [
    'calculate', 'compute', 'solve', 'equation', 'formula',
    'what is', 'how much is', 'add', 'subtract', 'multiply', 'divide',
    'percentage', 'convert', 'conversion'
  ];

  const hasMathSymbols = /[\d+\-*/=()%]/.test(text);
  const isMathQuery = mathKeywords.some(kw => matchesKeyword(lowerText, kw)) && hasMathSymbols;

  if (isMathQuery) {
    return {
      type: 'math',
      title: '🧮 Use a Calculator App',
      description: 'For calculations, use your device\'s calculator app, Google Calculator, or spreadsheet software (Excel/Google Sheets) for complex formulas.',
      impact: 'Instant, accurate calculations',
      priority: 'critical',
      savingsPercent: 100,
      alternativeTool: 'Calculator app or spreadsheet'
    };
  }

  // Cover letter / Resume / Email writing - needs context
  const writingKeywords = [
    'cover letter', 'resume', 'cv', 'job application',
    'email', 'letter', 'formal letter', 'business letter'
  ];

  for (const keyword of writingKeywords) {
    if (matchesKeyword(lowerText, keyword) && matchesKeyword(lowerText, 'write')) {
      return {
        type: 'writing',
        title: '✍️ Provide More Context First',
        description: 'For cover letters, resumes, or formal writing, provide specific details: purpose, target audience, key points, and your background. Consider drafting first, then ask AI to improve it.',
        impact: 'Better results with less iteration',
        priority: 'high',
        savingsPercent: 50,
        alternativeTool: 'Draft manually first, then use AI to refine'
      };
    }
  }

  return null;
}

// ========================================
// POLITE WORDS DETECTION
// ========================================

// Order matters: compound phrases must be listed BEFORE their shorter
// variants so that removal leaves no orphan fragments (e.g. we need to
// strip "thanks in advance" as a unit, otherwise "thanks" alone leaves
// a dangling "in advance").
const POLITE_PHRASES = [
  // Compound closings — must come before "thanks" / "I appreciate"
  { pattern: /\bthank\s+you\s+(?:so\s+much\s+)?for\s+your\s+(?:help|time|assistance)[.!]?/gi, word: 'thank you for your help', tokens: 6 },
  { pattern: /\bthanks\s+(?:so\s+much\s+)?(?:in\s+advance|a\s+lot|a\s+million)\b/gi, word: 'thanks in advance', tokens: 4 },
  { pattern: /\bthank\s+you\s+(?:so\s+much|very\s+much|in\s+advance|kindly)\b/gi, word: 'thank you so much', tokens: 4 },
  { pattern: /\bi\s+(?:really\s+|truly\s+)?appreciate\s+(?:it|your\s+help|your\s+time|the\s+help)\b/gi, word: 'I appreciate it', tokens: 4 },
  { pattern: /\bif\s+(?:it'?s|it\s+is)\s+(?:not\s+too\s+much(?:\s+trouble)?|possible|ok(?:ay)?)\b/gi, word: "if it's possible", tokens: 5 },
  { pattern: /\bif\s+you\s+don'?t\s+mind\b/gi, word: "if you don't mind", tokens: 4 },
  // "I was wondering if you could" has to be tried BEFORE "if you could"
  // so the whole hedge is stripped rather than leaving a dangling
  // "I was wondering" fragment.
  { pattern: /\bi\s+was\s+wondering\s+if\s+you\s+(?:could|would|can)\b/gi, word: 'I was wondering if you could', tokens: 6 },
  { pattern: /\bi\s+was\s+wondering\s+if\b/gi, word: 'I was wondering if', tokens: 4 },
  { pattern: /\bi\s+just\s+wanted\s+to\s+(?:ask|know|check)\b/gi, word: 'I just wanted to ask', tokens: 4 },
  { pattern: /\bwould\s+you\s+mind\b/gi, word: 'would you mind', tokens: 3 },
  { pattern: /\bif\s+you\s+(?:could|would|can)\b/gi, word: 'if you could', tokens: 3 },
  { pattern: /\bi\s+would\s+like\s+to\b/gi, word: 'I would like to', tokens: 4 },
  { pattern: /\bi'd\s+like\s+to\b/gi, word: "I'd like to", tokens: 3 },
  // Openings and vocative greetings — drop the leading salutation entirely
  { pattern: /^(?:hi|hey|hello|greetings)[,!.\s]+/gi, word: 'hi', tokens: 1 },
  // Mid-sentence greeters after a comma
  { pattern: /,\s*(?:hi|hey|hello)\s*(?=,|$)/gi, word: ', hi,', tokens: 1 },
  // Shorter standalone phrases — safe to remove as units
  { pattern: /\bcould\s+you\b/gi, word: 'could you', tokens: 2 },
  { pattern: /\bwould\s+you\b/gi, word: 'would you', tokens: 2 },
  { pattern: /\bcan\s+you\b/gi, word: 'can you', tokens: 2 },
  { pattern: /\bexcuse\s+me\b/gi, word: 'excuse me', tokens: 2 },
  { pattern: /\bthank\s+you\b/gi, word: 'thank you', tokens: 2 },
  { pattern: /\bplease\b/gi, word: 'please', tokens: 1 },
  { pattern: /\bthanks\b/gi, word: 'thanks', tokens: 1 },
  { pattern: /\bkindly\b/gi, word: 'kindly', tokens: 1 },
  { pattern: /\bsorry\b/gi, word: 'sorry', tokens: 1 }
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
 * Get eco-friendly alternative suggestion based on task type
 * @param {string} taskType - The task type
 * @returns {Object|null} Alternative suggestion or null
 */
function getEcoAlternative(taskType) {
  const alternatives = {
    TRANSLATION: {
      title: '🌍 Use Offline Translation',
      description: 'For common languages, try offline apps like Google Translate (offline mode), DeepL desktop, or Apple Translate. They work without internet and use zero cloud energy.',
      impact: 'Zero cloud energy usage',
      priority: 'high',
      savingsPercent: 100
    },
    QUESTION_ANSWERING: {
      title: '🔍 Try a Search Engine First',
      description: 'For factual questions, a quick web search (Google, DuckDuckGo) uses ~0.0003 Wh vs ~0.3 Wh for AI. Reserve AI for complex reasoning.',
      impact: 'Use 1000x less energy',
      priority: 'high',
      savingsPercent: 99
    },
    TEXT_SUMMARIZATION: {
      title: '📖 Skim or Use Browser Tools',
      description: 'For short texts, skimming takes seconds. Browser extensions like "TLDR This" or "Pocket" offer lightweight summaries.',
      impact: 'Significant energy savings',
      priority: 'medium',
      savingsPercent: 80
    },
    CODE_GENERATION: {
      title: '📚 Check Documentation First',
      description: 'Official docs, Stack Overflow, or GitHub examples often have ready solutions. AI is best for custom logic, not common patterns.',
      impact: 'Often faster than AI',
      priority: 'medium',
      savingsPercent: 70
    },
    CREATIVE_WRITING: {
      title: '✍️ Start with Your Own Draft',
      description: 'Writing your first draft and asking AI to improve it uses fewer tokens than generating from scratch.',
      impact: 'Save 40-60% tokens',
      priority: 'medium',
      savingsPercent: 50
    },
    DATA_ANALYSIS: {
      title: '📊 Use Spreadsheet Functions',
      description: 'Excel, Google Sheets, or Python pandas can handle most data analysis locally. Reserve AI for interpretation.',
      impact: 'Process data locally',
      priority: 'medium',
      savingsPercent: 70
    },
    IMAGE_GENERATION: {
      title: '🖼️ Use Stock Images or Templates',
      description: 'Unsplash, Pexels, or Canva templates may have what you need. AI image generation uses 3x more energy.',
      impact: 'Significant energy savings',
      priority: 'high',
      savingsPercent: 90
    },
    AGENTIC_TASK: {
      title: '🔎 Manual Research is Greener',
      description: 'For research tasks, targeted searches and reading sources directly gives better results than AI browsing.',
      impact: 'Better accuracy, less energy',
      priority: 'high',
      savingsPercent: 75
    }
  };

  return alternatives[taskType] || null;
}

/**
 * Generate optimization tips based on analysis
 * @param {Object} politeWords - Detected polite words
 * @param {Object} taskType - Detected task type
 * @param {number} tokens - Token count
 * @param {string} originalText - The original prompt text
 * @returns {Array} Array of optimization tips
 */
function getOptimizationTips(politeWords, taskType, tokens, originalText = '') {
  const tips = [];

  // Tip 0: Check for special query types first (highest priority)
  if (originalText) {
    const specialQuery = detectSpecialQueryType(originalText);
    if (specialQuery) {
      tips.push({
        type: 'special_query',
        icon: 'Alternative Available.png',
        ...specialQuery
      });
    }
  }

  // Tip 1: Eco-friendly alternative (if available) - prioritize this
  const ecoAlternative = getEcoAlternative(taskType.type);
  if (ecoAlternative) {
    tips.push({
      type: 'eco_alternative',
      icon: 'Alternative Available.png',
      ...ecoAlternative
    });
  }

  // Tip 2: Remove polite phrases
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

  // Tip 3: Task-specific warnings
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

  // Tip 4: Length optimization
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

  // Tip 5: Model alternatives (always include)
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
// TEXT NORMALIZATION
// ========================================

// NOTE: this only fixes whitespace and punctuation — it does NOT strip HTML
// or protect against XSS. Use stripHtml() for that and always prefer
// textContent over innerHTML when rendering user-derived strings.
function normalizeWhitespace(text) {
  if (!text || text.trim().length === 0) return text;

  let sanitized = text;

  // Normalize ellipses first so later passes don't treat them as sentence ends.
  // Three-or-more dots → "…" (single char, treated like any other letter below).
  sanitized = sanitized.replace(/\.{3,}/g, '…');

  // Collapse repeated punctuation (except normalized ellipses).
  sanitized = sanitized.replace(/!{2,}/g, '!');
  sanitized = sanitized.replace(/\?{2,}/g, '?');
  sanitized = sanitized.replace(/,{2,}/g, ',');

  // Remove space before punctuation and ensure one space after, except when
  // followed by another punctuation (e.g., "hello!?" or end of string).
  sanitized = sanitized.replace(/\s+([.,!?;:])/g, '$1');
  sanitized = sanitized.replace(/([.,!?;:])(?=[^\s.,!?;:…])/g, '$1 ');

  // Collapse whitespace runs.
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Remove leading punctuation left after stripping polite phrases.
  sanitized = sanitized.replace(/^[,;:]+\s*/, '');

  // Capitalize only after a *real* sentence end ('.', '!', '?') — never after '…',
  // which is typically mid-thought, and never after ';' or ','.
  sanitized = sanitized.replace(/([.!?])(\s+)([a-z])/g, (m, p, s, c) => p + s + c.toUpperCase());

  // Capitalize the very first character.
  if (sanitized.length > 0) {
    sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
  }

  return sanitized.trim();
}

// Remove HTML tags and decode the common named entities. Intended as a
// second line of defence for strings that will flow into innerHTML — prefer
// textContent / escapeHtml when rendering user-derived text.
function stripHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
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
  if (!originalText) return '';

  // Apply phrase patterns in list order (longest compound first) so that
  // e.g. "thanks in advance" is removed as a unit before "thanks" is tried.
  let optimized = originalText;
  for (const phrase of POLITE_PHRASES) {
    optimized = optimized.replace(phrase.pattern, ' ');
  }

  // Clean up the fragments removal leaves behind:
  // - collapse repeated whitespace
  optimized = optimized.replace(/\s+/g, ' ');
  // - remove commas/semicolons that are now adjacent: ", ," -> ","
  optimized = optimized.replace(/([,;])(\s*[,;])+/g, '$1');
  // - remove leading punctuation: ", write me" -> "write me"
  optimized = optimized.replace(/^[\s,;:!?.]+/, '');
  // - remove orphan punctuation at the end: "an essay, ," -> "an essay"
  optimized = optimized.replace(/[\s,;]+([.!?])?\s*$/, '$1');
  // - fix space before punctuation: "hello ," -> "hello,"
  optimized = optimized.replace(/\s+([.,!?;:])/g, '$1');
  // - ensure space after sentence-ending punctuation
  optimized = optimized.replace(/([.!?])([^\s.!?])/g, '$1 $2');

  optimized = optimized.trim();

  // Capitalize first letter
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
  const tips = getOptimizationTips(politeWords, taskType, tokens, text);

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
    detectSpecialQueryType,
    detectPoliteWords,
    estimateOutputTokens,
    getOptimizationTips,
    getEcoAlternative,
    getModelRecommendation,
    normalizeWhitespace,
    stripHtml,
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
    detectSpecialQueryType,
    detectPoliteWords,
    estimateOutputTokens,
    getOptimizationTips,
    getEcoAlternative,
    getModelRecommendation,
    normalizeWhitespace,
    stripHtml,
    generateOptimizedPrompt,
    analyzePrompt,
    TASK_TYPES,
    POLITE_PHRASES
  };
}
