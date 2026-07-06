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

// analyzePrompt runs on every debounced keystroke (including inside host
// chat pages via the content script), so keyword regexes are compiled once
// here instead of per call (~95 patterns per analysis otherwise).
const KEYWORD_PATTERN_CACHE = new Map();

function keywordPattern(keyword) {
  let pattern = KEYWORD_PATTERN_CACHE.get(keyword);
  if (!pattern) {
    pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword.trim())}($|[^a-z0-9])`, 'i');
    KEYWORD_PATTERN_CACHE.set(keyword, pattern);
  }
  return pattern;
}

function matchesKeyword(lowerText, keyword) {
  if (!keyword.trim()) return false;
  return keywordPattern(keyword).test(lowerText);
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
// Protected spans — quoted text and code are payload, not politeness. The
// courtesy trimmer and the budget detector must never read (or rewrite)
// inside them: 'Translate "thank you so much" into Japanese' keeps its quote.
// ---------------------------------------------------------------------------

const PROTECTED_SPAN_PATTERNS = [
  /```[\s\S]*?```/g, // fenced code blocks
  /`[^`\n]+`/g, // inline code
  /"[^"\n]+"/g, // double-quoted
  /“[^”\n]+”/g, // curly-quoted
  // Single-quoted, only when the quotes sit on word boundaries so
  // apostrophes ("don't", "user's") are never mistaken for quotes.
  /(^|[\s(,:;])'[^'\n]+'(?=[\s).,:;!?]|$)/gm
];

function findProtectedSpans(text) {
  const spans = [];
  for (const pattern of PROTECTED_SPAN_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const prefix = m[1] || '';
      spans.push({ start: m.index + prefix.length, end: m.index + m[0].length });
    }
  }
  // Earliest first; on ties keep the longest so fenced code wins over
  // quotes it contains.
  return spans.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Blank out protected content (same length, whitespace kept) so
 * keyword/phrase regexes can scan the text without matching inside payload.
 */
function maskProtectedSpans(text) {
  const spans = findProtectedSpans(text);
  if (!spans.length) return text;
  const chars = text.split('');
  for (const s of spans) {
    for (let i = s.start; i < s.end; i++) {
      if (!/\s/.test(chars[i])) chars[i] = '\u0000';
    }
  }
  return chars.join('');
}

// ---------------------------------------------------------------------------
// Output-budget detection. Response length is the dominant energy driver
// (see docs/METHODOLOGY.md), so a prompt that already caps its answer
// ("in 50 words", "one sentence", "bullet points only") gets a lower output
// estimate and credit in the tips instead of the "set an output budget" nag.
// ---------------------------------------------------------------------------

const WORDS_TO_TOKENS = 4 / 3; // ≈ 0.75 English words per token
const SENTENCE_TOKENS = 25;
const PARAGRAPH_TOKENS = 100;
const SMALL_NUMBERS = { one: 1, two: 2, three: 3 };

const SOFT_BUDGETS = [
  { pattern: /\b(?:bullet\s+points?\s+only|only\s+bullet\s+points?|just\s+(?:the\s+)?bullet\s+points?|(?:in|as)\s+bullet\s+points?)\b/i, factor: 0.6 },
  { pattern: /\b(?:briefly|be\s+brief|be\s+concise|concise(?:ly)?|keep\s+it\s+(?:short|brief)|short\s+answer|in\s+short|no\s+explanations?(?:\s+needed)?|without\s+explanation)\b/i, factor: 0.5 },
  { pattern: /\btl;?dr\b/i, factor: 0.4 }
];

/**
 * Detect an explicit output-length constraint in the prompt.
 * Returns { kind, phrase, capTokens } for hard caps ("50 words",
 * "one sentence", "yes or no"), { kind: 'style', phrase, factor } for soft
 * brevity cues ("briefly", "bullet points only"), or null.
 */
function detectOutputBudget(text) {
  if (!text) return null;
  const scannable = maskProtectedSpans(text);

  let m =
    scannable.match(/(?:\b(?:under|at\s+most|no\s+more\s+than|max(?:imum)?(?:\s+of)?|within|in|around|about|roughly|up\s+to)|≤|<=)\s*(\d{1,4})\s*words?\b/i) ||
    scannable.match(/\b(\d{1,4})\s*words?\s*(?:,\s*)?(?:or\s+(?:less|fewer)|max(?:imum)?|tops)\b/i) ||
    scannable.match(/\b(\d{1,4})-word\b/i);
  if (m) {
    return { kind: 'words', phrase: m[0].trim(), capTokens: Math.max(8, Math.round(Number(m[1]) * WORDS_TO_TOKENS)) };
  }

  m = scannable.match(/(?:\b(?:under|at\s+most|no\s+more\s+than|max(?:imum)?(?:\s+of)?|within|up\s+to)|≤|<=)\s*(\d{1,5})\s*tokens?\b/i);
  if (m) return { kind: 'tokens', phrase: m[0].trim(), capTokens: Math.max(8, Number(m[1])) };

  m =
    scannable.match(/\b(?:in|as)\s+(?:just\s+)?(?:a|one|a\s+single)\s+(?:short\s+)?(sentence|paragraph)\b/i) ||
    scannable.match(/\bone-(sentence|paragraph)\b/i);
  if (m) {
    const unit = m[1].toLowerCase();
    return {
      kind: unit,
      phrase: m[0].trim(),
      capTokens: unit === 'sentence' ? SENTENCE_TOKENS : PARAGRAPH_TOKENS
    };
  }

  m = scannable.match(/\b(one|two|three|[1-3])\s+sentences?\s+(?:max(?:imum)?|only|tops|or\s+(?:less|fewer))\b/i);
  if (m) {
    const n = SMALL_NUMBERS[m[1].toLowerCase()] || Number(m[1]) || 1;
    return { kind: 'sentence', phrase: m[0].trim(), capTokens: n * SENTENCE_TOKENS };
  }

  m = scannable.match(/\b(?:answer\s+)?(?:with\s+)?(?:just\s+)?yes\s+or\s+no\b/i);
  if (m) return { kind: 'yes_no', phrase: m[0].trim(), capTokens: 8 };

  m = scannable.match(/\b(?:in|with)\s+(?:just\s+)?one\s+word\b|\bone-word\s+answer\b/i);
  if (m) return { kind: 'word', phrase: m[0].trim(), capTokens: 6 };

  for (const soft of SOFT_BUDGETS) {
    const sm = scannable.match(soft.pattern);
    if (sm) return { kind: 'style', phrase: sm[0].trim(), factor: soft.factor };
  }

  return null;
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
  // Quoted text and code are payload — courtesy words inside them don't count.
  const scannable = maskProtectedSpans(text);
  const found = [];
  let totalTokensSaved = 0;
  for (const phrase of POLITE_PHRASES) {
    const matches = scannable.match(phrase.pattern);
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
  // Pull quoted text and code out into placeholders so trimming and
  // whitespace cleanup never rewrite payload content; restored at the end.
  const spans = findProtectedSpans(originalText);
  const saved = [];
  let optimized = '';
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue; // nested span already covered
    optimized += originalText.slice(cursor, s.start) + `\u0000${saved.length}\u0000`;
    saved.push(originalText.slice(s.start, s.end));
    cursor = s.end;
  }
  optimized += originalText.slice(cursor);

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
  // Restore protected spans verbatim.
  optimized = optimized.replace(/\u0000(\d+)\u0000/g, (all, i) => saved[Number(i)] ?? all);
  return optimized;
}

// ---------------------------------------------------------------------------
// Output estimation and tips
// ---------------------------------------------------------------------------

function estimateOutputTokens(taskType, inputTokens, budget = null) {
  const cfg = TASK_TYPES[taskType] || TASK_TYPES.GENERAL;
  const base = cfg.typicalOutputTokens === null ? inputTokens : cfg.typicalOutputTokens;
  const baseline = Math.round(base + Math.min(inputTokens * 0.3, 200));
  let estimated = baseline;
  if (budget) {
    if (typeof budget.capTokens === 'number') estimated = Math.min(estimated, budget.capTokens);
    else if (typeof budget.factor === 'number') estimated = Math.round(estimated * budget.factor);
    estimated = Math.max(5, estimated);
  }
  return {
    estimated,
    min: Math.round(estimated * 0.5),
    max: Math.round(estimated * 1.5),
    baseline,
    budgeted: !!budget
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

// Tasks where the user clearly wants generated content, so a keyword hit
// like "weather" ("write a poem about the weather") must not trigger the
// zero-AI "use another app" tip.
const SPECIAL_QUERY_EXEMPT_TASKS = new Set([
  'CREATIVE_WRITING',
  'CODE_GENERATION',
  'IMAGE_GENERATION',
  'TRANSLATION',
  'TEXT_SUMMARIZATION'
]);

function getOptimizationTips(politeWords, taskType, tokens, originalText = '', outputBudget = undefined) {
  const budget =
    outputBudget !== undefined ? outputBudget : originalText ? detectOutputBudget(originalText) : null;
  const tips = [];

  if (originalText && !SPECIAL_QUERY_EXEMPT_TASKS.has(taskType.type)) {
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

  if (budget) {
    const unbudgeted = estimateOutputTokens(taskType.type, tokens).estimated;
    const budgeted = estimateOutputTokens(taskType.type, tokens, budget).estimated;
    const savedTokens = Math.max(0, unbudgeted - budgeted);
    tips.push({
      kind: 'output_budget_ok',
      priority: 'low',
      title: 'Output budget detected ✓',
      description: `"${budget.phrase}" already caps the response length — output tokens dominate the energy bill, so this is the single best lever.`,
      impact: savedTokens > 0 ? `Saving ~${savedTokens} output tokens vs a typical answer` : 'Keeps the response lean',
      savingsPercent: unbudgeted > 0 ? Math.round((savedTokens / unbudgeted) * 100) : 0
    });
  } else {
    tips.push({
      kind: 'output_budget',
      priority: 'medium',
      title: 'Set an output budget',
      description: 'Output tokens dominate the energy bill. Add "answer in ≤100 words" or "bullet points only" — it typically halves generated tokens.',
      impact: 'Up to ~50% energy reduction',
      savingsPercent: 50
    });
  }

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
  const outputBudget = detectOutputBudget(text);
  const outputEstimate = estimateOutputTokens(taskType.type, tokens, outputBudget);
  const tips = getOptimizationTips(politeWords, taskType, tokens, text, outputBudget);
  return {
    originalText: text,
    tokens,
    taskType: taskType.displayName,
    taskTypeRaw: taskType.type,
    taskConfidence: taskType.confidence,
    taskDescription: taskType.description,
    energyMultiplier: taskType.energyMultiplier,
    politeWords,
    outputBudget,
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
  detectOutputBudget,
  maskProtectedSpans,
  estimateOutputTokens,
  getOptimizationTips,
  generateOptimizedPrompt,
  stripHtml,
  analyzePrompt,
  TASK_TYPES,
  POLITE_PHRASES
};

if (typeof globalThis !== 'undefined') {
  globalThis.EcoPromptCore = globalThis.EcoPromptCore || {};
  Object.assign(globalThis.EcoPromptCore, AnalyzerModule);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnalyzerModule;
}
