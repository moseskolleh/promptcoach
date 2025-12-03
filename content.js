// EcoPrompt Coach - Content Script
// Detects prompt input and provides real-time optimization tips

console.log('EcoPrompt Coach content script loaded');

// Inject tooltip CSS
const cssLink = document.createElement('link');
cssLink.rel = 'stylesheet';
cssLink.href = chrome.runtime.getURL('tooltip.css');
document.head.appendChild(cssLink);

// Current tooltip instance
let currentTooltip = null;
let lastAnalyzedElement = null;

// Detect if we're on an AI platform
function detectAIPlatform() {
  const hostname = window.location.hostname;

  if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
    return 'ChatGPT';
  } else if (hostname.includes('claude.ai') || hostname.includes('anthropic.com')) {
    return 'Claude';
  } else if (hostname.includes('gemini.google.com')) {
    return 'Gemini';
  }

  return null;
}

// Token estimation (same as in promptAnalyzer.js)
function estimateTokens(text) {
  if (!text || text.trim().length === 0) return 0;
  const words = text.trim().split(/\s+/).length;
  const specialChars = (text.match(/[.,!?;:()[\]{}"'-]/g) || []).length;
  return Math.ceil(words / 0.75 + specialChars * 0.5);
}

// Detect task type
function detectTaskType(text) {
  const lowerText = text.toLowerCase();

  const taskPatterns = {
    IMAGE_GENERATION: ['generate image', 'create image', 'draw', 'picture of', 'photo of'],
    TEXT_SUMMARIZATION: ['summarize', 'summary', 'tldr', 'key points', 'brief'],
    CODE_GENERATION: ['write code', 'function', 'implement', 'program', 'script'],
    QUESTION_ANSWERING: ['what is', 'how to', 'why', 'explain', 'tell me'],
    CREATIVE_WRITING: ['write story', 'poem', 'essay', 'blog post', 'creative'],
    TRANSLATION: ['translate', 'translation', 'in spanish', 'in french', 'to english']
  };

  for (const [type, patterns] of Object.entries(taskPatterns)) {
    for (const pattern of patterns) {
      if (lowerText.includes(pattern)) {
        return type;
      }
    }
  }

  return 'GENERAL';
}

// Detect polite words
function detectPoliteWords(text) {
  const politePatterns = [
    { pattern: /\bplease\b/gi, word: 'please', tokens: 1 },
    { pattern: /\bthank you\b/gi, word: 'thank you', tokens: 2 },
    { pattern: /\bthanks\b/gi, word: 'thanks', tokens: 1 },
    { pattern: /\bi beg\b/gi, word: 'I beg', tokens: 2 },
    { pattern: /\bkindly\b/gi, word: 'kindly', tokens: 1 },
    { pattern: /\bcould you\b/gi, word: 'could you', tokens: 2 },
    { pattern: /\bwould you\b/gi, word: 'would you', tokens: 2 },
    { pattern: /\bcan you\b/gi, word: 'can you', tokens: 2 },
    { pattern: /\bi appreciate\b/gi, word: 'I appreciate', tokens: 2 },
    { pattern: /\bsorry\b/gi, word: 'sorry', tokens: 1 }
  ];

  const found = [];
  let totalTokensSaved = 0;

  for (const phrase of politePatterns) {
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

// Get optimization tips
function getOptimizationTips(text, taskType, politeWords, tokens) {
  const tips = [];

  // Tip 1: Remove polite words
  if (politeWords.totalTokensSaved > 0) {
    const examples = politeWords.found.map(f => f.example).join('", "');
    tips.push({
      type: 'polite_words',
      icon: 'Optimise Prompt.png',
      title: 'Remove Polite Phrases',
      description: `Found polite phrases: "${examples}". AI doesn't need politeness!`,
      impact: `Save ~${politeWords.totalTokensSaved} tokens`,
      priority: 'high'
    });
  }

  // Tip 2: Task-specific optimization
  const taskTip = getTaskSpecificTip(taskType, text, tokens);
  if (taskTip) {
    tips.push(taskTip);
  }

  // Tip 3: Length optimization
  if (tokens > 500) {
    tips.push({
      type: 'length',
      icon: 'Optimise Prompt.png',
      title: 'Consider Shorter Prompt',
      description: 'Long prompts can be less effective. Focus on key requirements.',
      impact: `Target: ~${Math.floor(tokens * 0.7)} tokens`,
      priority: 'medium'
    });
  }

  // Tip 4: Model alternatives
  tips.push({
    type: 'model',
    icon: 'Alternative Available.png',
    title: 'Optimize Model Choice',
    description: getModelRecommendation(taskType),
    impact: 'Save energy and cost',
    priority: 'low'
  });

  return tips.slice(0, 4);
}

function getTaskSpecificTip(taskType, text, tokens) {
  const tips = {
    IMAGE_GENERATION: {
      icon: 'Optimise Prompt.png',
      title: 'Image Generation Tip',
      description: 'Be specific: style, colors, composition. Skip story-like descriptions.',
      impact: 'Focused prompts = better images',
      priority: 'high'
    },
    TEXT_SUMMARIZATION: {
      icon: 'Optimise Prompt.png',
      title: 'Summarization Tip',
      description: 'Specify exact word count or bullet points. Paste the full text directly.',
      impact: 'Clear instructions = better summary',
      priority: 'high'
    },
    CODE_GENERATION: {
      icon: 'Optimise Prompt.png',
      title: 'Code Generation Tip',
      description: 'Specify: language, libraries, requirements. Add input/output examples.',
      impact: 'Precise specs = working code faster',
      priority: 'high'
    },
    TRANSLATION: {
      icon: 'Optimise Prompt.png',
      title: 'Translation Tip',
      description: 'Simple: "Translate to [language]: [text]". No long explanations needed.',
      impact: 'Simpler = same quality',
      priority: 'high'
    }
  };

  return tips[taskType] || null;
}

function getModelRecommendation(taskType) {
  const recommendations = {
    IMAGE_GENERATION: 'Use specialized image models (DALL-E, Stable Diffusion)',
    TEXT_SUMMARIZATION: 'Efficient models like GPT-4o mini work great',
    CODE_GENERATION: 'Claude 3.7 Sonnet or GPT-4o for complex code',
    TRANSLATION: 'Most models handle this well - use efficient ones',
    GENERAL: 'Match model size to task complexity'
  };

  return recommendations[taskType] || recommendations.GENERAL;
}

// Analyze prompt
function analyzePrompt(text) {
  if (!text || text.trim().length === 0) return null;

  const tokens = estimateTokens(text);
  const taskType = detectTaskType(text);
  const politeWords = detectPoliteWords(text);
  const tips = getOptimizationTips(text, taskType, politeWords, tokens);

  return {
    tokens,
    taskType,
    politeWords,
    tips,
    optimizedTokens: tokens - politeWords.totalTokensSaved
  };
}

// Create tooltip HTML
function createTooltip(analysis, element) {
  const tooltip = document.createElement('div');
  tooltip.className = 'ecoprompt-tooltip';

  // Header
  const header = document.createElement('div');
  header.className = 'ecoprompt-tooltip-header';
  header.innerHTML = `
    <div class="ecoprompt-tooltip-title">
      <span class="ecoprompt-tooltip-icon">🌱</span>
      <h3>EcoPrompt Coach</h3>
    </div>
    <button class="ecoprompt-tooltip-close" aria-label="Close">×</button>
  `;
  tooltip.appendChild(header);

  // Token info
  const tokenInfo = document.createElement('div');
  tokenInfo.className = 'ecoprompt-token-info';
  tokenInfo.innerHTML = `
    <div class="ecoprompt-token-count">
      <strong>${analysis.tokens}</strong>
      <span>Estimated Tokens</span>
    </div>
    <div class="ecoprompt-task-type">${analysis.taskType.replace(/_/g, ' ')}</div>
  `;
  tooltip.appendChild(tokenInfo);

  // Savings indicator
  if (analysis.politeWords.totalTokensSaved > 0) {
    const savings = document.createElement('div');
    savings.className = 'ecoprompt-savings';
    savings.innerHTML = `
      <p class="ecoprompt-savings-text">
        Potential savings: <span class="ecoprompt-savings-value">~${analysis.politeWords.totalTokensSaved} tokens</span>
      </p>
    `;
    tooltip.appendChild(savings);
  }

  // Tips
  const tipsContainer = document.createElement('div');
  tipsContainer.className = 'ecoprompt-tips';
  tipsContainer.innerHTML = '<div class="ecoprompt-tips-title">💡 Optimization Tips</div>';

  if (analysis.tips.length > 0) {
    analysis.tips.forEach(tip => {
      const tipElement = document.createElement('div');
      tipElement.className = `ecoprompt-tip priority-${tip.priority}`;

      const iconUrl = chrome.runtime.getURL(`assets/${tip.icon}`);

      tipElement.innerHTML = `
        <img src="${iconUrl}" alt="${tip.title}" class="ecoprompt-tip-icon" />
        <div class="ecoprompt-tip-content">
          <h4 class="ecoprompt-tip-title">${tip.title}</h4>
          <p class="ecoprompt-tip-description">${tip.description}</p>
          <p class="ecoprompt-tip-impact">💚 ${tip.impact}</p>
        </div>
      `;
      tipsContainer.appendChild(tipElement);
    });
  } else {
    tipsContainer.innerHTML += '<div class="ecoprompt-no-tips">Your prompt looks good! ✓</div>';
  }

  tooltip.appendChild(tipsContainer);

  // Close button handler
  const closeBtn = header.querySelector('.ecoprompt-tooltip-close');
  closeBtn.addEventListener('click', () => {
    removeTooltip();
  });

  return tooltip;
}

// Position tooltip near element
function positionTooltip(tooltip, element) {
  const rect = element.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

  // Position below the element
  tooltip.style.top = `${rect.bottom + scrollTop + 10}px`;
  tooltip.style.left = `${rect.left + scrollLeft}px`;

  // Adjust if tooltip goes off screen
  setTimeout(() => {
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = `${window.innerWidth - tooltipRect.width - 20}px`;
    }
    if (tooltipRect.bottom > window.innerHeight + scrollTop) {
      tooltip.style.top = `${rect.top + scrollTop - tooltipRect.height - 10}px`;
    }
  }, 10);
}

// Show tooltip
function showTooltip(analysis, element) {
  removeTooltip();

  const tooltip = createTooltip(analysis, element);
  document.body.appendChild(tooltip);
  positionTooltip(tooltip, element);

  currentTooltip = tooltip;
  lastAnalyzedElement = element;

  // Auto-hide after 15 seconds
  setTimeout(() => {
    if (currentTooltip === tooltip) {
      removeTooltip();
    }
  }, 15000);
}

// Remove tooltip
function removeTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

// Handle paste event
function handlePaste(event) {
  const element = event.target;

  // Only handle textareas and contenteditable elements
  if (
    element.tagName !== 'TEXTAREA' &&
    !element.isContentEditable &&
    element.tagName !== 'INPUT'
  ) {
    return;
  }

  // Wait for paste to complete
  setTimeout(() => {
    const text = element.value || element.textContent || element.innerText;

    if (!text || text.trim().length < 10) {
      return; // Skip very short text
    }

    const analysis = analyzePrompt(text);
    if (analysis) {
      showTooltip(analysis, element);
    }
  }, 100);
}

// Handle input event (for manual typing)
function handleInput(event) {
  const element = event.target;
  const text = element.value || element.textContent || element.innerText;

  // Only analyze if text is substantial and user paused typing
  if (text && text.trim().length > 50) {
    clearTimeout(element._ecopromptTimeout);
    element._ecopromptTimeout = setTimeout(() => {
      const analysis = analyzePrompt(text);
      if (analysis && element === lastAnalyzedElement) {
        // Update existing tooltip or show new one
        showTooltip(analysis, element);
      }
    }, 2000); // Wait 2 seconds after typing stops
  }
}

// Listen for paste events on all textareas and inputs
document.addEventListener('paste', handlePaste, true);
document.addEventListener('input', handleInput, true);

// Close tooltip when clicking outside
document.addEventListener('click', (event) => {
  if (currentTooltip && !currentTooltip.contains(event.target)) {
    if (lastAnalyzedElement && !lastAnalyzedElement.contains(event.target)) {
      removeTooltip();
    }
  }
});

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'detectPlatform') {
    const platform = detectAIPlatform();
    sendResponse({ platform });
  }
});
