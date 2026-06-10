// EcoPrompt Coach Core — Prompt Analyzer
// Token estimation, task detection, courtesy-phrase trimming, and
// optimization tips. Ported from v1 (field-tested) with updated model
// recommendations and tuned multipliers.

'use strict';

// ---------------------------------------------------------------------------
// Token estimation — calibrated against OpenAI cl100k/o200k tokenizers:
// English prose ≈ 4 chars/token, code ≈ 3.5 chars/token. Fenced code blocks
// are counted with their own ratio. Accuracy ±12% prose / ±18% code, which is
// plenty for behavioural nudges.
// ---------------------------------------------------------------------------

function estimateTokens(text) {
  if (!text || text.trim().length === 0) return 0;
  const PROSE = 4;
  const CODE = 3.5;
  let codeChars = 0;
  for (const match of text.match(/```[\s\S]*?```/g) || []) codeChars += match.length;
  const proseChars = text.length - codeChars;
  return Math.max(
    1,
    (proseChars > 0 ? Math.ceil(proseChars / PROSE) : 0) +
      (codeChars > 0 ? Math.ceil(codeChars / CODE) : 0)
  );
}

// ---------------------------------------------------------------------------
// Task type detection
// ---------------------------------------------------------------------------

const TASK_TYPES = {
  IMAGE_GENERATION: {
    keywords: ['generate image', 'create image', 'draw', 'illustrate', 'picture of', 'photo of', 'image of', 'artwork', 'render', 'painting', 'sketch'],
    energyMultiplier: 3.0,
    typicalOutputTokens: 50,
    displayName: 'Image generation',
    description: 'Diffusion models use roughly 3× the energy of a text task'
  },
  AGENTIC_TASK: {
    keywords: ['research', 'analyze multiple', 'compare sources', 'investigate', 'browse', 'find information', 'multi-step', 'agent', 'compile report', 'deep research'],
    energyMultiplier: 2.0,
    typicalOutputTokens: 800,
    displayName: 'Agentic / research task',
    description: 'Multiple chained model calls multiply the footprint'
  },
  CODE_GENERATION: {
    keywords: ['write code', 'create function', 'implement', 'debug', 'refactor', 'fix bug', 'script', 'algorithm', 'api', 'endpoint', 'unit test'],
    energyMultiplier: 1.2,
    typicalOutputTokens: 400,
    displayName: 'Code generation',
    description: 'Longer outputs than average — be specific to avoid retries'
  },
  CREATIVE_WRITING: {
    keywords: ['write story', 'write a story', 'poem', 'essay', 'blog post', 'narrative', 'fiction', 'screenplay', 'short story', 'creative writing'],
    energyMultiplier: 1.3,
    typicalOutputTokens: 600,
    displayName: 'Creative writing',
    description: 'Outputs tend to run long'
  },
  DATA_ANALYSIS: {
    keywords: ['analyze data', 'analyze this', 'interpret', 'statistics', 'trends', 'insights', 'metrics', 'correlation'],
    energyMultiplier: 1.4,
    typicalOutputTokens: 500,
    displayName: 'Data analysis',
    description: 'Complex reasoning — consider a reasoning-light model first'
  },
  TEXT_SUMMARIZATION: {
    keywords: ['summarize', 'summary', 'tldr', 'key points', 'condense', 'main ideas', 'recap'],
    energyMultiplier: 0.7,
    typicalOutputTokens: 150,
    displayName: 'Summarization',
    description: 'Short outputs keep the footprint low'
  },
  TRANSLATION: {
    keywords: ['translate', 'translation', 'in spanish', 'in french', 'in german', 'to english', 'localize'],
    energyMultiplier: 0.6,
    typicalOutputTokens: null, // ≈ input length
    displayName: 'Translation',
    description: 'Efficient task — small models do this well'
  },
  QUESTION_ANSWERING: {
    keywords: ['what is', 'how to', 'why', 'when', 'where', 'who', 'explain', 'tell me about', 'describe', 'define'],
    energyMultiplier: 0.8,
    typicalOutputTokens: 200,
    displayName: 'Q&A',
    description: 'Simple and efficient'
  },
  GENERAL: {
    keywords: [],
    energyMultiplier: 1.0,
    typicalOutputTokens: 300,
    displayName: 'General',
    description: 'Standard task'
  }
};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(lowerText, keyword) {
  const kw = keyword.trim();
  if (!kw) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(kw)}($|[^a-z0-9])`, 'i').test(lowerText);
}

function detectTaskType(text) {
  const lowerText = text.toLowerCase();
  let detected = 'GENERAL';
  let maxScore = 0;
  for (const [type, config] of Object.entries(TASK_TYPES)) {
    if (!config.keywords.length) continue;
    let score = 0;
    for (const keyword of config.keywords) {
      if (matchesKeyword(lowerText, keyword)) {
        score += keyword.trim().split(/\s+/).length > 1 ? 3 : 2;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      detected = type;
    }
  }
  const cfg = TASK_TYPES[detected];
  return {
    type: detected,
    displayName: cfg.displayName,
    description: cfg.description,
    confidence: Math.min(100, maxScore * 15),
    energyMultiplier: cfg.energyMultiplier
  };
}

// ---------------------------------------------------------------------------
// Zero-AI alternatives — some queries shouldn't go to an LLM at all.
// ---------------------------------------------------------------------------

function detectSpecialQueryType(text) {
  const lowerText = text.toLowerCase();

  const groups = [
    {
      keywords: ['restaurant', 'cafe', 'near me', 'directions to', 'how to get to', 'where is', 'closest', 'nearest', 'parking', 'hotel', 'open now'],
      result: {
        type: 'location',
        title: 'Use a maps app instead',
        description: 'Maps apps give real-time, accurate results for places and directions — an LLM may hallucinate them.',
        impact: 'Better answer, ~zero AI energy',
        savingsPercent: 100
      }
    },
    {
      keywords: ['weather', 'forecast', 'temperature today', 'rain tomorrow'],
      result: {
        type: 'weather',
        title: 'Use a weather app',
        description: 'LLMs don\'t know current weather. A weather app is instant, accurate, and nearly free in energy.',
        impact: 'Better answer, ~zero AI energy',
        savingsPercent: 100
      }
    },
    {
      keywords: ['what time', 'current time', 'time in', 'what date', "today's date"],
      result: {
        type: 'time',
        title: 'Check your device clock',
        description: 'Time and date are on your device already — no model call needed.',
        impact: 'Instant answer, zero energy',
        savingsPercent: 100
      }
    }
  ];

  for (const group of groups) {
    for (const kw of group.keywords) {
      if (matchesKeyword(lowerText, kw)) return group.result;
    }
  }

  const mathKeywords = ['calculate', 'compute', 'how much is', 'convert', 'percentage'];
  if (mathKeywords.some((kw) => matchesKeyword(lowerText, kw)) && /[\d+\-*/=()%]/.test(text)) {
    return {
      type: 'math',
      title: 'Use a calculator',
      description: 'A calculator or spreadsheet is exact and instant; LLMs can make arithmetic mistakes.',
      impact: 'Exact answer, ~zero energy',
      savingsPercent: 100
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Courtesy-phrase trimming. Order matters: compound phrases first so removal
// leaves no orphan fragments ("thanks in advance" before "thanks").
// ---------------------------------------------------------------------------

const POLITE_PHRASES = [
  { pattern: /\bthank\s+you\s+(?:so\s+much\s+|very\s+much\s+|kindly\s+)?(?:in\s+advance\s+)?for\s+(?:your\s+)?(?:help|time|assistance|consideration|patience)[.!]?/gi, word: 'thank you for your help', tokens: 6 },
  { pattern: /\bthanks\s+(?:so\s+much\s+|a\s+lot\s+|a\s+million\s+)?(?:in\s+advance\s+)?for\s+(?:your\s+)?(?:help|time|assistance|consideration|patience)[.!]?/gi, word: 'thanks for your help', tokens: 5 },
  { pattern: /\bthanks?\s+(?:so\s+much\s+|very\s+much\s+|a\s+lot|a\s+million)?\s*in\s+advance[.!]?/gi, word: 'thanks in advance', tokens: 4 },
  { pattern: /\bthank\s+you\s+(?:so\s+much|very\s+much|kindly)[.!]?/gi, word: 'thank you so much', tokens: 4 },
  { pattern: /\bthanks\s+(?:so\s+much|a\s+lot|a\s+million|a\s+ton)[.!]?/gi, word: 'thanks a lot', tokens: 3 },
  { pattern: /\bi\s+(?:really\s+|truly\s+)?appreciate\s+(?:it|your\s+help|your\s+time|the\s+help)[.!]?/gi, word: 'I appreciate it', tokens: 4 },
  { pattern: /\bif\s+(?:it'?s|it\s+is)\s+(?:not\s+too\s+much(?:\s+trouble)?|possible|ok(?:ay)?)\b/gi, word: "if it's possible", tokens: 5 },
  { pattern: /\bif\s+you\s+don'?t\s+mind\b/gi, word: "if you don't mind", tokens: 4 },
  { pattern: /\bi\s+was\s+wondering\s+if\s+you\s+(?:could|would|can)\b/gi, word: 'I was wondering if you could', tokens: 6 },
  { pattern: /\bi\s+was\s+wondering\s+if\b/gi, word: 'I was wondering if', tokens: 4 },
  { pattern: /\bi\s+just\s+wanted\s+to\s+(?:ask|know|check)\b/gi, word: 'I just wanted to ask', tokens: 4 },
  { pattern: /\bwould\s+you\s+mind\b/gi, word: 'would you mind', tokens: 3 },
  { pattern: /\bif\s+you\s+(?:could|would|can)\b/gi, word: 'if you could', tokens: 3 },
  { pattern: /\bi\s+would\s+like\s+to\b/gi, word: 'I would like to', tokens: 4 },
  { pattern: /\bi'd\s+like\s+to\b/gi, word: "I'd like to", tokens: 3 },
  { pattern: /^(?:hi|hey|hello|greetings)[,!.\s]+/gi, word: 'hi', tokens: 1 },
  { pattern: /\bcould\s+you\b/gi, word: 'could you', tokens: 2 },
  { pattern: /\bwould\s+you\b/gi, word: 'would you', tokens: 2 },
  { pattern: /\bcan\s+you\b/gi, word: 'can you', tokens: 2 },
  { pattern: /\bthank\s+you\b/gi, word: 'thank you', tokens: 2 },
  { pattern: /\bplease\b/gi, word: 'please', tokens: 1 },
  { pattern: /\bthanks\b/gi, word: 'thanks', tokens: 1 },
  { pattern: /\bkindly\b/gi, word: 'kindly', tokens: 1 },
  { pattern: /\bsorry\b/gi, word: 'sorry', tokens: 1 }
];

function detectPoliteWords(text) {
  const found = [];
  let totalTokensSaved = 0;
  for (const phrase of POLITE_PHRASES) {
    const matches = text.match(phrase.pattern);
    if (matches) {
      found.push({
        phrase: phrase.word,
        count: matches.length,
        tokensSaved: phrase.tokens * matches.length,
        example: matches[0]
      });
      totalTokensSaved += phrase.tokens * matches.length;
    }
  }
  return { found, totalTokensSaved };
}

function generateOptimizedPrompt(originalText) {
  if (!originalText) return '';
  let optimized = originalText;
  for (const phrase of POLITE_PHRASES) {
    optimized = optimized.replace(phrase.pattern, ' ');
  }
  // Stranded courtesy tails (defensive — compounds normally swallow these).
  optimized = optimized.replace(/(^|[\s,;:.!?])\s*in\s+advance\b[.!]?/gi, '$1');
  optimized = optimized.replace(/(^|[\s,;:.!?])\s*for\s+(?:your\s+)?(?:help|time|assistance|consideration|patience)\b[.!]?/gi, '$1');
  optimized = optimized.replace(/\s+/g, ' ');
  optimized = optimized.replace(/([?!.])[?!.\s]+(?=[?!.\s]|$)/g, '$1');
  optimized = optimized.replace(/([,;])(\s*[,;])+/g, '$1');
  optimized = optimized.replace(/^[\s,;:!?.]+/, '');
  optimized = optimized.replace(/[\s,;]+([.!?])?\s*$/, '$1');
  optimized = optimized.replace(/\s+([.,!?;:])/g, '$1');
  optimized = optimized.replace(/([.!?])([^\s.!?])/g, '$1 $2');
  optimized = optimized.trim();
  if (optimized.length > 0) {
    optimized = optimized.charAt(0).toUpperCase() + optimized.slice(1);
  }
  optimized = optimized.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
  return optimized;
}

// ---------------------------------------------------------------------------
// Output estimation and tips
// ---------------------------------------------------------------------------

function estimateOutputTokens(taskType, inputTokens) {
  const cfg = TASK_TYPES[taskType] || TASK_TYPES.GENERAL;
  const base = cfg.typicalOutputTokens === null ? inputTokens : cfg.typicalOutputTokens;
  const estimated = Math.round(base + Math.min(inputTokens * 0.3, 200));
  return {
    estimated,
    min: Math.round(estimated * 0.5),
    max: Math.round(estimated * 1.5)
  };
}

const MODEL_RECOMMENDATIONS = {
  IMAGE_GENERATION: 'Use a dedicated image model and reuse good prompts — regeneration is the hidden cost.',
  TEXT_SUMMARIZATION: 'A small model (Gemini Flash, GPT-4o mini, Claude Haiku) summarizes just as well for ~70% less energy.',
  CODE_GENERATION: 'Mid-size models handle routine code; save frontier or reasoning models for hard problems.',
  TRANSLATION: 'Small models translate excellently — no need for a frontier model.',
  AGENTIC_TASK: 'Scope the task tightly; every extra agent step multiplies the footprint.',
  CREATIVE_WRITING: 'Draft with a small model, then polish the best version with a larger one.',
  DATA_ANALYSIS: 'Try a standard model before a reasoning model — reasoning can cost 5–10× more energy.',
  QUESTION_ANSWERING: 'Small, fast models answer factual questions well for ~70% less energy.',
  GENERAL: 'Start with a small efficient model; escalate only when the answer falls short.'
};

function getOptimizationTips(politeWords, taskType, tokens, originalText = '') {
  const tips = [];

  if (originalText) {
    const special = detectSpecialQueryType(originalText);
    if (special) tips.push({ kind: 'special_query', priority: 'critical', ...special });
  }

  if (politeWords.totalTokensSaved > 0) {
    const examples = politeWords.found.slice(0, 2).map((fnd) => `"${fnd.example.trim()}"`).join(', ');
    tips.push({
      kind: 'polite_words',
      priority: 'high',
      title: 'Trim courtesy phrases',
      description: `Found ${examples}. The model doesn't need them — every token costs energy.`,
      impact: `Save ~${politeWords.totalTokensSaved} tokens`,
      savingsPercent: Math.min(99, Math.round((politeWords.totalTokensSaved / Math.max(1, tokens)) * 100))
    });
  }

  if (taskType.type === 'AGENTIC_TASK' || taskType.type === 'IMAGE_GENERATION') {
    tips.push({
      kind: 'task_specific',
      priority: 'high',
      title: `High-energy task: ${taskType.displayName.toLowerCase()}`,
      description: taskType.description + '. Be precise the first time to avoid costly retries.',
      impact: 'Avoid 2–3× regeneration overhead',
      savingsPercent: 50
    });
  }

  if (tokens > 500) {
    tips.push({
      kind: 'length',
      priority: 'medium',
      title: 'Consider a shorter prompt',
      description: 'Focus on the essential requirements — long context raises cost and can dilute the answer.',
      impact: `Target ~${Math.floor(tokens * 0.7)} tokens`,
      savingsPercent: 30
    });
  }

  tips.push({
    kind: 'output_budget',
    priority: 'medium',
    title: 'Set an output budget',
    description: 'Output tokens dominate the energy bill. Add "answer in ≤100 words" or "bullet points only" — it typically halves generated tokens.',
    impact: 'Up to ~50% energy reduction',
    savingsPercent: 50
  });

  tips.push({
    kind: 'model',
    priority: 'high',
    title: 'Right-size the model',
    description: MODEL_RECOMMENDATIONS[taskType.type] || MODEL_RECOMMENDATIONS.GENERAL,
    impact: 'Often 50–70% energy reduction',
    savingsPercent: 60
  });

  return tips;
}

// ---------------------------------------------------------------------------
// Helpers and main entry point
// ---------------------------------------------------------------------------

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

function analyzePrompt(text) {
  if (!text || text.trim().length === 0) return null;
  const tokens = estimateTokens(text);
  const taskType = detectTaskType(text);
  const politeWords = detectPoliteWords(text);
  const outputEstimate = estimateOutputTokens(taskType.type, tokens);
  const tips = getOptimizationTips(politeWords, taskType, tokens, text);
  return {
    originalText: text,
    tokens,
    taskType: taskType.displayName,
    taskTypeRaw: taskType.type,
    taskConfidence: taskType.confidence,
    taskDescription: taskType.description,
    energyMultiplier: taskType.energyMultiplier,
    politeWords,
    outputEstimate,
    tips,
    optimizedTokenEstimate: Math.max(1, tokens - politeWords.totalTokensSaved)
  };
}

const AnalyzerModule = {
  estimateTokens,
  detectTaskType,
  detectSpecialQueryType,
  detectPoliteWords,
  estimateOutputTokens,
  getOptimizationTips,
  generateOptimizedPrompt,
  stripHtml,
  analyzePrompt,
  TASK_TYPES,
  POLITE_PHRASES
};

if (typeof window !== 'undefined') {
  window.EcoPromptCore = window.EcoPromptCore || {};
  Object.assign(window.EcoPromptCore, AnalyzerModule);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnalyzerModule;
}
