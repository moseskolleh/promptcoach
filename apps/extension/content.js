// EcoPrompt Coach — content script
// Runs on supported AI chat sites. Shows a small floating eco-pill near the
// prompt input with a live grade + relatable energy line, an expandable
// detail card, and records each sent query into chrome.storage.local.
//
// Safety: every node is built with createElement/textContent — user data is
// never passed to innerHTML. All classes are namespaced with .epc-.

'use strict';

(() => {
  if (window.__epcContentLoaded) return;
  window.__epcContentLoaded = true;

  const Core = window.EcoPromptCore;
  if (!Core || !Core.ImpactEngine) return;

  const GRADE_COLORS = {
    A: '#10B981',
    B: '#84CC16',
    C: '#F59E0B',
    D: '#F97316',
    E: '#EF4444'
  };

  const DEFAULT_SETTINGS = {
    defaultModel: 'gpt-4o',
    regionKey: 'default',
    reasoningEffort: 'standard',
    showPill: true,
    includeEmbodied: true
  };

  let engine = null;
  let conv = null;
  let settings = { ...DEFAULT_SETTINGS };
  let modelId = 'gpt-4o';

  let inputEl = null; // the chat prompt input we're attached to
  let pill = null;
  let pillGrade = null;
  let pillText = null;
  let card = null;
  let cardOpen = false;
  let lastAnalysis = null;
  let lastImpact = null;
  let lastRecordTs = 0;

  // --------------------------------------------------------------------------
  // Setup: data + settings
  // --------------------------------------------------------------------------

  async function fetchJson(path) {
    const res = await fetch(chrome.runtime.getURL(path));
    return res.json();
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('eco_settings', (data) => {
        resolve({ ...DEFAULT_SETTINGS, ...(data && data.eco_settings) });
      });
    });
  }

  function resolveModel() {
    // On hosts we don't recognize (the demo site, localhost), a page may hint
    // which model it simulates via <meta name="ecoprompt-model" content="...">.
    // Known chat hosts always win so real sites can't spoof it.
    const detected = Core.autoDetectModel(location.hostname) || metaModelHint();
    const candidate = detected || settings.defaultModel || 'gpt-4o';
    modelId = engine.getModel(candidate) ? candidate : 'gpt-4o';
  }

  function metaModelHint() {
    const meta = document.querySelector('meta[name="ecoprompt-model"]');
    const hint = meta && meta.content && meta.content.trim();
    return hint && engine.getModel(hint) ? hint : null;
  }

  function impactOptions(extra = {}) {
    return {
      reasoningEffort: settings.reasoningEffort,
      regionKey: settings.regionKey,
      includeEmbodied: settings.includeEmbodied,
      ...extra
    };
  }

  // --------------------------------------------------------------------------
  // Prompt input detection
  // --------------------------------------------------------------------------

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 16) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findSendButton(root) {
    const selectors = [
      'button[type="submit"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="submit" i]',
      'button[data-testid*="send" i]',
      '[role="button"][aria-label*="send" i]'
    ];
    return root.querySelector(selectors.join(', '));
  }

  function findPromptInput() {
    const candidates = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"]')
    ).filter(isVisible);
    if (!candidates.length) return null;

    // Prefer the editable nearest (by ancestor distance) to a send button.
    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
      let score = 0;
      let node = el;
      for (let depth = 0; depth < 8 && node; depth++, node = node.parentElement) {
        if (findSendButton(node)) {
          score += 100 - depth * 10;
          break;
        }
      }
      const rect = el.getBoundingClientRect();
      score += Math.min(40, rect.width / 20); // wider inputs more likely the composer
      if (rect.top > window.innerHeight * 0.4) score += 20; // composers sit low
      if (el === document.activeElement) score += 30;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    // Fallback: the focused editable, else the largest candidate.
    if (!best) {
      best = candidates.find((el) => el === document.activeElement) || candidates[0];
    }
    return best;
  }

  function getDraftText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA') return el.value || '';
    return el.innerText || el.textContent || '';
  }

  // --------------------------------------------------------------------------
  // Floating pill + detail card (all textContent, .epc- namespaced)
  // --------------------------------------------------------------------------

  function buildUi() {
    pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'epc-pill';
    pill.setAttribute('aria-label', 'EcoPrompt Coach impact estimate');
    pillGrade = document.createElement('span');
    pillGrade.className = 'epc-pill-grade';
    pillGrade.textContent = 'A';
    pillText = document.createElement('span');
    pillText.className = 'epc-pill-text';
    pillText.textContent = 'EcoPrompt';
    pill.append(pillGrade, pillText);
    pill.addEventListener('click', toggleCard);

    card = document.createElement('div');
    card.className = 'epc-card';
    card.hidden = true;

    document.documentElement.appendChild(pill);
    document.documentElement.appendChild(card);
  }

  function metricRow(label, primary, secondary) {
    const row = document.createElement('div');
    row.className = 'epc-metric';
    const lab = document.createElement('span');
    lab.className = 'epc-metric-label';
    lab.textContent = label;
    const text = document.createElement('span');
    text.className = 'epc-metric-text';
    text.textContent = primary;
    const sub = document.createElement('span');
    sub.className = 'epc-metric-sub';
    sub.textContent = secondary;
    row.append(lab, text, sub);
    return row;
  }

  function renderCard() {
    card.textContent = '';
    if (!lastImpact || !lastAnalysis) {
      const p = document.createElement('p');
      p.className = 'epc-card-empty';
      p.textContent = 'Start typing a prompt to see its footprint.';
      card.appendChild(p);
      return;
    }
    const head = document.createElement('div');
    head.className = 'epc-card-head';
    const grade = document.createElement('span');
    grade.className = 'epc-card-grade';
    grade.textContent = lastImpact.grade.grade;
    grade.style.background = GRADE_COLORS[lastImpact.grade.grade];
    const title = document.createElement('span');
    title.className = 'epc-card-title';
    title.textContent = `${lastImpact.model.name} · ${lastAnalysis.tokens} tokens`;
    head.append(grade, title);
    card.appendChild(head);

    const c = conv.forImpact(lastImpact);
    card.appendChild(metricRow('Energy', c.energy.primary, c.energy.secondary));
    card.appendChild(metricRow('Water', c.water.primary, c.water.secondary));
    card.appendChild(metricRow('Carbon', c.carbon.primary, c.carbon.secondary));

    const saved = lastAnalysis.politeWords.totalTokensSaved;
    if (saved > 0) {
      const trim = document.createElement('p');
      trim.className = 'epc-card-trim';
      trim.textContent =
        `Trimming courtesy phrases would save ~${saved} tokens ` +
        `(${lastAnalysis.politeWords.found.length} found).`;
      card.appendChild(trim);
    }

    for (const tip of lastAnalysis.tips.slice(0, 2)) {
      const tipEl = document.createElement('div');
      tipEl.className = 'epc-tip';
      const t = document.createElement('span');
      t.className = 'epc-tip-title';
      t.textContent = tip.title;
      const d = document.createElement('span');
      d.className = 'epc-tip-desc';
      d.textContent = tip.description;
      tipEl.append(t, d);
      card.appendChild(tipEl);
    }
  }

  function toggleCard() {
    cardOpen = !cardOpen;
    card.hidden = !cardOpen;
    if (cardOpen) {
      renderCard();
      positionUi();
    }
  }

  function positionUi() {
    if (!pill || !inputEl || !inputEl.isConnected) return;
    const rect = inputEl.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    let left = rect.right - pillRect.width;
    let top = rect.bottom + 8;
    if (top + pillRect.height > window.innerHeight - 8) {
      top = rect.top - pillRect.height - 8; // flip above when input hugs the bottom
    }
    left = Math.max(8, Math.min(left, window.innerWidth - pillRect.width - 8));
    top = Math.max(8, top);
    pill.style.left = `${left}px`;
    pill.style.top = `${top}px`;

    if (!card.hidden) {
      const cardRect = card.getBoundingClientRect();
      let cardLeft = Math.max(8, Math.min(left + pillRect.width - cardRect.width,
        window.innerWidth - cardRect.width - 8));
      let cardTop = top - cardRect.height - 8;
      if (cardTop < 8) cardTop = top + pillRect.height + 8;
      card.style.left = `${cardLeft}px`;
      card.style.top = `${cardTop}px`;
    }
  }

  // --------------------------------------------------------------------------
  // Live analysis
  // --------------------------------------------------------------------------

  let analyzeTimer = null;

  function scheduleAnalyze() {
    clearTimeout(analyzeTimer);
    analyzeTimer = setTimeout(analyzeDraft, 300);
  }

  function analyzeDraft() {
    const text = getDraftText(inputEl).trim();
    if (!text) {
      lastAnalysis = null;
      lastImpact = null;
      pillGrade.textContent = '–';
      pillGrade.style.background = '#64748B';
      pillText.textContent = 'EcoPrompt';
      if (cardOpen) renderCard();
      return;
    }
    lastAnalysis = Core.analyzePrompt(text);
    lastImpact = engine.estimateImpact({
      modelId,
      inputTokens: lastAnalysis.tokens,
      outputTokens: lastAnalysis.outputEstimate.estimated,
      options: impactOptions({ taskMultiplier: lastAnalysis.energyMultiplier })
    });
    if (!lastImpact) return;
    pillGrade.textContent = lastImpact.grade.grade;
    pillGrade.style.background = GRADE_COLORS[lastImpact.grade.grade];
    pillText.textContent = conv.energy(lastImpact.energy.wh).primary;
    if (cardOpen) renderCard();
    positionUi();
  }

  // --------------------------------------------------------------------------
  // Send detection + history recording
  // --------------------------------------------------------------------------

  function recordSend() {
    const now = Date.now();
    if (now - lastRecordTs < 1000) return; // Enter + click double-fire guard
    // Recompute synchronously so we record the final draft, not a stale one.
    clearTimeout(analyzeTimer);
    analyzeDraft();
    if (!lastImpact) return;
    lastRecordTs = now;

    const entry = {
      ts: now,
      host: location.hostname,
      modelId,
      energyWh: lastImpact.energy.wh,
      waterMl: lastImpact.water.ml,
      carbonG: lastImpact.carbon.gCO2e,
      grade: lastImpact.grade.grade
    };
    chrome.storage.local.get('eco_history', (data) => {
      const history = Array.isArray(data && data.eco_history) ? data.eco_history : [];
      history.push(entry);
      // Cap history at 5000 entries (drop oldest).
      chrome.storage.local.set({ eco_history: history.slice(-5000) });
    });
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      recordSend();
    }
  }

  function onDocumentClick(event) {
    const button = event.target && event.target.closest
      ? event.target.closest('button, [role="button"]')
      : null;
    if (!button) return;
    const label = (
      (button.getAttribute('aria-label') || '') +
      ' ' + (button.getAttribute('data-testid') || '') +
      ' ' + (button.type === 'submit' ? 'submit' : '')
    ).toLowerCase();
    if (/send|submit/.test(label) && getDraftText(inputEl).trim()) {
      recordSend();
    }
  }

  // --------------------------------------------------------------------------
  // Attachment + SPA survival
  // --------------------------------------------------------------------------

  function attachTo(el) {
    if (inputEl === el) return;
    if (inputEl) {
      inputEl.removeEventListener('input', scheduleAnalyze);
      inputEl.removeEventListener('keydown', onKeyDown);
    }
    inputEl = el;
    if (!inputEl) return;
    inputEl.addEventListener('input', scheduleAnalyze);
    inputEl.addEventListener('keydown', onKeyDown, true);
    analyzeDraft();
    positionUi();
  }

  let scanTimer = null;

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      if (!inputEl || !inputEl.isConnected || !isVisible(inputEl)) {
        attachTo(findPromptInput());
      }
      positionUi();
    }, 500);
  }

  function applyPillVisibility() {
    const show = settings.showPill !== false;
    pill.style.display = show ? '' : 'none';
    if (!show) {
      cardOpen = false;
      card.hidden = true;
    }
  }

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------

  async function init() {
    const [models, grids, equivalents, loaded] = await Promise.all([
      fetchJson('vendor/data/models.json'),
      fetchJson('vendor/data/grids.json'),
      fetchJson('vendor/data/equivalents.json'),
      loadSettings()
    ]);
    settings = loaded;
    engine = new Core.ImpactEngine({ models, grids, equivalents });
    conv = Core.createConverters(equivalents);
    resolveModel();

    buildUi();
    applyPillVisibility();
    attachTo(findPromptInput());

    // Live settings updates from the options page.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.eco_settings) {
        settings = { ...DEFAULT_SETTINGS, ...(changes.eco_settings.newValue || {}) };
        resolveModel();
        applyPillVisibility();
        analyzeDraft();
      }
    });

    // SPA navigation / re-rendered composers: re-scan on DOM mutations.
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });

    // Chat pages auto-scroll continuously while responses stream; coalesce
    // to one reposition per frame so we never thrash the host page's layout.
    let positionQueued = false;
    const positionOnFrame = () => {
      if (positionQueued) return;
      positionQueued = true;
      requestAnimationFrame(() => {
        positionQueued = false;
        positionUi();
      });
    };
    window.addEventListener('resize', positionOnFrame);
    window.addEventListener('scroll', positionOnFrame, { capture: true, passive: true });
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('focusin', scheduleScan);
  }

  init().catch((err) => {
    console.error('EcoPrompt Coach content script failed to initialize:', err);
  });
})();
