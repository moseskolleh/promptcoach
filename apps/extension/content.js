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

  // An estimate's grade range ("B–E") is coloured from its low grade to its
  // high one (PLAN.md Step 8).
  function gradeBackground(desc) {
    const from = GRADE_COLORS[desc.gradeLow];
    return desc.gradeHigh && desc.gradeHigh !== desc.gradeLow
      ? `linear-gradient(135deg, ${from}, ${GRADE_COLORS[desc.gradeHigh]})`
      : from;
  }

  const DEFAULT_SETTINGS = globalThis.EcoPromptDefaults;

  let engine = null;
  let conv = null;
  let settings = { ...DEFAULT_SETTINGS };
  // Null when the site's current models are not in the catalog yet: then no
  // estimate is shown, rather than another lab's model.
  let modelId = DEFAULT_SETTINGS.defaultModel;
  // 'picker' | 'mode' | 'host' | 'routed' | 'newer' | 'missing' | 'meta' | 'settings' | 'default'
  let modelSource = 'default';
  let detectedEffort = null; // an effort or mode read off the page
  let detectedMultiAgent = false; // several agents at once (Grok Heavy)
  let catalogIds = []; // every catalog id, for detection's fail-closed check

  let inputEl = null; // the chat prompt input we're attached to
  let pill = null;
  let pillGrade = null;
  let pillText = null;
  let pillEst = null; // "est." marker on a model nobody has measured
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

  /** The saved settings as stored; EcoPromptSettings.resolve applies them. */
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('eco_settings', (data) => {
        resolve((data && data.eco_settings) || {});
      });
    });
  }

  // --------------------------------------------------------------------------
  // Which model is this page using?
  //
  // Priority: the model and effort the page's switcher shows (read from its
  // label — ChatGPT's "Extra High" is many times its "Instant"), then the
  // host's default model, shown as assumed, then a demo page's
  // <meta name="ecoprompt-model"> hint, then the user's settings. A label
  // from a generation newer than the catalog keeps the site default and says
  // so; it never reads as an older model of its line.
  // --------------------------------------------------------------------------

  // Tried in order: elements that *say* they are the model picker first,
  // generic dropdowns and toggles only if those yield nothing — so an
  // unrelated menu button can't mislabel the model.
  const PICKER_SELECTOR_GROUPS = [
    [
      '[data-testid*="model" i]',
      '[aria-label*="model" i]',
      '[id*="model-switch" i]',
      '[class*="model-switch" i]',
      '[class*="model-select" i]',
      '[class*="mode-switch" i]'
    ].join(', '),
    [
      'button[aria-haspopup="menu"]',
      'button[aria-haspopup="listbox"]',
      '[role="combobox"]',
      'button[aria-pressed="true"]',
      '[role="switch"][aria-checked="true"]',
      'button[aria-selected="true"]'
    ].join(', ')
  ];

  function collectModelLabels(selectors) {
    const labels = [];
    let nodes;
    try {
      nodes = document.querySelectorAll(selectors);
    } catch (err) {
      return labels;
    }
    for (const el of nodes) {
      if (labels.length >= 60) break;
      if (el === pill || el === card || (card && card.contains(el))) continue;
      const active =
        el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-checked') === 'true' ||
        el.getAttribute('aria-selected') === 'true' ||
        /(?:^|\s)(?:active|selected|checked|is-active|is-selected)(?:\s|$)/.test(String(el.className || ''));
      const aria = el.getAttribute('aria-label');
      if (aria) labels.push({ text: aria, active });
      const text = el.textContent || '';
      if (text.trim() && text.length <= 80) labels.push({ text, active });
    }
    return labels;
  }

  function pageModelFamily() {
    // Real chat hosts are recognized by hostname; demo pages declare the
    // provider they mimic via <meta name="ecoprompt-family" content="openai">.
    const known = Core.familyForHost(location.hostname);
    if (known) return known;
    const meta = document.querySelector('meta[name="ecoprompt-family"]');
    return meta && meta.content ? meta.content.trim() : null;
  }

  /** The model and effort the page's picker shows, or null. */
  function pickerDetection() {
    const family = pageModelFamily();
    if (!family) return null;
    for (const selectors of PICKER_SELECTOR_GROUPS) {
      const hit = Core.detectModelFromLabels(location.hostname, collectModelLabels(selectors), { family, modelIds: catalogIds });
      // A newer generation stops here: the looser group below could read an
      // unrelated label as an older model (PLAN.md Step 10).
      if (hit && hit.unknownGeneration) return hit;
      if (hit && (hit.effort || (hit.modelId && engine.getModel(hit.modelId)))) return hit;
    }
    return null;
  }

  /** Re-resolve the model and effort; returns true when either changed. */
  function resolveModel() {
    const hit = pickerDetection();
    const site = Core.hostDefault(location.hostname);
    let candidate = hit && hit.modelId && engine.getModel(hit.modelId) ? hit.modelId : null;
    let source = candidate ? (hit.source === 'mode' ? 'mode' : 'picker') : null;
    if (!candidate && site.known) {
      // A supported site: its documented default, shown as an assumption.
      // Its models may not be in the catalog yet (DeepSeek V4): then nothing.
      candidate = site.modelId;
      source = candidate ? (site.routed ? 'routed' : 'host') : 'missing';
    }
    if (!candidate && source !== 'missing') {
      candidate = metaModelHint();
      source = 'meta';
      if (!candidate) {
        candidate = settings.defaultModel;
        source = 'settings';
      }
      if (!candidate || !engine.getModel(candidate)) {
        candidate = DEFAULT_SETTINGS.defaultModel;
        source = 'default';
      }
    }
    // The page names a model the catalog doesn't have yet: say so over
    // whichever default stands in for it.
    if (hit && hit.unknownGeneration && candidate) source = 'newer';
    const effort = hit ? hit.effort : null;
    const multiAgent = hit ? hit.multiAgent : false;
    const changed = candidate !== modelId || source !== modelSource ||
      effort !== detectedEffort || multiAgent !== detectedMultiAgent;
    modelId = candidate;
    modelSource = source;
    detectedEffort = effort;
    detectedMultiAgent = multiAgent;
    return changed;
  }

  // How the card says where the model came from (PLAN.md Step 6).
  const SOURCE_NOTES = {
    picker: ' (detected on page)',
    mode: ' (mode detected on page)',
    host: ' (assumed: site default)',
    routed: ' (router: model not visible, showing site default)',
    newer: ' (newer model on page, not in catalog yet: showing site default)'
  };

  // How the card names an effort read off the page.
  const EFFORT_NOTES = {
    none: 'no thinking',
    low: 'low effort',
    standard: 'standard effort',
    high: 'high effort',
    xhigh: 'extra-high effort',
    max: 'max effort'
  };

  function metaModelHint() {
    const meta = document.querySelector('meta[name="ecoprompt-model"]');
    const hint = meta && meta.content && meta.content.trim();
    return hint && engine.getModel(hint) ? hint : null;
  }

  function impactOptions(extra = {}) {
    return {
      // An effort read off the page beats the saved setting.
      reasoningEffort: detectedEffort || settings.reasoningEffort,
      // A thinking mode read off the page means thinking is on.
      thinkingOn: !!detectedEffort && detectedEffort !== 'none',
      multiAgent: detectedMultiAgent,
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
    pillEst = document.createElement('span');
    pillEst.className = 'epc-pill-est';
    pillEst.textContent = 'est.';
    pillEst.hidden = true;
    pill.append(pillGrade, pillText, pillEst);
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
    if (!modelId && lastAnalysis) {
      const p = document.createElement('p');
      p.className = 'epc-card-empty';
      p.textContent =
        "This site's current models aren't in EcoPrompt's catalog yet, so no estimate is shown rather than another model's.";
      card.appendChild(p);
      return;
    }
    if (!lastImpact || !lastAnalysis) {
      const p = document.createElement('p');
      p.className = 'epc-card-empty';
      p.textContent = 'Start typing a prompt to see its footprint.';
      card.appendChild(p);
      return;
    }
    const head = document.createElement('div');
    head.className = 'epc-card-head';
    const desc = Core.describeImpact(lastImpact);
    const grade = document.createElement('span');
    grade.className = 'epc-card-grade';
    grade.textContent = desc.gradeText;
    grade.style.background = gradeBackground(desc);
    grade.title = desc.gradeLabel;
    const title = document.createElement('span');
    title.className = 'epc-card-title';
    const effortNote = detectedEffort
      ? ` · ${EFFORT_NOTES[detectedEffort] || detectedEffort}${detectedMultiAgent ? ', several agents' : ''}`
      : '';
    title.textContent =
      `${lastImpact.model.name}${SOURCE_NOTES[modelSource] || ''}${effortNote} · ${lastAnalysis.tokens} tokens`;
    head.append(grade, title);
    card.appendChild(head);
    if (desc.estimated) {
      const est = document.createElement('p');
      est.className = 'epc-card-est';
      est.textContent = `${desc.methodChip} · ${desc.note}`;
      est.title = desc.noteReason;
      card.appendChild(est);
    }

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
      pillGrade.title = '';
      pillText.textContent = 'EcoPrompt';
      pillEst.hidden = true;
      if (cardOpen) renderCard();
      return;
    }
    lastAnalysis = Core.analyzePrompt(text);
    if (!modelId) {
      lastImpact = null;
      pillGrade.textContent = '–';
      pillGrade.style.background = '#64748B';
      pillGrade.title = '';
      pillText.textContent = 'model not in catalog yet';
      pillEst.hidden = true;
      if (cardOpen) renderCard();
      return;
    }
    lastImpact = engine.estimateImpact({
      modelId,
      inputTokens: lastAnalysis.tokens,
      outputTokens: lastAnalysis.outputEstimate.estimated,
      options: impactOptions({ taskMultiplier: lastAnalysis.energyMultiplier })
    });
    if (!lastImpact) return;
    // An estimate shows its range, in everyday units, and says it is one.
    const desc = Core.describeImpact(lastImpact);
    const range = lastImpact.energy.range;
    pillGrade.textContent = desc.gradeText;
    pillGrade.style.background = gradeBackground(desc);
    pillGrade.title = desc.gradeLabel;
    pillText.textContent = range
      ? conv.energyRange(range.lowWh, range.highWh).primary
      : conv.energy(lastImpact.energy.wh).primary;
    pillEst.hidden = !desc.estimated;
    pillEst.title = desc.estimated ? `${desc.methodChip} · ${desc.note}` : '';
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
    // An estimate keeps its range, so totals can sum ranges (a null high
    // end is a floor).
    if (lastImpact.energy.range) {
      entry.lowWh = lastImpact.energy.range.lowWh;
      entry.highWh = lastImpact.energy.range.highWh;
    }
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
      // The model switcher lives in the page chrome and re-renders on SPA
      // navigation; re-read it whenever the DOM settles.
      if (resolveModel() && inputEl) analyzeDraft();
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
    const [models, grids, equivalents, saved] = await Promise.all([
      fetchJson('vendor/data/models.json'),
      fetchJson('vendor/data/grids.json'),
      fetchJson('vendor/data/equivalents.json'),
      loadSettings()
    ]);
    engine = new Core.ImpactEngine({ models, grids, equivalents });
    settings = globalThis.EcoPromptSettings.resolve(saved, engine);
    conv = Core.createConverters(equivalents);
    catalogIds = engine.listModels({ includeReference: true }).map((m) => m.id);
    resolveModel();

    buildUi();
    applyPillVisibility();
    attachTo(findPromptInput());

    // Live settings updates from the options page.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.eco_settings) {
        settings = globalThis.EcoPromptSettings.resolve(changes.eco_settings.newValue, engine);
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
