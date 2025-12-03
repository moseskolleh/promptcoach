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
let floatingBadge = null;
let currentAnalysis = null;
let bannerShown = false;

// Detect if we're on an AI platform
function detectAIPlatform() {
  const hostname = window.location.hostname;

  if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
    return 'ChatGPT';
  } else if (hostname.includes('claude.ai') || hostname.includes('anthropic.com')) {
    return 'Claude';
  } else if (hostname.includes('gemini.google.com') || hostname.includes('bard.google.com')) {
    return 'Gemini';
  } else if (hostname.includes('copilot.microsoft.com') || hostname.includes('bing.com/chat')) {
    return 'Copilot';
  } else if (hostname.includes('poe.com')) {
    return 'Poe';
  } else if (hostname.includes('perplexity.ai')) {
    return 'Perplexity';
  } else if (hostname.includes('you.com')) {
    return 'You.com';
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
const TASK_TYPES = {
  IMAGE_GENERATION: {
    keywords: ['generate image', 'create image', 'draw', 'illustrate', 'picture of', 'photo of', 'dall-e', 'midjourney', 'stable diffusion', 'image of'],
    energyMultiplier: 3.0,
    displayName: 'Image Generation'
  },
  AGENTIC_TASK: {
    keywords: ['research', 'analyze multiple', 'compare sources', 'investigate', 'browse', 'search for', 'find information', 'autonomous', 'agent', 'multi-step'],
    energyMultiplier: 2.0,
    displayName: 'Agentic/Research Task'
  },
  CODE_GENERATION: {
    keywords: ['write code', 'create function', 'implement', 'debug', 'program', 'script', 'algorithm', 'refactor', 'fix bug'],
    energyMultiplier: 1.2,
    displayName: 'Code Generation'
  },
  CREATIVE_WRITING: {
    keywords: ['write story', 'poem', 'essay', 'article', 'creative', 'blog post', 'narrative', 'fiction', 'novel'],
    energyMultiplier: 1.3,
    displayName: 'Creative Writing'
  },
  DATA_ANALYSIS: {
    keywords: ['analyze data', 'analyze this', 'examine', 'interpret', 'statistics', 'trends', 'insights', 'dashboard'],
    energyMultiplier: 1.4,
    displayName: 'Data Analysis'
  },
  TEXT_SUMMARIZATION: {
    keywords: ['summarize', 'summary', 'tldr', 'brief overview', 'key points', 'condense', 'excerpt'],
    energyMultiplier: 0.7,
    displayName: 'Summarization'
  },
  TRANSLATION: {
    keywords: ['translate', 'translation', 'in spanish', 'in french', 'in german', 'to english', 'language'],
    energyMultiplier: 0.6,
    displayName: 'Translation'
  },
  QUESTION_ANSWERING: {
    keywords: ['what is', 'how to', 'why', 'when', 'where', 'who', 'explain', 'tell me about', 'describe', 'define'],
    energyMultiplier: 0.8,
    displayName: 'Q&A'
  },
  GENERAL: {
    keywords: [],
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
    energyMultiplier: taskConfig.energyMultiplier
  };
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

  // Tip 2: Task-specific warnings
  if (taskType.type === 'IMAGE_GENERATION') {
    tips.push({
      type: 'task_specific',
      icon: 'Optimise Prompt.png',
      title: '⚠️ Image Generation Warning',
      description: 'Image generation uses 3x more energy than text. Be specific to avoid regeneration.',
      impact: 'Reduce energy waste',
      priority: 'high'
    });
  } else if (taskType.type === 'AGENTIC_TASK') {
    tips.push({
      type: 'task_specific',
      icon: 'Optimise Prompt.png',
      title: '⚠️ Agentic Task Warning',
      description: 'Research/multi-step tasks use 2x more energy. Be clear to minimize iterations.',
      impact: 'Reduce energy overhead',
      priority: 'high'
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
      priority: 'medium'
    });
  }

  // Tip 4: Model alternatives
  tips.push({
    type: 'model',
    icon: 'Alternative Available.png',
    title: 'Use Efficient Models',
    description: getModelRecommendation(taskType.type),
    impact: 'Save 50-70% energy',
    priority: 'medium'
  });

  return tips;
}

function getModelRecommendation(taskType) {
  const recommendations = {
    IMAGE_GENERATION: 'Use specialized image models (DALL-E, Stable Diffusion) instead of general LLMs',
    TEXT_SUMMARIZATION: 'Try GPT-4o mini or Gemini Flash - they handle summaries efficiently',
    CODE_GENERATION: 'Claude 3.7 Sonnet or GPT-4o work well, but LLaMA 3.3 70B is more efficient',
    TRANSLATION: 'Use efficient models like GPT-4o mini - most models handle translation well',
    AGENTIC_TASK: 'Avoid if possible - manual research is more energy-efficient',
    GENERAL: 'Try smaller models first: GPT-4o mini, Gemini Flash, or LLaMA 3.2'
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

// Create floating badge
function createFloatingBadge() {
  if (floatingBadge) return; // Already exists

  const badge = document.createElement('div');
  badge.className = 'ecoprompt-floating-badge';
  badge.innerHTML = `
    <div class="ecoprompt-badge-icon">🌱</div>
    <div class="ecoprompt-badge-text">Tips Available</div>
  `;

  badge.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'openPopup',
      analysis: currentAnalysis
    });
  });

  document.body.appendChild(badge);
  floatingBadge = badge;

  // Add styles inline to ensure visibility
  badge.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 50px;
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
    cursor: pointer;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s ease;
    animation: ecoprompt-badge-bounce 2s infinite;
  `;

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ecoprompt-badge-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    .ecoprompt-floating-badge:hover {
      transform: scale(1.05) translateY(-2px) !important;
      box-shadow: 0 6px 16px rgba(76, 175, 80, 0.5) !important;
    }
    .ecoprompt-badge-icon {
      font-size: 20px;
    }
  `;
  document.head.appendChild(style);
}

// Show notification banner at top
function showNotificationBanner(analysis) {
  if (bannerShown) return;

  const banner = document.createElement('div');
  banner.className = 'ecoprompt-notification-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
    color: white;
    padding: 12px 20px;
    z-index: 1000000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    animation: slideDown 0.5s ease;
  `;

  const topTip = analysis.tips[0];
  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 24px;">🌱</span>
      <div>
        <div style="font-weight: 600; font-size: 14px;">${topTip.title}</div>
        <div style="font-size: 12px; opacity: 0.95;">${topTip.description}</div>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 10px;">
      <button class="ecoprompt-banner-btn" style="background: white; color: #4caf50; border: none; padding: 8px 16px; border-radius: 20px; font-weight: 600; cursor: pointer; font-size: 13px;">
        View All Tips
      </button>
      <button class="ecoprompt-banner-close" style="background: transparent; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">
        ×
      </button>
    </div>
  `;

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  banner.querySelector('.ecoprompt-banner-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'openPopup',
      analysis: currentAnalysis
    });
  });

  banner.querySelector('.ecoprompt-banner-close').addEventListener('click', () => {
    banner.style.animation = 'slideDown 0.3s ease reverse';
    setTimeout(() => banner.remove(), 300);
  });

  document.body.appendChild(banner);
  bannerShown = true;

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (banner.parentNode) {
      banner.style.animation = 'slideDown 0.3s ease reverse';
      setTimeout(() => banner.remove(), 300);
    }
  }, 10000);
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
    <div class="ecoprompt-task-type">${analysis.taskType.displayName}</div>
  `;
  tooltip.appendChild(tokenInfo);

  // Energy warning
  if (analysis.taskType.energyMultiplier > 1.5) {
    const warning = document.createElement('div');
    warning.className = 'ecoprompt-warning';
    warning.style.cssText = `
      background: #fff3cd;
      color: #856404;
      padding: 10px;
      border-radius: 6px;
      margin: 10px 0;
      font-size: 12px;
      font-weight: 600;
      border-left: 3px solid #ffc107;
    `;
    warning.textContent = `⚠️ High-energy task (${analysis.taskType.energyMultiplier}x multiplier)`;
    tooltip.appendChild(warning);
  }

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
    analysis.tips.slice(0, 3).forEach(tip => {
      const tipElement = document.createElement('div');
      tipElement.className = `ecoprompt-tip priority-${tip.priority}`;

      const iconUrl = chrome.runtime.getURL(`assets/${tip.icon}`);

      tipElement.innerHTML = `
        <img src="${iconUrl}" alt="${tip.title}" class="ecoprompt-tip-icon" onerror="this.style.display='none'" />
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

  // View more button
  const viewMoreBtn = document.createElement('button');
  viewMoreBtn.textContent = 'View Full Analysis & Alternatives';
  viewMoreBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 10px;
    font-size: 13px;
  `;
  viewMoreBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'openPopup',
      analysis: currentAnalysis
    });
  });
  tooltip.appendChild(viewMoreBtn);

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

  // Auto-hide after 20 seconds
  setTimeout(() => {
    if (currentTooltip === tooltip) {
      removeTooltip();
    }
  }, 20000);
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
    if (analysis && analysis.tips.length > 0) {
      currentAnalysis = analysis;
      showTooltip(analysis, element);
      createFloatingBadge();

      // Show banner for first significant prompt
      if (!bannerShown && text.trim().length > 50) {
        showNotificationBanner(analysis);
      }
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
      if (analysis && analysis.tips.length > 0) {
        currentAnalysis = analysis;
        showTooltip(analysis, element);
        createFloatingBadge();

        // Show banner for first significant prompt
        if (!bannerShown) {
          showNotificationBanner(analysis);
        }
      }
    }, 2000); // Wait 2 seconds after typing stops
  }
}

// Check if we're on an AI platform and show welcome message
const platform = detectAIPlatform();
if (platform) {
  console.log(`EcoPrompt Coach: Detected ${platform}. Ready to provide tips!`);

  // Show initial badge after a delay
  setTimeout(() => {
    const badge = document.createElement('div');
    badge.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      animation: fadeIn 0.5s ease;
    `;
    badge.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px;">🌱</span>
        <div>
          <div>EcoPrompt Coach Active</div>
          <div style="font-size: 11px; opacity: 0.9;">Start typing to get optimization tips</div>
        </div>
      </div>
    `;

    badge.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });

    document.body.appendChild(badge);

    // Auto-hide after 5 seconds
    setTimeout(() => {
      badge.style.animation = 'fadeOut 0.5s ease';
      setTimeout(() => badge.remove(), 500);
    }, 5000);

    // Add animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
  }, 2000);
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
  } else if (request.action === 'getCurrentAnalysis') {
    sendResponse({ analysis: currentAnalysis });
  }
});
