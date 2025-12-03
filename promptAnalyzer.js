// EcoPrompt Coach - Prompt Analyzer Module
// Analyzes prompts for token count, task type, and optimization opportunities

// Token counting using approximation
// Real tokenizers vary by model, but rough estimate: 1 token ≈ 0.75 words
function estimateTokens(text) {
  if (!text || text.trim().length === 0) return 0;

  // Count words (split by whitespace)
  const words = text.trim().split(/\s+/).length;

  // Count punctuation and special characters (often separate tokens)
  const specialChars = (text.match(/[.,!?;:()[\]{}"'-]/g) || []).length;

  // Rough approximation: words / 0.75 + special chars
  const estimatedTokens = Math.ceil(words / 0.75 + specialChars * 0.5);

  return estimatedTokens;
}

// Polite words and phrases that add tokens without value
const POLITE_PHRASES = [
  // Common polite words
  { pattern: /\bplease\b/gi, word: 'please', tokens: 1 },
  { pattern: /\bthank you\b/gi, word: 'thank you', tokens: 2 },
  { pattern: /\bthanks\b/gi, word: 'thanks', tokens: 1 },
  { pattern: /\bi beg\b/gi, word: 'I beg', tokens: 2 },
  { pattern: /\bkindly\b/gi, word: 'kindly', tokens: 1 },
  { pattern: /\bwould you mind\b/gi, word: 'would you mind', tokens: 3 },
  { pattern: /\bif you (?:could|would|can)\b/gi, word: 'if you could/would/can', tokens: 3 },
  { pattern: /\bcould you\b/gi, word: 'could you', tokens: 2 },
  { pattern: /\bwould you\b/gi, word: 'would you', tokens: 2 },
  { pattern: /\bcan you\b/gi, word: 'can you', tokens: 2 },
  { pattern: /\bi appreciate\b/gi, word: 'I appreciate', tokens: 2 },
  { pattern: /\bi would like\b/gi, word: 'I would like', tokens: 3 },
  { pattern: /\bi'd like\b/gi, word: "I'd like", tokens: 3 },
  { pattern: /\bsorry\b/gi, word: 'sorry', tokens: 1 },
  { pattern: /\bexcuse me\b/gi, word: 'excuse me', tokens: 2 },
  { pattern: /\bif (?:it's|it is) (?:not too much|possible)\b/gi, word: "if it's possible", tokens: 4 },
];

// Task type detection based on keywords and patterns
const TASK_TYPES = {
  IMAGE_GENERATION: {
    keywords: [
      'generate image', 'create image', 'draw', 'illustrate', 'picture of',
      'photo of', 'artwork', 'render', 'visualization', 'painting',
      'sketch', 'design image', 'make picture'
    ],
    indicators: ['style:', 'resolution:', 'aspect ratio:', 'colors:', 'lighting:'],
    weight: 1.0
  },
  TEXT_SUMMARIZATION: {
    keywords: [
      'summarize', 'summary', 'tldr', 'brief overview', 'key points',
      'main ideas', 'condense', 'shorten', 'abstract', 'recap'
    ],
    indicators: ['in X words', 'bullet points', 'concise', 'briefly'],
    weight: 0.5 // Lower weight = fewer tokens needed
  },
  CODE_GENERATION: {
    keywords: [
      'write code', 'create function', 'implement', 'program', 'script',
      'algorithm', 'class', 'method', 'debug', 'fix code', 'refactor'
    ],
    indicators: ['in python', 'in javascript', 'in java', 'function', 'code:'],
    weight: 1.2
  },
  QUESTION_ANSWERING: {
    keywords: [
      'what is', 'how to', 'why', 'when', 'where', 'who', 'explain',
      'tell me about', 'describe', 'define'
    ],
    indicators: ['?'],
    weight: 0.7
  },
  CREATIVE_WRITING: {
    keywords: [
      'write story', 'create narrative', 'poem', 'essay', 'article',
      'blog post', 'creative', 'fiction', 'character', 'plot'
    ],
    indicators: ['tone:', 'style:', 'genre:'],
    weight: 1.5
  },
  DATA_ANALYSIS: {
    keywords: [
      'analyze', 'analysis', 'compare', 'evaluate', 'assess',
      'examine', 'investigate', 'interpret data', 'trends'
    ],
    indicators: ['dataset', 'statistics', 'metrics', 'correlation'],
    weight: 1.0
  },
  TRANSLATION: {
    keywords: [
      'translate', 'translation', 'convert to', 'in spanish', 'in french',
      'in german', 'to english', 'language'
    ],
    indicators: ['from', 'to', 'language:'],
    weight: 0.6
  }
};

// Detect task type from prompt
function detectTaskType(text) {
  const lowerText = text.toLowerCase();
  const scores = {};

  for (const [type, config] of Object.entries(TASK_TYPES)) {
    let score = 0;

    // Check keywords
    for (const keyword of config.keywords) {
      if (lowerText.includes(keyword)) {
        score += 2;
      }
    }

    // Check indicators
    for (const indicator of config.indicators) {
      if (lowerText.includes(indicator.toLowerCase())) {
        score += 1;
      }
    }

    if (score > 0) {
      scores[type] = score;
    }
  }

  // Find highest scoring task type
  let detectedType = 'GENERAL';
  let maxScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedType = type;
    }
  }

  return {
    type: detectedType,
    confidence: maxScore,
    weight: TASK_TYPES[detectedType]?.weight || 1.0
  };
}

// Detect polite words and unnecessary phrases
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

  return {
    found: found,
    totalTokensSaved: totalTokensSaved
  };
}

// Get optimization tips based on task type and prompt analysis
function getOptimizationTips(text, taskType, politeWords, tokens) {
  const tips = [];

  // Tip 1: Remove polite words
  if (politeWords.totalTokensSaved > 0) {
    tips.push({
      type: 'polite_words',
      icon: 'Optimise Prompt.png',
      title: 'Remove Polite Phrases',
      description: `Found ${politeWords.found.length} polite phrase(s): "${politeWords.found.map(f => f.example).join('", "')}"`,
      impact: `Save ~${politeWords.totalTokensSaved} tokens`,
      priority: 'high'
    });
  }

  // Tip 2: Task-specific optimization
  const taskTips = getTaskSpecificTips(taskType, text, tokens);
  tips.push(...taskTips);

  // Tip 3: General length optimization
  if (tokens > 500) {
    tips.push({
      type: 'length',
      icon: 'Optimise Prompt.png',
      title: 'Consider Shorter Prompt',
      description: 'Long prompts can be less effective and more costly',
      impact: `Target: ~${Math.floor(tokens * 0.7)} tokens`,
      priority: 'medium'
    });
  }

  // Tip 4: Alternative models
  tips.push({
    type: 'model',
    icon: 'Alternative Available.png',
    title: 'Model Alternatives Available',
    description: getModelRecommendation(taskType),
    impact: 'Potentially save energy and cost',
    priority: 'low'
  });

  return tips.slice(0, 4); // Return top 4 tips
}

// Get task-specific optimization tips
function getTaskSpecificTips(taskType, text, tokens) {
  const tips = [];

  switch (taskType.type) {
    case 'IMAGE_GENERATION':
      tips.push({
        type: 'task_specific',
        icon: 'Optimise Prompt.png',
        title: 'Image Generation Tip',
        description: 'Be specific about style, colors, and composition. Avoid story-like descriptions.',
        impact: 'More focused prompts = better results',
        priority: 'high'
      });
      break;

    case 'TEXT_SUMMARIZATION':
      tips.push({
        type: 'task_specific',
        icon: 'Optimise Prompt.png',
        title: 'Summarization Tip',
        description: 'Specify exact word/bullet count. Paste full text directly instead of describing it.',
        impact: 'Clearer instructions = better summaries',
        priority: 'high'
      });
      break;

    case 'CODE_GENERATION':
      tips.push({
        type: 'task_specific',
        icon: 'Optimise Prompt.png',
        title: 'Code Generation Tip',
        description: 'Specify language, libraries, and exact requirements. Include input/output examples.',
        impact: 'Precise specs = working code faster',
        priority: 'high'
      });
      break;

    case 'QUESTION_ANSWERING':
      if (tokens > 200) {
        tips.push({
          type: 'task_specific',
          icon: 'Optimise Prompt.png',
          title: 'Question Tip',
          description: 'Simple questions work better when kept concise and direct.',
          impact: `Shorten to ~100 tokens for faster response`,
          priority: 'medium'
        });
      }
      break;

    case 'CREATIVE_WRITING':
      tips.push({
        type: 'task_specific',
        icon: 'Optimise Prompt.png',
        title: 'Creative Writing Tip',
        description: 'Longer, detailed prompts are acceptable here. Include tone, style, and constraints.',
        impact: 'Detail helps, but avoid redundancy',
        priority: 'low'
      });
      break;

    case 'TRANSLATION':
      if (tokens > 300) {
        tips.push({
          type: 'task_specific',
          icon: 'Optimise Prompt.png',
          title: 'Translation Tip',
          description: 'Simple instruction + text to translate is enough. No need for long explanations.',
          impact: 'Simpler prompt = same quality translation',
          priority: 'high'
        });
      }
      break;
  }

  return tips;
}

// Get model recommendation based on task
function getModelRecommendation(taskType) {
  switch (taskType.type) {
    case 'IMAGE_GENERATION':
      return 'Use specialized image models (DALL-E, Midjourney, Stable Diffusion)';
    case 'TEXT_SUMMARIZATION':
    case 'TRANSLATION':
      return 'Efficient models like GPT-4o mini or Gemini 2.0 Flash work great';
    case 'CODE_GENERATION':
      return 'Consider Claude 3.7 Sonnet or GPT-4o for complex code';
    case 'CREATIVE_WRITING':
      return 'Larger models like GPT-4o or Claude 3.7 Sonnet recommended';
    case 'QUESTION_ANSWERING':
      return 'Most efficient models (GPT-4.1 nano, Gemini Flash) work well';
    default:
      return 'Choose model based on complexity: simple tasks = smaller models';
  }
}

// Main analysis function
function analyzePrompt(text) {
  if (!text || text.trim().length === 0) {
    return null;
  }

  const tokens = estimateTokens(text);
  const taskType = detectTaskType(text);
  const politeWords = detectPoliteWords(text);
  const tips = getOptimizationTips(text, taskType, politeWords, tokens);

  return {
    originalText: text,
    tokens: tokens,
    taskType: taskType.type,
    taskConfidence: taskType.confidence,
    politeWords: politeWords,
    tips: tips,
    optimizedTokenEstimate: tokens - politeWords.totalTokensSaved
  };
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    analyzePrompt,
    estimateTokens,
    detectTaskType,
    detectPoliteWords,
    getOptimizationTips
  };
}
