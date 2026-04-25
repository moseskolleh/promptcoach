// EcoPrompt Coach - Content Script
// Detects prompt input and provides real-time optimization tips
// Uses shared modules: EcoPromptAnalyzer and EcoPromptCalculator

console.log('EcoPrompt Coach content script loaded');

// ========================================
// HTML ESCAPING
// ========================================

// Escape untrusted text before interpolating into innerHTML templates.
// Tip titles/descriptions are analyzer-authored today, but can contain user-
// derived fragments (e.g. matched polite phrases) — defence in depth.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ========================================
// SETTINGS & STATE
// ========================================

const SETTINGS_KEY = 'ecoprompt_settings';

let settings = {
  autoDetect: true,
  defaultModel: 'gpt-4o',
  showBadge: true,
  showBanner: false,  // Disabled by default - only show bottom right badge
  showConfidence: true,
  liveCalculation: true,
  showModelComparison: false,
  trackHistory: true,
  userRegion: 'default'
};

// Dedup buffer for history writes. We hash recent prompts so the same text
// submitted twice in a short window doesn't double-count. 60s is long enough
// to swallow accidental double-Enter, short enough that a deliberate retry
// after iteration still records.
const RECENT_PROMPT_TTL_MS = 60_000;
const recentPrompts = new Map(); // hash -> timestamp

function hashPrompt(text) {
  // Tiny non-cryptographic hash; collisions are fine here, it's only used
  // to dedup local history writes.
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h) + text.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

function shouldRecordPrompt(text) {
  const now = Date.now();
  // Sweep expired entries.
  for (const [k, t] of recentPrompts) {
    if (now - t > RECENT_PROMPT_TTL_MS) recentPrompts.delete(k);
  }
  const key = hashPrompt(text);
  if (recentPrompts.has(key)) return false;
  recentPrompts.set(key, now);
  return true;
}

let currentTooltip = null;
let lastAnalyzedElement = null;
let floatingBadge = null;
let currentAnalysis = null;
let bannerShown = false;
let calculatorLoaded = false;

// Resolves once both stored settings and benchmark data have loaded.
// Input handlers await this so the first prompt uses the user's saved model,
// not the hardcoded gpt-4o default.
let initReady;

// ========================================
// INITIALIZATION
// ========================================

// Inject tooltip CSS
const cssLink = document.createElement('link');
cssLink.rel = 'stylesheet';
cssLink.href = chrome.runtime.getURL('tooltip.css');
document.head.appendChild(cssLink);

function loadSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([SETTINGS_KEY], (result) => {
        if (result && result[SETTINGS_KEY]) {
          settings = { ...settings, ...result[SETTINGS_KEY] };
        }
        resolve();
      });
    } catch (e) {
      console.error('EcoPrompt: failed to load settings', e);
      resolve();
    }
  });
}

// Load calculator data
async function initCalculator() {
  if (typeof EcoPromptCalculator !== 'undefined' && !calculatorLoaded) {
    try {
      await EcoPromptCalculator.loadData();
      calculatorLoaded = true;
      console.log('EcoPrompt Calculator data loaded');
    } catch (e) {
      console.error('Failed to load calculator data:', e);
    }
  }
}

initReady = Promise.all([loadSettings(), initCalculator()]);

// ========================================
// PLATFORM DETECTION
// ========================================

function detectAIPlatform() {
  const hostname = window.location.hostname;

  const platforms = {
    'chatgpt.com': 'ChatGPT',
    'chat.openai.com': 'ChatGPT',
    'openai.com': 'ChatGPT',
    'claude.ai': 'Claude',
    'anthropic.com': 'Claude',
    'gemini.google.com': 'Gemini',
    'bard.google.com': 'Gemini',
    'copilot.microsoft.com': 'Copilot',
    'bing.com/chat': 'Copilot',
    'poe.com': 'Poe',
    'perplexity.ai': 'Perplexity',
    'you.com': 'You.com',
    'mistral.ai': 'Mistral'
  };

  for (const [domain, platform] of Object.entries(platforms)) {
    if (hostname.includes(domain)) {
      return platform;
    }
  }

  return null;
}

// ========================================
// ANALYSIS FUNCTIONS (Using Shared Modules)
// ========================================

function analyzePrompt(text) {
  if (!text || text.trim().length === 0) return null;
  if (typeof EcoPromptAnalyzer === 'undefined') {
    console.warn('EcoPrompt: shared analyzer not yet loaded');
    return null;
  }
  return EcoPromptAnalyzer.analyzePrompt(text);
}

// ========================================
// IMPACT CALCULATION (Using Shared Calculator)
// ========================================

async function calculateQuickImpact(analysis) {
  if (!calculatorLoaded || typeof EcoPromptCalculator === 'undefined') {
    return null;
  }

  const platform = detectAIPlatform();
  let modelId = settings.defaultModel;

  if (settings.autoDetect && platform) {
    const detected = EcoPromptCalculator.autoDetectModel(window.location.hostname);
    if (detected) modelId = detected;
  }

  // analyzePrompt() returns taskType as a display string and exposes
  // the raw key as taskTypeRaw and the multiplier at the top level.
  const taskKey = analysis.taskTypeRaw || 'GENERAL';
  const multiplier = typeof analysis.energyMultiplier === 'number'
    ? analysis.energyMultiplier
    : 1.0;

  const outputEstimate = typeof EcoPromptAnalyzer !== 'undefined'
    ? EcoPromptAnalyzer.estimateOutputTokens(taskKey, analysis.tokens)
    : { estimated: 300 };

  return EcoPromptCalculator.calculateImpact(
    modelId,
    analysis.tokens,
    outputEstimate.estimated,
    multiplier,
    { regionKey: settings.userRegion || 'default' }
  );
}

// ========================================
// HISTORY RECORDING
// ========================================
//
// We can't reliably write to chrome.storage.local from a content script in
// every browsing context (cross-origin pages have varied behaviour), so we
// route history writes through the background service worker.
//
// We only record when there's strong intent to submit:
//   - paste of a long prompt
//   - Enter pressed in a textarea / contenteditable (without Shift)
//   - click on a Send-shaped button
// Plus 60s dedup in shouldRecordPrompt() so retries don't spam.

function recordHistory(text, analysis, impact) {
  if (!settings.trackHistory) return;
  if (!text || !impact || !analysis) return;
  if (text.trim().length < 20) return;
  if (!shouldRecordPrompt(text)) return;

  const platform = detectAIPlatform() || '';
  const modelId = (settings.autoDetect && platform && typeof EcoPromptCalculator !== 'undefined')
    ? (EcoPromptCalculator.autoDetectModel(window.location.hostname) || settings.defaultModel)
    : settings.defaultModel;

  try {
    chrome.runtime.sendMessage({
      action: 'recordHistory',
      entry: {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        model: modelId,
        platform: platform,
        tokens: analysis.tokens || 0,
        energy: impact.energy?.wh || 0,
        water: impact.water?.ml || 0,
        carbon: impact.carbon?.gCO2e || 0,
        promptPreview: text.slice(0, 80),
        source: 'content_script'
      }
    });
  } catch (e) {
    // Background SW may be cold / restarting — non-fatal.
    console.debug('EcoPrompt: recordHistory send failed', e);
  }
}

// ========================================
// UI COMPONENTS
// ========================================

function createFloatingBadge() {
  if (floatingBadge || !settings.showBadge) return;

  const badge = document.createElement('div');
  badge.className = 'ecoprompt-floating-badge';
  badge.innerHTML = `
    <div class="ecoprompt-badge-icon">🌱</div>
    <div class="ecoprompt-badge-text">Tips Available</div>
  `;

  badge.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'openPopup',
      tab: 'optimize',  // Open on Optimizer tab
      analysis: currentAnalysis
    });
  });

  document.body.appendChild(badge);
  floatingBadge = badge;

  badge.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
    color: white;
    padding: 10px 16px;
    border-radius: 50px;
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.35);
    cursor: pointer;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 600;
    opacity: 0.9;
    transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
    animation: ecoprompt-badge-in 0.35s ease-out;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes ecoprompt-badge-in {
      from { transform: translateY(12px); opacity: 0; }
      to { transform: translateY(0); opacity: 0.9; }
    }
    .ecoprompt-floating-badge:hover {
      opacity: 1 !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 6px 16px rgba(76, 175, 80, 0.5) !important;
    }
    .ecoprompt-badge-icon { font-size: 18px; }
  `;
  document.head.appendChild(style);
}

function showNotificationBanner(analysis) {
  if (bannerShown || !settings.showBanner) return;

  const banner = document.createElement('div');
  banner.className = 'ecoprompt-notification-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
    color: white;
    padding: 16px 20px;
    z-index: 1000000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    animation: slideDown 0.5s ease;
  `;

  const topTip = analysis.tips[0];
  const tipsCount = analysis.tips.length;

  // Add energy estimate if available
  let energyInfo = '';
  if (analysis.energyEstimate) {
    energyInfo = `<span style="margin-left: 10px; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 10px; font-size: 11px;">⚡ ~${analysis.energyEstimate.toFixed(3)} Wh</span>`;
  }

  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
      <span style="font-size: 24px;">🌱</span>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">${escapeHtml(topTip.title)}${energyInfo}</div>
        <div style="font-size: 13px; opacity: 0.95;">${escapeHtml(topTip.description)}</div>
        <div style="font-size: 12px; margin-top: 4px; opacity: 0.9;">💚 ${escapeHtml(topTip.impact)}</div>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="background: rgba(255,255,255,0.2); padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
        ${tipsCount} tip${tipsCount > 1 ? 's' : ''} available
      </div>
      <button class="ecoprompt-banner-btn" style="background: white; color: #4caf50; border: none; padding: 10px 20px; border-radius: 20px; font-weight: 600; cursor: pointer; font-size: 13px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
        View All Tips
      </button>
      <button class="ecoprompt-banner-close" style="background: transparent; border: none; color: white; font-size: 28px; cursor: pointer; padding: 0; width: 35px; height: 35px; line-height: 1;">
        ×
      </button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .ecoprompt-banner-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
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
}

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

  // Token info with task type
  const taskTypeDisplay = analysis.taskType?.displayName || analysis.taskType || 'General';
  const energyMultiplier = analysis.taskType?.energyMultiplier || analysis.energyMultiplier || 1.0;

  const tokenInfo = document.createElement('div');
  tokenInfo.className = 'ecoprompt-token-info';
  tokenInfo.innerHTML = `
    <div class="ecoprompt-token-count">
      <strong>${Number(analysis.tokens) || 0}</strong>
      <span>Tokens</span>
    </div>
    <div class="ecoprompt-task-type">${escapeHtml(taskTypeDisplay)}</div>
  `;
  tooltip.appendChild(tokenInfo);

  // Energy estimate if available
  if (analysis.energyEstimate) {
    const energyDiv = document.createElement('div');
    energyDiv.style.cssText = `
      background: #e8f5e9;
      color: #2e7d32;
      padding: 10px;
      border-radius: 6px;
      margin: 10px 0;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    energyDiv.innerHTML = `
      <span>⚡ Energy: <strong>${analysis.energyEstimate.toFixed(3)} Wh</strong></span>
      <span>💧 Water: <strong>${analysis.waterEstimate?.toFixed(2) || '?'} mL</strong></span>
    `;
    tooltip.appendChild(energyDiv);
  }

  // Energy warning for high-energy tasks
  if (energyMultiplier > 1.5) {
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
    warning.textContent = `⚠️ High-energy task (${energyMultiplier}x multiplier)`;
    tooltip.appendChild(warning);
  }

  // Savings indicator
  if (analysis.politeWords?.totalTokensSaved > 0) {
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

  (analysis.tips || []).slice(0, 4).forEach(tip => {
    const tipElement = document.createElement('div');
    tipElement.className = `ecoprompt-tip priority-${tip.priority}`;

    const iconUrl = chrome.runtime.getURL(`assets/${tip.icon}`);

    // Inline onerror is blocked by the extension CSP (script-src 'self'),
    // so we attach the handler after rendering and let it hide the broken
    // icon without leaving an alt-text artefact.
    tipElement.innerHTML = `
      <img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(tip.title)}" class="ecoprompt-tip-icon" />
      <div class="ecoprompt-tip-content">
        <h4 class="ecoprompt-tip-title">${escapeHtml(tip.title)}</h4>
        <p class="ecoprompt-tip-description">${escapeHtml(tip.description)}</p>
        <p class="ecoprompt-tip-impact">💚 ${escapeHtml(tip.impact)}</p>
      </div>
    `;
    const img = tipElement.querySelector('img.ecoprompt-tip-icon');
    if (img) img.addEventListener('error', () => { img.style.display = 'none'; });
    tipsContainer.appendChild(tipElement);
  });

  tooltip.appendChild(tipsContainer);

  // View more button
  const viewMoreBtn = document.createElement('button');
  viewMoreBtn.textContent = 'View Full Analysis';
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
  closeBtn.addEventListener('click', () => removeTooltip());

  return tooltip;
}

function positionTooltip(tooltip, element) {
  const rect = element.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

  tooltip.style.top = `${rect.bottom + scrollTop + 10}px`;
  tooltip.style.left = `${rect.left + scrollLeft}px`;

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

function showTooltip(analysis, element) {
  removeTooltip();

  const tooltip = createTooltip(analysis, element);
  document.body.appendChild(tooltip);
  positionTooltip(tooltip, element);

  currentTooltip = tooltip;
  lastAnalyzedElement = element;
}

function removeTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

// ========================================
// EVENT HANDLERS
// ========================================

async function handlePaste(event) {
  const element = event.target;

  if (
    element.tagName !== 'TEXTAREA' &&
    !element.isContentEditable &&
    element.tagName !== 'INPUT'
  ) {
    return;
  }

  setTimeout(async () => {
    await initReady;
    const text = element.value || element.textContent || element.innerText;

    if (!text || text.trim().length < 10) return;

    const analysis = analyzePrompt(text);
    if (analysis) {
      const impact = await calculateQuickImpact(analysis);
      if (impact) {
        analysis.energyEstimate = impact.energy.wh;
        analysis.waterEstimate = impact.water.ml;
        analysis.carbonEstimate = impact.carbon.gCO2e;
      }

      currentAnalysis = analysis;

      showTooltip(analysis, element);
      createFloatingBadge();

      if (!bannerShown && text.trim().length > 50) {
        showNotificationBanner(analysis);
      }

      // A paste of a substantial prompt is strong intent — record now.
      // (Enter / send-button paths below also record, dedup catches the
      // overlap when the user pastes-and-hits-Enter.)
      recordHistory(text, analysis, impact);
    }
  }, 100);
}

// Capture Enter-to-submit on AI sites. We listen on the document so we don't
// have to know each platform's exact textarea selector. Shift+Enter inserts
// a newline and is excluded.
async function handleSubmitKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  const element = event.target;
  if (
    element.tagName !== 'TEXTAREA' &&
    !element.isContentEditable &&
    element.tagName !== 'INPUT'
  ) {
    return;
  }
  await initReady;
  const text = element.value || element.textContent || element.innerText || '';
  if (!text || text.trim().length < 20) return;
  const analysis = analyzePrompt(text);
  if (!analysis) return;
  const impact = await calculateQuickImpact(analysis);
  if (!impact) return;
  recordHistory(text, analysis, impact);
}

function handleInput(event) {
  const element = event.target;
  const text = element.value || element.textContent || element.innerText;

  if (text && text.trim().length > 50) {
    clearTimeout(element._ecopromptTimeout);
    element._ecopromptTimeout = setTimeout(async () => {
      await initReady;
      const analysis = analyzePrompt(text);
      if (analysis) {
        const impact = await calculateQuickImpact(analysis);
        if (impact) {
          analysis.energyEstimate = impact.energy.wh;
          analysis.waterEstimate = impact.water.ml;
          analysis.carbonEstimate = impact.carbon.gCO2e;
        }

        currentAnalysis = analysis;

        showTooltip(analysis, element);
        createFloatingBadge();

        if (!bannerShown) {
          showNotificationBanner(analysis);
        }
      }
    }, 2000);
  }
}

// ========================================
// PLATFORM-SPECIFIC SETUP
// ========================================

const platform = detectAIPlatform();
if (platform) {
  console.log(`EcoPrompt Coach: Detected ${platform}. Ready to provide tips!`);
  // Welcome badge disabled - only floating badge at bottom-right is shown
}

// ========================================
// EVENT LISTENERS
// ========================================

document.addEventListener('paste', handlePaste, true);
document.addEventListener('input', handleInput, true);
document.addEventListener('keydown', handleSubmitKeydown, true);

document.addEventListener('click', (event) => {
  if (currentTooltip && !currentTooltip.contains(event.target)) {
    if (lastAnalyzedElement && !lastAnalyzedElement.contains(event.target)) {
      removeTooltip();
    }
  }
});

// ========================================
// MESSAGE HANDLING
// ========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'detectPlatform') {
    sendResponse({ platform: detectAIPlatform() });
  } else if (request.action === 'getCurrentAnalysis') {
    sendResponse({ analysis: currentAnalysis });
  } else if (request.action === 'settingsUpdated') {
    settings = { ...settings, ...request.settings };
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes[SETTINGS_KEY]) {
    settings = { ...settings, ...changes[SETTINGS_KEY].newValue };
  }
});
