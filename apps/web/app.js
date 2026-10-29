/* ==========================================================================
   EcoPrompt Coach — app.js
   Single-page app wiring the shared EcoPromptCore engine (vendor/) to the UI.

   Sections:
     1. Helpers (DOM, formatting)
     2. Theme (light/dark, persisted)
     3. State
     4. Data loading (vendor JSON -> engine + converters)
     5. Hero live demo
     6. Coach (analyze + estimate + render)
     7. Compare
     8. Model explorer
     9. Library (localStorage)
    10. Modal + toast
    11. Nav + init
   ========================================================================== */

'use strict';

/* ============================ 1. Helpers ============================ */

const $ = (id) => document.getElementById(id);

/** createElement shorthand — text is always set via textContent (XSS-safe). */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function debounce(fn, ms) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

// formatWh, describeImpact and savingClaim are top-level functions in
// the core bundle (vendor/core.bundle.js), which shares this page's global scope.

function formatMl(ml) {
  return ml >= 1000 ? `${(ml / 1000).toFixed(2)} L` : `${ml.toFixed(1)} mL`;
}

function formatG(g) {
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg CO₂e` : `${g.toFixed(2)} g CO₂e`;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** Visual fill for range inputs (webkit gradient track). */
function paintSlider(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}

/* Token sliders are logarithmic, so a "yes or no" answer (8 tokens) and a
   pasted report (30,000) both sit on them and no estimate is clamped to fit
   (PLAN.md Step 10). The slider holds a position from 0 to 1000; state holds
   tokens, and a count past either end keeps its value with the knob at the
   end. */
const TOKEN_SCALES = {
  'output-slider': [5, 20000],
  'compare-input-slider': [10, 100000],
  'compare-output-slider': [5, 20000]
};

function sliderToTokens(id, position) {
  const [lo, hi] = TOKEN_SCALES[id];
  const tokens = Math.round(lo * Math.pow(hi / lo, Number(position) / 1000));
  // Assistive tech reads the token count, not the knob position.
  $(id).setAttribute('aria-valuetext', `${tokens} tokens`);
  return tokens;
}

function setTokenSlider(id, tokens) {
  const [lo, hi] = TOKEN_SCALES[id];
  const slider = $(id);
  slider.value = Math.round((1000 * Math.log(clamp(tokens, lo, hi) / lo)) / Math.log(hi / lo));
  slider.setAttribute('aria-valuetext', `${tokens} tokens`);
  paintSlider(slider);
}

const GRADE_DOTS = { A: '🟢', B: '🟢', C: '🟡', D: '🟠', E: '🔴' };

/**
 * Paint a grade element for an impact: one letter for a measured model, a
 * range ("B–E") or a floor ("≥ C") for an estimate (PLAN.md Step 8). A range
 * is coloured from its low grade to its high one. The text goes into
 * `textNode` when the element has a separate one (the coach badge).
 */
function paintGrade(node, desc, textNode = node) {
  textNode.textContent = desc.gradeText;
  node.dataset.grade = desc.gradeLow;
  node.classList.toggle('is-span', desc.gradeText.length > 1);
  if (desc.gradeHigh && desc.gradeHigh !== desc.gradeLow) {
    node.style.setProperty('--grade-from', `var(--grade-${desc.gradeLow.toLowerCase()})`);
    node.style.setProperty('--grade-to', `var(--grade-${desc.gradeHigh.toLowerCase()})`);
    node.dataset.span = 'true';
  } else {
    node.style.removeProperty('--grade-from');
    node.style.removeProperty('--grade-to');
    delete node.dataset.span;
  }
  node.setAttribute('aria-label', desc.gradeLabel);
}

/** The method chip and "likely high" note of an estimate, as info chips. */
function estimateChips(desc) {
  const chips = [];
  if (!desc.estimated) return chips;
  const method = el('span', 'info-chip', desc.methodChip);
  method.dataset.kind = 'estimated';
  chips.push(method);
  const note = el('span', 'info-chip', desc.note);
  note.dataset.kind = 'likely-high';
  note.title = desc.noteReason;
  chips.push(note);
  return chips;
}

/**
 * A percentage saving that never claims more than the ranges allow:
 * "57% less energy" or "at least 54% less energy" (PLAN.md Step 27).
 */
function savingPhrase(claim) {
  return `${claim.atLeast ? 'at least ' : ''}${claim.percentage}% less energy`;
}

/* ============================ 2. Theme ============================ */

const THEME_KEY = 'epc_theme';

function effectiveTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light';
}

function applyStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.setAttribute('data-theme', stored);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const toggle = $('theme-toggle');
  if (toggle) toggle.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
}

function initTheme() {
  applyStoredTheme();
  $('theme-toggle').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyStoredTheme();
  });
}

/* ============================ 3. State ============================ */

const state = {
  engine: null,
  conv: null,
  modelsRaw: null, // parsed models.json (for provider anchors)

  // Coach: the one default model, defined in core (PLAN.md Step 7)
  modelId: EcoPromptCore.DEFAULT_MODEL_ID,
  regionKey: 'default',
  reasoningEffort: 'standard',
  outputTokens: 300,
  outputTouched: false, // user moved the slider manually
  analysis: null,
  impact: null,

  // Compare
  compareIds: [], // set from the catalog at boot: defaultCompareIds()
  compareTouched: false, // user moved compare sliders manually
  compareInput: 100,
  compareOutput: 300,
  compareTaskMultiplier: 1, // the coach prompt's task type, so both agree

  // Library
  librarySearch: '',
  librarySort: 'date-desc',

  // Explorer filters
  explorerSearch: '',
  explorerProvider: '',
  explorerKind: '',

  coachInView: true,
  demoTimer: null
};

/* Example prompts — one per coaching feature, so the first click teaches. */
const EXAMPLE_PROMPTS = [
  {
    label: '🙏 Over-polite email',
    text: 'Hi! I was wondering if you could please help me write a short email to my landlord about a broken heater? Thank you so much in advance for your help!'
  },
  {
    label: '📋 Budgeted summary',
    text: 'Summarize the key findings of the attached report. Answer in 100 words or less, bullet points only.'
  },
  {
    label: '🌦️ Weather question',
    text: "What's the weather forecast for Amsterdam tomorrow?"
  },
  {
    label: '🔬 Deep research',
    text: 'Do deep research across multiple sources on the environmental impact of data centers and compile a report.'
  }
];

/* ============================ 4. Data loading ============================ */

/**
 * The engine over the bundled data. The bundle inlines the catalog and its
 * precomputed coefficients, so nothing is fetched or fitted, and the page
 * works from file:// (PLAN.md Step 13).
 */
async function loadData() {
  if (!EcoPromptCore.createBundledEngine) throw new Error('vendor/core.bundle.js did not load');
  const { engine, converters } = EcoPromptCore.createBundledEngine();
  state.modelsRaw = EcoPromptCore.data.models;
  referenceImpactCache.clear();
  state.engine = engine;
  state.conv = converters;
}

function providerAnchor(modelId) {
  const m = state.engine.getModel(modelId);
  return m ? m.anchor : null;
}

// Per-model impacts at the two reference configs are pure functions of the
// catalog, so they are computed once — not on every explorer filter
// keystroke or model-select rebuild.
const referenceImpactCache = new Map();

function referenceImpact(modelId, inputTokens, outputTokens) {
  const key = `${modelId}|${inputTokens}|${outputTokens}`;
  if (!referenceImpactCache.has(key)) {
    referenceImpactCache.set(key, state.engine.estimateImpact({ modelId, inputTokens, outputTokens }));
  }
  return referenceImpactCache.get(key);
}

/** Grade at the standard short query (100 in / 300 out) — used for dots/cards. */
function shortQueryImpact(modelId) {
  return referenceImpact(modelId, 100, 300);
}

/* ============================ 5. Hero live demo ============================ */

/** Models the catalog lists, cheapest at a short query first. */
function modelsByShortQuery(filter) {
  return state.engine.listModels()
    .filter(filter)
    .sort((a, b) => shortQueryImpact(a.id).energy.wh - shortQueryImpact(b.id).energy.wh);
}

/** A model that always thinks, else any reasoning model, from the catalog. */
function firstThinker(models) {
  return models.find((m) => m.thinking === 'always') || models.find((m) => m.isReasoning) || null;
}

/**
 * Compare's opening trio, from whatever the catalog lists: the greenest
 * small model, the first large model that can think less, and the first
 * model that always thinks, topped up in catalog order. Every 2026 model
 * thinks, so "can think less" means not `always`.
 */
function defaultCompareIds() {
  const models = state.engine.listModels();
  const small = modelsByShortQuery((m) => m.sizeClass === 'Small')[0];
  const large = models.find((m) => m.sizeClass === 'Large' && m.thinking !== 'always');
  const ids = [...new Set([small, large, firstThinker(models)].filter(Boolean).map((m) => m.id))];
  for (const m of models) {
    if (ids.length >= 3) break;
    if (!ids.includes(m.id)) ids.push(m.id);
  }
  return ids;
}

function buildDemoFacts() {
  const engine = state.engine;
  const conv = state.conv;
  const facts = [];
  const short = { inputTokens: 100, outputTokens: 300 };
  const tag = (impact) => (impact.estimate ? ', estimated' : '');

  // Fact 1: a thinking model's answer, in everyday units (computed live).
  const thinker = firstThinker(engine.listModels());
  const thinking = thinker && engine.estimateImpact({ modelId: thinker.id, ...short });
  if (thinking) {
    const e = conv.forImpact(thinking).energy;
    facts.push({
      emoji: '🧠',
      text: `One ${thinking.model.name} answer ≈ ${e.primary} (${e.secondary}${tag(thinking)}).`
    });
  }

  // Fact 2: best vs worst on a typical short question, claiming only what
  // the ranges support.
  const cmp = engine.compareModels({ ...short });
  const claim = cmp.best && cmp.worst && cmp.best !== cmp.worst ? savingClaim(cmp.best, cmp.worst) : null;
  if (claim) {
    facts.push({
      emoji: '⚖️',
      text: `Same question, different model: ${cmp.best.model.name} ` +
        `${claim.claim === 'probably' ? 'probably uses less energy' : `uses ${savingPhrase(claim)}`} than ${cmp.worst.model.name}.`
    });
  }

  // Fact 3: a day of efficient prompting with the greenest everyday model.
  const everyday = modelsByShortQuery((m) => m.sizeClass !== 'Nano')[0];
  const daily = everyday && engine.estimateImpact({ modelId: everyday.id, ...short });
  if (daily) {
    const rel = conv.forImpact(daily, 25);
    facts.push({
      emoji: '💧',
      text: `25 ${daily.model.name} queries a day: ${rel.energy.primary}, and ${rel.water.primary}.`
    });
  }

  return facts;
}

function initDemoStrip() {
  const facts = buildDemoFacts();
  if (!facts.length) return;
  const textEl = $('demo-fact-text');
  const emojiEl = $('demo-fact-emoji');
  const dotsEl = $('demo-dots');
  clearChildren(dotsEl);
  facts.forEach(() => dotsEl.appendChild(el('span')));

  let i = 0;
  const show = (idx) => {
    const fact = facts[idx];
    emojiEl.textContent = fact.emoji;
    textEl.textContent = fact.text;
    Array.from(dotsEl.children).forEach((d, j) => d.classList.toggle('active', j === idx));
    const wrap = $('demo-fact');
    wrap.classList.remove('fact-swap');
    void wrap.offsetWidth; // restart CSS animation
    wrap.classList.add('fact-swap');
  };
  show(0);
  clearInterval(state.demoTimer);
  state.demoTimer = setInterval(() => {
    i = (i + 1) % facts.length;
    show(i);
  }, 5500);
}

/* ============================ 6. Coach ============================ */

function populateModelSelect() {
  const select = $('model-select');
  clearChildren(select);
  const models = state.engine.listModels();

  // Group by provider, keep data-file order within groups.
  const groups = new Map();
  for (const m of models) {
    if (!groups.has(m.provider)) groups.set(m.provider, []);
    groups.get(m.provider).push(m);
  }
  const option = (m) => {
    const impact = shortQueryImpact(m.id);
    const desc = impact ? describeImpact(impact) : null;
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${(desc && GRADE_DOTS[impact.grade.grade]) || '⚪'} ${m.name} — grade ${desc ? desc.gradeText : '?'}` +
      `${m.isReasoning ? ' · reasoning' : ''}${desc && desc.estimated ? ' · estimated' : ''}`;
    return opt;
  };
  for (const [provider, list] of groups) {
    const og = document.createElement('optgroup');
    og.label = provider;
    for (const m of list) og.appendChild(option(m));
    select.appendChild(og);
  }
  if (!state.engine.getModel(state.modelId)) state.modelId = models[0].id;
  // A shared link can open an older model, so its number reproduces
  // (PLAN.md Step 7): it gets a group of its own, never the current list.
  const active = state.engine.getModel(state.modelId);
  if (active.status !== 'current') {
    const og = document.createElement('optgroup');
    og.label = 'Older model, from a shared link';
    og.appendChild(option(active));
    select.appendChild(og);
  }
  select.value = state.modelId;
  syncSuccessorBanner();
}

/** Under an older model, name its current successor and offer to compare. */
function syncSuccessorBanner() {
  const banner = $('successor-banner');
  const model = state.engine.getModel(state.modelId);
  if (!model || model.status === 'current') {
    banner.classList.add('hidden');
    return;
  }
  const successorId = state.engine.currentSuccessor(model.id);
  const successor = successorId && state.engine.getModel(successorId);
  $('successor-text').textContent = successor
    ? `${model.name} is an older model, kept so this shared number reproduces. Its current successor is ${successor.name}.`
    : `${model.name} is an older model, kept so this shared number reproduces. The catalog has no current successor for it.`;
  const btn = $('successor-compare-btn');
  btn.classList.toggle('hidden', !successor);
  if (successor) {
    btn.textContent = `⚖️ Compare with ${successor.name}`;
    btn.dataset.successorId = successor.id;
  }
  banner.classList.remove('hidden');
}

/** Compare the open older model with its successor, in one click. */
function compareWithSuccessor() {
  const successorId = $('successor-compare-btn').dataset.successorId;
  if (!successorId) return;
  state.compareIds = [state.modelId, successorId];
  renderCompareChips();
  renderCompare();
  $('compare').scrollIntoView({ behavior: 'smooth' });
}

function populateRegionSelect() {
  const select = $('region-select');
  clearChildren(select);
  const def = document.createElement('option');
  def.value = 'default';
  def.textContent = 'Provider default grid';
  select.appendChild(def);
  const regions = state.engine.listRegions()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const r of regions) {
    const opt = document.createElement('option');
    opt.value = r.key;
    opt.textContent = `${r.name} (${Math.round(r.cif * 1000)} g CO₂/kWh)`;
    select.appendChild(opt);
  }
  select.value = state.regionKey;
}

function syncReasoningControl() {
  const model = state.engine.getModel(state.modelId);
  const field = $('reasoning-field');
  field.classList.toggle('hidden', !(model && model.isReasoning));
  $('reasoning-control').querySelectorAll('button').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.effort === state.reasoningEffort));
  });
}

function setSegmentWidths(impact) {
  const { fixedWh, inputWh, outputWh } = impact.energy.breakdown;
  const total = Math.max(1e-9, fixedWh + inputWh + outputWh);
  const pct = (x) => `${Math.max(0, (x / total) * 100)}%`;
  // An estimate has no single figure to split, so its legend gives shares;
  // a model that thinks splits only its visible answer, and says so.
  const label = impact.estimate
    ? (x) => `${Math.round(Math.max(0, (x / total) * 100))}%`
    : formatWh;
  $('bar-fixed').style.width = pct(fixedWh);
  $('bar-input').style.width = pct(inputWh);
  $('bar-output').style.width = pct(outputWh);
  $('legend-fixed').textContent = label(fixedWh);
  $('legend-input').textContent = label(inputWh);
  $('legend-output').textContent = label(outputWh);
  const thinking = impact.estimate && impact.estimate.rangeOnly ? impact.estimate.thinkingTokens : null;
  const n = (x) => Math.round(x).toLocaleString('en-US');
  $('breakdown-note').textContent = thinking
    ? `visible answer only · thinking adds ${thinking.lowTokens > 0 ? `${n(thinking.lowTokens)}–` : 'up to '}${n(thinking.highTokens)} hidden tokens`
    : 'output tokens dominate';
  $('energy-breakdown-bar').setAttribute(
    'aria-label',
    `Energy breakdown${thinking ? ' of the visible answer' : ''}: fixed ${label(fixedWh)}, input ${label(inputWh)}, output ${label(outputWh)}`
  );
}

/**
 * Change the prompt text as a one-click coach action, report the measured
 * energy delta in a toast, and offer Undo.
 */
function applyPromptChange(newText, toastPrefix) {
  const prevText = $('prompt-input').value;
  const beforeWh = state.impact ? state.impact.energy.wh : null;
  const beforeGrade = state.impact ? describeImpact(state.impact).gradeText : null;

  $('prompt-input').value = newText;
  state.outputTouched = false; // let the analyzer re-estimate the output
  updateCoach();

  let msg = toastPrefix;
  if (beforeWh && state.impact && state.impact.energy.wh < beforeWh) {
    const pct = Math.round((1 - state.impact.energy.wh / beforeWh) * 100);
    if (pct > 0) msg += ` — ${pct}% less energy`;
    const afterGrade = describeImpact(state.impact).gradeText;
    if (beforeGrade && afterGrade !== beforeGrade) {
      msg += ` (${beforeGrade} → ${afterGrade})`;
    }
  }
  showToast(msg, {
    label: 'Undo',
    onClick: () => {
      $('prompt-input').value = prevText;
      state.outputTouched = false;
      updateCoach();
      showToast('Original prompt restored');
    }
  });
}

function switchModelAction(bestModel, claim) {
  state.modelId = bestModel.id;
  $('model-select').value = bestModel.id;
  syncReasoningControl();
  updateCoach();
  showToast(`🔁 Switched to ${bestModel.name} — ${savingPhrase(claim)} on this prompt`);
}

/**
 * Map a coach tip to a one-click action button, or null when the tip is
 * informational only.
 */
function tipAction(tip, analysis) {
  if (tip.kind === 'polite_words') {
    return {
      label: '✂️ Trim it for me',
      onClick: () => applyPromptChange(
        EcoPromptCore.generateOptimizedPrompt($('prompt-input').value),
        '✂️ Courtesy phrases trimmed'
      )
    };
  }
  if (tip.kind === 'output_budget') {
    return {
      label: '➕ Add "≤100 words"',
      onClick: () => {
        const text = $('prompt-input').value.trim();
        const sep = /[.!?]$/.test(text) ? ' ' : '. ';
        applyPromptChange(`${text}${sep}Answer in ≤100 words.`, '📏 Output budget added');
      }
    };
  }
  if (tip.kind === 'model') {
    // Offer a switch only when a meaningfully greener model exists. Nano-class
    // models are excluded — "switch to a 1B model" isn't credible advice for
    // general tasks; Small (Haiku/mini/Flash class) is the floor the tip text
    // itself recommends. Thinking models count too: every 2026 model thinks,
    // and savingClaim offers a switch only when the ranges don't overlap.
    const candidates = state.engine.listModels()
      .filter((m) => m.sizeClass !== 'Nano')
      .map((m) => m.id);
    if (!candidates.includes(state.modelId)) candidates.push(state.modelId);
    const cmp = state.engine.compareModels({
      modelIds: candidates,
      inputTokens: analysis.tokens,
      outputTokens: state.outputTokens,
      options: {
        taskMultiplier: analysis.energyMultiplier,
        reasoningEffort: state.reasoningEffort,
        regionKey: state.regionKey === 'default' ? undefined : state.regionKey
      }
    });
    const best = cmp.best;
    const current = cmp.results.find((r) => r.model.id === state.modelId);
    if (!best || !current || best.model.id === state.modelId) return null;
    // Only a saving the ranges support: never a percentage between
    // overlapping estimates, and never a switch for "probably less".
    const claim = savingClaim(best, current);
    if (!claim || claim.claim !== 'percent' || claim.percentage < 15) return null;
    return {
      label: `🔁 Switch to ${best.model.name} (${claim.atLeast ? `at least ${claim.percentage}% less` : `−${claim.percentage}%`})`,
      onClick: () => switchModelAction(best.model, claim)
    };
  }
  return null;
}

function renderTips(analysis) {
  const list = $('tips-list');
  clearChildren(list);
  for (const tip of analysis.tips) {
    const item = el('div', 'tip');
    item.dataset.priority = tip.priority || 'low';
    const body = el('div', 'tip-body');
    const title = el('p', 'tip-title');
    title.appendChild(el('span', null, tip.title));
    title.appendChild(el('span', 'tip-priority', tip.priority));
    body.appendChild(title);
    body.appendChild(el('p', 'tip-desc', tip.description));
    if (tip.impact) body.appendChild(el('p', 'tip-impact', `→ ${tip.impact}`));
    const action = tipAction(tip, analysis);
    if (action) {
      const btn = el('button', 'btn btn-secondary tip-action', action.label);
      btn.type = 'button';
      btn.addEventListener('click', action.onClick);
      body.appendChild(btn);
    }
    item.appendChild(body);
    list.appendChild(item);
  }
}

function updateCoach() {
  const text = $('prompt-input').value;
  const analysis = EcoPromptCore.analyzePrompt(text);
  state.analysis = analysis;

  const emptyEl = $('results-empty');
  const bodyEl = $('results-body');

  if (!analysis) {
    state.impact = null;
    state.outputTouched = false;
    emptyEl.classList.remove('hidden');
    bodyEl.classList.add('hidden');
    $('prompt-token-count').textContent = '0 tokens';
    $('prompt-task-type').textContent = '';
    updateStickyPill();
    return;
  }

  $('prompt-token-count').textContent =
    `${analysis.tokens} ${analysis.tokens === 1 ? 'token' : 'tokens'}`;
  $('prompt-task-type').textContent =
    analysis.taskTypeRaw !== 'GENERAL' ? `Detected: ${analysis.taskType}` : '';

  // Default expected output from the analyzer, unless the user took over.
  if (!state.outputTouched) {
    // The analyzer's estimate as it is: "yes or no" is 8 tokens and "in
    // 2000 words" is 2,667 (PLAN.md Step 10).
    state.outputTokens = Math.max(1, Math.round(analysis.outputEstimate.estimated));
    setTokenSlider('output-slider', state.outputTokens);
    $('output-slider-value').textContent = String(state.outputTokens);
  }

  const impact = coachImpact(analysis, {
    modelId: state.modelId,
    region: state.regionKey,
    effort: state.reasoningEffort,
    outTokens: state.outputTokens
  });
  state.impact = impact;
  if (!impact) return;

  emptyEl.classList.add('hidden');
  bodyEl.classList.remove('hidden');

  // Grade
  const desc = describeImpact(impact);
  paintGrade($('grade-badge'), desc, $('grade-letter'));
  $('grade-summary').textContent =
    `${impact.model.name} · ${analysis.taskType} · ${impact.category} query`;
  // A model nobody has measured has no single figure to score: its range
  // and method stand in for the eco-score.
  $('grade-detail').textContent = desc.estimated
    ? (desc.rangeOnly ? `${desc.whText} per query` : `about ${desc.whText} per query (${desc.rangeText})`)
    : `${formatWh(impact.energy.wh)} per query · eco-score ${impact.grade.score}/100` +
      (impact.energy.extrapolated ? ' · extrapolated beyond benchmark range' : '');
  const chipRow = $('grade-chips');
  clearChildren(chipRow);
  for (const chip of estimateChips(desc)) chipRow.appendChild(chip);
  chipRow.classList.toggle('hidden', !desc.estimated);

  // Metric cards
  const rel = state.conv.forImpact(impact);
  $('energy-primary').textContent = rel.energy.primary;
  $('energy-secondary').textContent = rel.energy.secondary;
  $('energy-range').textContent = desc.estimated
    ? `${desc.methodChip} · ${desc.note}`
    : `range ${formatWh(impact.energy.confidence.minWh)} – ${formatWh(impact.energy.confidence.maxWh)}`;

  $('water-primary').textContent = rel.water.primary;
  $('water-secondary').textContent = rel.water.secondary;
  $('water-detail').textContent =
    `incl. ${formatMl(impact.water.breakdown.offsiteMl)} off-site (power generation)`;

  $('carbon-primary').textContent = rel.carbon.primary;
  $('carbon-secondary').textContent = rel.carbon.secondary;
  const cifLabel = state.regionKey === 'default'
    ? `${impact.model.host} grid`
    : 'your selected grid';
  // A host with no published figures borrows another's, and says so.
  const proxy = impact.factors.hostProxyOf && state.engine.grids.providers[impact.factors.hostProxyOf];
  $('carbon-detail').textContent =
    `${Math.round(impact.factors.cif * 1000)} g CO₂/kWh · ${cifLabel} · incl. 15% embodied` +
    (proxy ? ` · borrowed from ${proxy.name} until ${impact.model.provider}'s own figures are read` : '');

  setSegmentWidths(impact);
  renderTips(analysis);
  updateStickyPill();

  // Copy-trimmed button only when courtesy phrases were found.
  $('copy-trimmed-btn').classList.toggle(
    'hidden', analysis.politeWords.totalTokensSaved === 0
  );

  // Compare prices the same task as the coach (PLAN.md Step 10), and
  // mirrors its tokens unless the user took over those sliders. Skip the
  // (full-section) rebuild when nothing it shows changed.
  let compareStale = analysis.energyMultiplier !== state.compareTaskMultiplier;
  state.compareTaskMultiplier = analysis.energyMultiplier;
  if (!state.compareTouched) {
    const nextInput = analysis.tokens;
    const nextOutput = state.outputTokens;
    if (nextInput !== state.compareInput || nextOutput !== state.compareOutput) {
      state.compareInput = nextInput;
      state.compareOutput = nextOutput;
      syncCompareSliders();
      compareStale = true;
    }
  }
  if (compareStale) renderCompare();
}

const updateCoachDebounced = debounce(updateCoach, 220);

/* --- Sticky mini grade: visible while an analysis exists and the coach
       section is scrolled out of view; clicking jumps back. --- */

function updateStickyPill() {
  const pill = $('sticky-pill');
  if (!state.impact) {
    pill.classList.add('hidden');
    return;
  }
  paintGrade($('sticky-grade'), describeImpact(state.impact));
  // An estimate shows its range here too, in everyday units.
  const range = state.impact.energy.range;
  $('sticky-text').textContent = range
    ? state.conv.energyRange(range.lowWh, range.highWh).primary
    : state.conv.energy(state.impact.energy.wh).primary;
  pill.classList.toggle('hidden', state.coachInView);
}

function initStickyPill() {
  $('sticky-pill').addEventListener('click', () => {
    $('coach').scrollIntoView({ behavior: 'smooth' });
    $('prompt-input').focus({ preventScroll: true });
  });
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    state.coachInView = entries[0].isIntersecting;
    updateStickyPill();
  }, { rootMargin: '-64px 0px 0px 0px' });
  observer.observe($('coach'));
}

/* --- Example chips: a first click that teaches --- */

function initExampleChips() {
  const wrap = $('example-chips');
  clearChildren(wrap);
  for (const ex of EXAMPLE_PROMPTS) {
    const chip = el('button', 'example-chip', ex.label);
    chip.type = 'button';
    chip.title = ex.text;
    chip.addEventListener('click', () => {
      $('prompt-input').value = ex.text;
      state.outputTouched = false;
      updateCoach();
      $('prompt-input').focus();
    });
    wrap.appendChild(chip);
  }
}

/* --- Share links: #share?p=…&m=… round-trips prompt + settings --- */

function buildShareLink() {
  const text = $('prompt-input').value.trim();
  const params = new URLSearchParams();
  params.set('p', text.slice(0, 6000));
  params.set('m', state.modelId);
  if (state.regionKey !== 'default') params.set('r', state.regionKey);
  if (state.reasoningEffort !== 'standard') params.set('e', state.reasoningEffort);
  // An answer length the user set is part of the number being shared.
  if (state.outputTouched) params.set('o', String(state.outputTokens));
  return `${location.origin}${location.pathname}#share?${params.toString()}`;
}

/**
 * The coach's estimate for a prompt's analysis and its inputs. The coach, a
 * share link and the library all price a prompt with it, so the same inputs
 * give the same number everywhere.
 */
function coachImpact(analysis, { modelId, region, effort, outTokens }) {
  return state.engine.estimateImpact({
    modelId,
    inputTokens: analysis.tokens,
    outputTokens: outTokens,
    options: {
      taskMultiplier: analysis.energyMultiplier,
      reasoningEffort: effort,
      regionKey: region === 'default' ? undefined : region
    }
  });
}

/** Valid coach inputs, or their defaults: a bad value never reaches the engine. */
function cleanCoachInputs({ modelId, region, effort, outTokens }) {
  return {
    modelId: typeof modelId === 'string' && state.engine.getModel(modelId) ? modelId : null,
    region: typeof region === 'string' && state.engine.getRegionCif(region) !== null ? region : 'default',
    effort: effort === 'low' || effort === 'high' ? effort : 'standard',
    outTokens: Number.isInteger(outTokens) && outTokens > 0 && outTokens <= 200000 ? outTokens : null
  };
}

/**
 * Load a prompt and its inputs into the coach: a share link and the
 * library's Open in coach both do. Every input comes from the caller or its
 * default, so a second prompt doesn't inherit the first's.
 */
function openInCoach(text, inputs) {
  const clean = cleanCoachInputs(inputs);
  $('prompt-input').value = text;
  if (clean.modelId) {
    // An older id opens as that model, so the shared number reproduces;
    // the picker lists it and a banner names its successor.
    state.modelId = clean.modelId;
    populateModelSelect();
  }
  state.regionKey = clean.region;
  $('region-select').value = state.regionKey;
  state.reasoningEffort = clean.effort;
  state.outputTouched = clean.outTokens !== null;
  if (state.outputTouched) {
    state.outputTokens = clean.outTokens;
    setTokenSlider('output-slider', clean.outTokens);
    $('output-slider-value').textContent = String(clean.outTokens);
  }
  syncReasoningControl();
  updateCoach();
  renderCompare();
  requestAnimationFrame(() => $('coach').scrollIntoView());
}

function applySharedLink() {
  if (!location.hash.startsWith('#share?')) return false;
  const params = new URLSearchParams(location.hash.slice('#share?'.length));
  const p = params.get('p');
  if (!p) return false;
  openInCoach(p, {
    modelId: params.get('m'),
    region: params.get('r'),
    effort: params.get('e'),
    outTokens: Number(params.get('o'))
  });
  return true;
}

function initCoach() {
  populateModelSelect();
  populateRegionSelect();
  syncReasoningControl();
  setTokenSlider('output-slider', state.outputTokens);

  $('prompt-input').addEventListener('input', updateCoachDebounced);

  $('model-select').addEventListener('change', (e) => {
    state.modelId = e.target.value;
    syncReasoningControl();
    syncSuccessorBanner();
    updateCoach();
  });
  $('successor-compare-btn').addEventListener('click', compareWithSuccessor);

  // Compare uses the same region and effort, so it re-renders with them.
  $('region-select').addEventListener('change', (e) => {
    state.regionKey = e.target.value;
    updateCoach();
    renderCompare();
  });

  $('reasoning-control').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-effort]');
    if (!btn) return;
    state.reasoningEffort = btn.dataset.effort;
    syncReasoningControl();
    updateCoach();
    renderCompare();
  });

  const slider = $('output-slider');
  slider.addEventListener('input', () => {
    state.outputTouched = true;
    state.outputTokens = sliderToTokens('output-slider', slider.value);
    $('output-slider-value').textContent = String(state.outputTokens);
    paintSlider(slider);
    updateCoachDebounced();
  });

  $('copy-trimmed-btn').addEventListener('click', async () => {
    const text = $('prompt-input').value;
    const trimmed = EcoPromptCore.generateOptimizedPrompt(text);
    const ok = await copyToClipboard(trimmed);
    const saved = state.analysis ? state.analysis.politeWords.totalTokensSaved : 0;
    showToast(ok ? `✂️ Trimmed prompt copied — ~${saved} tokens lighter` : 'Copy failed — clipboard unavailable');
  });

  $('share-link-btn').addEventListener('click', async () => {
    if (!$('prompt-input').value.trim()) {
      showToast('Type a prompt first, then share it');
      return;
    }
    const ok = await copyToClipboard(buildShareLink());
    showToast(ok
      ? '🔗 Link copied — it opens with this prompt and settings'
      : 'Copy failed — clipboard unavailable');
  });

  initExampleChips();
  initStickyPill();

  $('save-library-btn').addEventListener('click', () => {
    if (!state.analysis || !state.impact) {
      showToast('Type a prompt first, then save it');
      return;
    }
    openSaveModal();
  });
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for insecure contexts.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err2) {
      return false;
    }
  }
}

/* ============================ 7. Compare ============================ */

function syncCompareSliders() {
  setTokenSlider('compare-input-slider', state.compareInput);
  setTokenSlider('compare-output-slider', state.compareOutput);
  $('compare-input-value').textContent = String(state.compareInput);
  $('compare-output-value').textContent = String(state.compareOutput);
}

/**
 * Toggle a model in/out of the compare set (shared by the Compare chips and
 * the explorer's per-card buttons). Returns true when the set changed.
 */
function toggleCompareModel(modelId) {
  const i = state.compareIds.indexOf(modelId);
  if (i >= 0) {
    if (state.compareIds.length <= 2) {
      showToast('Keep at least 2 models to compare');
      return false;
    }
    state.compareIds.splice(i, 1);
  } else {
    if (state.compareIds.length >= 4) {
      showToast('Pick at most 4 models — remove one first');
      return false;
    }
    state.compareIds.push(modelId);
  }
  syncCompareChipStates();
  renderCompare();
  return true;
}

function syncCompareChipStates() {
  $('compare-chips').querySelectorAll('.chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(state.compareIds.includes(chip.dataset.modelId)));
  });
  document.querySelectorAll('.explorer-compare-btn').forEach((btn) => {
    const active = state.compareIds.includes(btn.dataset.modelId);
    btn.setAttribute('aria-pressed', String(active));
    btn.textContent = active ? '✓ In compare' : '⚖️ Compare';
  });
}

function renderCompareChips() {
  const wrap = $('compare-chips');
  clearChildren(wrap);
  // Current models, plus an older one being compared with its successor.
  const older = state.compareIds
    .map((id) => state.engine.getModel(id))
    .filter((m) => m && m.status !== 'current');
  for (const m of [...state.engine.listModels(), ...older]) {
    const chip = el('button', 'chip', m.status === 'current' ? m.name : `${m.name} (older)`);
    chip.type = 'button';
    chip.dataset.modelId = m.id;
    chip.setAttribute('aria-pressed', String(state.compareIds.includes(m.id)));
    chip.addEventListener('click', () => toggleCompareModel(m.id));
    wrap.appendChild(chip);
  }
}

function compareMetricRow(label, primary, tech) {
  const row = el('div', 'compare-metric');
  row.appendChild(el('span', 'cm-label', label));
  const val = el('span', 'cm-value');
  val.appendChild(el('span', null, primary));
  val.appendChild(el('span', 'cm-tech', tech));
  row.appendChild(val);
  return row;
}

function renderCompare() {
  const cmp = state.engine.compareModels({
    modelIds: state.compareIds,
    inputTokens: state.compareInput,
    outputTokens: state.compareOutput,
    options: {
      taskMultiplier: state.compareTaskMultiplier,
      reasoningEffort: state.reasoningEffort,
      regionKey: state.regionKey === 'default' ? undefined : state.regionKey
    }
  });

  // Savings banner: only what the ranges support (PLAN.md Step 27).
  const banner = $('savings-banner');
  const claim = cmp.best && cmp.worst && cmp.best !== cmp.worst ? savingClaim(cmp.best, cmp.worst) : null;
  if (claim && claim.claim === 'percent') {
    const per100 = state.conv.energy(claim.energyWh * 100);
    $('savings-text').textContent =
      `Switching from ${cmp.worst.model.name} to ${cmp.best.model.name} saves ` +
      (claim.atLeast
        ? `at least ${claim.percentage}% — at least ${per100.primary} per 100 queries.`
        : `${claim.percentage}% — that's ${per100.primary} per 100 queries.`);
    banner.classList.remove('hidden');
  } else if (claim) {
    $('savings-text').textContent =
      `${cmp.best.model.name} probably uses less energy than ${cmp.worst.model.name}, ` +
      'but their estimated ranges overlap, so no saving is claimed.';
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  const wrap = $('compare-results');
  clearChildren(wrap);
  // With an estimate in the set, the order is by centre of range: likely,
  // not certain.
  const greenest = cmp.results.some((r) => r.energy.range) ? 'Likely greenest' : 'Greenest';

  // --- Mobile cards ---
  const cards = el('div', 'compare-cards');
  cmp.results.forEach((r, idx) => {
    const rel = state.conv.forImpact(r);
    const card = el('div', 'compare-card' + (idx === 0 ? ' is-best' : ''));
    const head = el('div', 'compare-card-head');
    const nameWrap = el('div');
    nameWrap.appendChild(el('div', 'compare-card-name', r.model.name));
    nameWrap.appendChild(el('div', 'compare-card-provider', r.model.provider));
    head.appendChild(nameWrap);
    const desc = describeImpact(r);
    const headRight = el('div');
    if (idx === 0) headRight.appendChild(el('span', 'best-tag', greenest));
    const pill = el('span', 'grade-pill');
    paintGrade(pill, desc);
    pill.style.marginLeft = '0.5em';
    headRight.appendChild(pill);
    head.appendChild(headRight);
    card.appendChild(head);
    if (desc.estimated) {
      const chips = el('div', 'grade-chips');
      for (const chip of estimateChips(desc)) chips.appendChild(chip);
      card.appendChild(chips);
    }
    card.appendChild(compareMetricRow('⚡ Energy', rel.energy.primary, rel.energy.secondary));
    card.appendChild(compareMetricRow('💧 Water', rel.water.primary, rel.water.secondary));
    card.appendChild(compareMetricRow('🌍 Carbon', rel.carbon.primary, rel.carbon.secondary));
    cards.appendChild(card);
  });
  wrap.appendChild(cards);

  // --- Desktop table ---
  const table = el('table', 'compare-table');
  const caption = el('caption', 'visually-hidden',
    'Model comparison: eco-grade, energy, water and carbon per query');
  table.appendChild(caption);
  const thead = el('thead');
  const headRow = el('tr');
  for (const h of ['Model', 'Grade', '⚡ Energy', '💧 Water', '🌍 Carbon']) {
    const th = el('th', null, h);
    th.scope = 'col';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  cmp.results.forEach((r, idx) => {
    const rel = state.conv.forImpact(r);
    const tr = el('tr', idx === 0 ? 'is-best' : '');
    const tdModel = el('td');
    const nm = el('span', 'cell-model', r.model.name);
    tdModel.appendChild(nm);
    const desc = describeImpact(r);
    if (idx === 0) {
      const tag = el('span', 'best-tag', greenest);
      tag.style.marginLeft = '0.5em';
      tdModel.appendChild(tag);
    }
    tdModel.appendChild(el('span', 'cell-provider', r.model.provider));
    if (desc.estimated) {
      const chips = el('div', 'grade-chips');
      for (const chip of estimateChips(desc)) chips.appendChild(chip);
      tdModel.appendChild(chips);
    }
    tr.appendChild(tdModel);

    const tdGrade = el('td');
    const pill = el('span', 'grade-pill');
    paintGrade(pill, desc);
    tdGrade.appendChild(pill);
    tr.appendChild(tdGrade);

    const cell = (primary, tech) => {
      const td = el('td');
      td.appendChild(el('span', null, primary));
      td.appendChild(el('span', 'cm-tech', tech));
      return td;
    };
    tr.appendChild(cell(rel.energy.primary, rel.energy.secondary));
    tr.appendChild(cell(rel.water.primary, rel.water.secondary));
    tr.appendChild(cell(rel.carbon.primary, rel.carbon.secondary));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  renderCompareChart(cmp.results);
}

const GRADE_COLORS = {
  A: '#10B981', B: '#84CC16', C: '#F59E0B', D: '#F97316', E: '#EF4444'
};

function renderCompareChart(results) {
  const wrap = $('compare-chart');
  clearChildren(wrap);
  if (!results.length) return;

  const NS = 'http://www.w3.org/2000/svg';
  const rowH = 52;
  const labelH = 18;
  const barH = 16;
  const width = 600;
  const height = results.length * rowH + 4;
  // An estimate is a solid bar to its low end and a faint span to its high
  // end; a floor's span runs to the edge. Its label is the range.
  const descs = results.map(describeImpact);
  const reserve = descs.some((d) => d.estimated) ? 120 : 90;
  const span = width - reserve;
  const topWh = (r, d) => (d.estimated ? (d.highWh === null ? d.lowWh : d.highWh) : r.energy.wh);
  const maxWh = Math.max(...results.map((r, i) => topWh(r, descs[i])), 1e-9);
  const valueText = (r, d) => (d.estimated ? d.rangeText : formatWh(r.energy.wh));

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label',
    'Bar chart of energy per query: ' +
    results.map((r, i) => `${r.model.name} ${valueText(r, descs[i])}`).join(', '));

  const bars = [];
  results.forEach((r, i) => {
    const y = i * rowH;
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', '0');
    label.setAttribute('y', String(y + labelH - 4));
    label.setAttribute('class', 'chart-label');
    label.textContent = `${r.model.name}`;
    svg.appendChild(label);

    const track = document.createElementNS(NS, 'rect');
    track.setAttribute('x', '0');
    track.setAttribute('y', String(y + labelH));
    track.setAttribute('width', String(width));
    track.setAttribute('height', String(barH));
    track.setAttribute('rx', '8');
    track.setAttribute('class', 'chart-track');
    svg.appendChild(track);

    const d = descs[i];
    const solidWh = d.estimated ? d.lowWh : r.energy.wh;
    const targetW = Math.max(8, (solidWh / maxWh) * span);
    let endW = targetW;
    if (d.estimated) {
      endW = d.highWh === null ? span : Math.max(targetW, (d.highWh / maxWh) * span);
      const rangeBar = document.createElementNS(NS, 'rect');
      rangeBar.setAttribute('x', '0');
      rangeBar.setAttribute('y', String(y + labelH));
      rangeBar.setAttribute('width', String(endW));
      rangeBar.setAttribute('height', String(barH));
      rangeBar.setAttribute('rx', '8');
      rangeBar.setAttribute('class', 'chart-span');
      rangeBar.setAttribute('fill', GRADE_COLORS[d.gradeHigh || d.gradeLow] || '#10B981');
      svg.appendChild(rangeBar);
    }
    const bar = document.createElementNS(NS, 'rect');
    bar.setAttribute('x', '0');
    bar.setAttribute('y', String(y + labelH));
    bar.setAttribute('width', '8');
    bar.setAttribute('height', String(barH));
    bar.setAttribute('rx', '8');
    bar.setAttribute('class', 'chart-bar');
    bar.setAttribute('fill', GRADE_COLORS[d.gradeLow] || '#10B981');
    svg.appendChild(bar);
    bars.push({ bar, targetW, value: solidWh, y: y + labelH });

    const value = document.createElementNS(NS, 'text');
    value.setAttribute('x', String(endW + 8));
    value.setAttribute('y', String(y + labelH + barH - 3));
    value.setAttribute('class', 'chart-value');
    value.textContent = valueText(r, d);
    svg.appendChild(value);
  });

  wrap.appendChild(svg);
  // Animate widths on the next frame (CSS transition on .chart-bar).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bars.forEach(({ bar, targetW }) => bar.setAttribute('width', String(targetW)));
    });
  });
}

function initCompare() {
  renderCompareChips();
  syncCompareSliders();

  const inSlider = $('compare-input-slider');
  const outSlider = $('compare-output-slider');
  const onSlide = debounce(renderCompare, 150);
  inSlider.addEventListener('input', () => {
    state.compareTouched = true;
    state.compareInput = sliderToTokens('compare-input-slider', inSlider.value);
    $('compare-input-value').textContent = String(state.compareInput);
    paintSlider(inSlider);
    onSlide();
  });
  outSlider.addEventListener('input', () => {
    state.compareTouched = true;
    state.compareOutput = sliderToTokens('compare-output-slider', outSlider.value);
    $('compare-output-value').textContent = String(state.compareOutput);
    paintSlider(outSlider);
    onSlide();
  });

  renderCompare();
}

/* ============================ 8. Model explorer ============================ */

function explorerMatches(meta) {
  const q = state.explorerSearch.trim().toLowerCase();
  if (q && !`${meta.name} ${meta.provider} ${meta.host}`.toLowerCase().includes(q)) return false;
  if (state.explorerProvider && meta.provider !== state.explorerProvider) return false;
  if (state.explorerKind === 'reasoning' && !meta.isReasoning) return false;
  if (state.explorerKind === 'standard' && meta.isReasoning) return false;
  return true;
}

function initExplorerToolbar() {
  const providerSelect = $('explorer-provider');
  const providers = [...new Set(state.engine.listModels().map((m) => m.provider))].sort();
  for (const p of providers) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    providerSelect.appendChild(opt);
  }
  $('explorer-search').addEventListener('input', debounce((e) => {
    state.explorerSearch = e.target.value;
    renderExplorer();
  }, 120));
  providerSelect.addEventListener('change', (e) => {
    state.explorerProvider = e.target.value;
    renderExplorer();
  });
  $('explorer-kind').addEventListener('change', (e) => {
    state.explorerKind = e.target.value;
    renderExplorer();
  });
}

function renderExplorer() {
  const grid = $('explorer-grid');
  clearChildren(grid);

  const models = state.engine.listModels()
    .filter(explorerMatches)
    .map((m) => ({ meta: m, short: shortQueryImpact(m.id) }))
    .filter((x) => x.short)
    .sort((a, b) => a.short.energy.wh - b.short.energy.wh);

  $('explorer-no-match').classList.toggle('hidden', models.length > 0);

  for (const { meta, short } of models) {
    const long = referenceImpact(meta.id, 10000, 1500);

    const card = el('article', 'explorer-card');

    const head = el('div', 'explorer-head');
    const names = el('div');
    names.appendChild(el('div', 'explorer-name', meta.name));
    names.appendChild(el('div', 'explorer-provider', `${meta.provider} · ${meta.host} · ${meta.sizeClass}`));
    head.appendChild(names);
    const desc = describeImpact(short);
    const pill = el('span', 'grade-pill');
    paintGrade(pill, desc);
    pill.setAttribute('aria-label', `${desc.gradeLabel} at a short query`);
    head.appendChild(pill);
    card.appendChild(head);

    const stats = el('div', 'explorer-stats');
    const mkStat = (label, value) => {
      const s = el('div', 'explorer-stat');
      s.appendChild(el('span', 'stat-label', label));
      s.appendChild(el('span', 'stat-value', value));
      return s;
    };
    // An estimate's figures are its ranges.
    const whOf = (impact) => (impact.energy.range ? describeImpact(impact).rangeText : formatWh(impact.energy.wh));
    stats.appendChild(mkStat('Short query', whOf(short)));
    if (long) stats.appendChild(mkStat('Long query', whOf(long)));
    card.appendChild(stats);

    const chips = el('div', 'explorer-chips');
    if (desc.estimated) {
      for (const chip of estimateChips(desc)) chips.appendChild(chip);
    } else {
      const src = el('span', 'info-chip', meta.dataSource);
      src.dataset.kind = meta.dataSource;
      chips.appendChild(src);
    }
    if (meta.isReasoning) {
      const rc = el('span', 'info-chip', 'reasoning model');
      rc.dataset.kind = 'reasoning';
      chips.appendChild(rc);
    }
    const anchor = providerAnchor(meta.id);
    if (anchor && typeof anchor.energy_wh === 'number') {
      const ac = el('span', 'info-chip',
        `${meta.provider}-reported: ${anchor.energy_wh} Wh`);
      ac.dataset.kind = 'anchor';
      if (anchor.label) ac.title = anchor.label;
      chips.appendChild(ac);
    }
    card.appendChild(chips);

    const inCompare = state.compareIds.includes(meta.id);
    const cmpBtn = el('button', 'icon-btn explorer-compare-btn',
      inCompare ? '✓ In compare' : '⚖️ Compare');
    cmpBtn.type = 'button';
    cmpBtn.dataset.modelId = meta.id;
    cmpBtn.setAttribute('aria-pressed', String(inCompare));
    cmpBtn.addEventListener('click', () => {
      const changed = toggleCompareModel(meta.id);
      if (changed && state.compareIds.includes(meta.id)) {
        showToast(`⚖️ ${meta.name} added to Compare`, {
          label: 'View',
          onClick: () => $('compare').scrollIntoView({ behavior: 'smooth' })
        });
      }
    });
    card.appendChild(cmpBtn);

    grid.appendChild(card);
  }
}

/* ============================ 9. Library ============================ */

const LIBRARY_KEY = 'epc_library';

function readLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeLibrary(items) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
  } catch (err) {
    showToast('Could not save — browser storage unavailable');
  }
}

/**
 * A library entry's inputs. A saved prompt keeps what it was priced from
 * (model, region, effort, the answer length if set by hand), never frozen
 * figures, so it is re-estimated with today's catalog every time it is shown
 * (PLAN.md Step 11). Entries saved before v2 kept no region or effort: they
 * read as the defaults, with the answer length they were saved at.
 */
function libraryInputs(it) {
  const legacyOut = it.tokens && typeof it.tokens === 'object' ? Number(it.tokens.output) : NaN;
  return cleanCoachInputs({
    modelId: it.modelId,
    region: it.region,
    effort: it.effort,
    outTokens: it.v === 2 ? it.outTokens : Math.round(legacyOut)
  });
}

/** An entry's estimate today: { inputs, impact }, impact null when it can't be priced. */
function libraryEstimate(it) {
  const inputs = libraryInputs(it);
  const analysis = typeof it.text === 'string' ? EcoPromptCore.analyzePrompt(it.text) : null;
  const impact = inputs.modelId && analysis
    ? coachImpact(analysis, { ...inputs, outTokens: inputs.outTokens || analysis.outputEstimate.estimated })
    : null;
  return { inputs, impact };
}

function saveLibraryEntry(title) {
  const items = readLibrary();
  items.push({
    v: 2,
    id: `epc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: title || 'Untitled prompt',
    text: $('prompt-input').value,
    modelId: state.modelId,
    region: state.regionKey,
    effort: state.reasoningEffort,
    // Only a length set by hand: otherwise the analyzer's estimate, then.
    outTokens: state.outputTouched ? state.outputTokens : null,
    ts: Date.now()
  });
  writeLibrary(items);
  renderLibrary();
  showToast('📚 Saved to your library');
}

function renderLibrary() {
  const listEl = $('library-list');
  const emptyEl = $('library-empty');
  clearChildren(listEl);

  const all = readLibrary();
  emptyEl.classList.toggle('hidden', all.length > 0);

  const q = state.librarySearch.trim().toLowerCase();
  const items = all
    .filter((it) => !q ||
      String(it.title || '').toLowerCase().includes(q) ||
      String(it.text || '').toLowerCase().includes(q))
    .map((it) => ({ it, ...libraryEstimate(it) }));

  const wh = (x) => (x.impact ? x.impact.energy.wh : Infinity);
  const sorters = {
    'date-desc': (a, b) => (b.it.ts || 0) - (a.it.ts || 0),
    'date-asc': (a, b) => (a.it.ts || 0) - (b.it.ts || 0),
    'energy-asc': (a, b) => wh(a) - wh(b),
    'energy-desc': (a, b) => wh(b) - wh(a)
  };
  items.sort(sorters[state.librarySort] || sorters['date-desc']);

  if (!items.length && all.length > 0) {
    const none = el('p', 'explorer-note', 'No saved prompts match your search.');
    listEl.appendChild(none);
    return;
  }

  for (const { it, inputs, impact } of items) {
    const card = el('article', 'library-item');
    const desc = impact ? describeImpact(impact) : null;

    const head = el('div', 'library-item-head');
    head.appendChild(el('span', 'library-item-title', it.title || 'Untitled prompt'));
    const pill = el('span', 'grade-pill', desc ? desc.gradeText : '?');
    if (desc) paintGrade(pill, desc);
    else pill.setAttribute('aria-label', 'Eco-grade unknown');
    head.appendChild(pill);
    card.appendChild(head);

    card.appendChild(el('p', 'library-item-text', it.text || ''));

    const model = state.engine.getModel(it.modelId);
    const meta = el('div', 'library-item-meta');
    // An older model keeps its own name: the estimate is its own.
    const modelLabel = model
      ? (model.status === 'current' ? model.name : `${model.name} (older model)`)
      : (it.modelId ? `${it.modelId} (not in the catalog)` : 'no model');
    meta.appendChild(el('span', null, modelLabel));
    if (desc) {
      const span = el('span', null, `⚡ ${desc.estimated ? `${desc.rangeText} · ${desc.methodChip}` : formatWh(impact.energy.wh)}`);
      span.title = "Re-estimated with today's model catalog";
      meta.appendChild(span);
    }
    if (inputs.region !== 'default') meta.appendChild(el('span', null, `grid: ${inputs.region}`));
    if (impact && impact.model.isReasoning && inputs.effort !== 'standard') {
      meta.appendChild(el('span', null, `${inputs.effort} effort`));
    }
    if (impact) {
      meta.appendChild(el('span', null, `${impact.tokens.input} in / ${impact.tokens.output} out tokens`));
    }
    if (it.ts) {
      meta.appendChild(el('span', null, new Date(it.ts).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      })));
    }
    card.appendChild(meta);

    const actions = el('div', 'library-item-actions');
    const openBtn = el('button', 'icon-btn', '↩️ Open in coach');
    openBtn.type = 'button';
    openBtn.addEventListener('click', () => {
      openInCoach(it.text || '', inputs);
      showToast('Opened in the coach');
    });
    const copyBtn = el('button', 'icon-btn', '📋 Copy');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(it.text || '');
      showToast(ok ? 'Prompt copied' : 'Copy failed — clipboard unavailable');
    });
    const delBtn = el('button', 'icon-btn danger', '🗑️ Delete');
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => {
      writeLibrary(readLibrary().filter((x) => x.id !== it.id));
      renderLibrary();
      showToast('Prompt deleted');
    });
    actions.appendChild(openBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);

    listEl.appendChild(card);
  }
}

function exportLibrary() {
  const items = readLibrary();
  if (!items.length) {
    showToast('Nothing to export yet');
    return;
  }
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ecoprompt-library-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('⬇️ Library exported');
}

function importLibrary(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(String(reader.result));
      if (!Array.isArray(incoming)) throw new Error('not an array');
      const existing = readLibrary();
      const seen = new Set(existing.map((x) => x.id));
      let added = 0;
      for (const it of incoming) {
        if (!it || typeof it !== 'object' || typeof it.text !== 'string') continue;
        // Stored as v2 inputs, whichever version the file holds.
        const inputs = libraryInputs(it);
        const entry = {
          v: 2,
          id: typeof it.id === 'string' && !seen.has(it.id)
            ? it.id
            : `epc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title: typeof it.title === 'string' ? it.title.slice(0, 80) : 'Imported prompt',
          text: it.text,
          modelId: inputs.modelId || (typeof it.modelId === 'string' ? it.modelId.slice(0, 80) : ''),
          region: inputs.region,
          effort: inputs.effort,
          outTokens: inputs.outTokens,
          ts: Number(it.ts) || Date.now()
        };
        seen.add(entry.id);
        existing.push(entry);
        added++;
      }
      writeLibrary(existing);
      renderLibrary();
      showToast(added ? `⬆️ Imported ${added} prompt${added === 1 ? '' : 's'}` : 'No valid prompts in that file');
    } catch (err) {
      showToast('Import failed — not a valid library JSON file');
    }
  };
  reader.readAsText(file);
}

function initLibrary() {
  renderLibrary();

  $('library-search').addEventListener('input', debounce((e) => {
    state.librarySearch = e.target.value;
    renderLibrary();
  }, 150));

  $('library-sort').addEventListener('change', (e) => {
    state.librarySort = e.target.value;
    renderLibrary();
  });

  $('library-export').addEventListener('click', exportLibrary);
  $('library-import').addEventListener('click', () => $('library-import-file').click());
  $('library-import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importLibrary(file);
    e.target.value = '';
  });
}

/* ============================ 10. Modal + toast ============================ */

let toastTimer = null;
function showToast(message, action) {
  const toast = $('toast');
  clearChildren(toast);
  toast.appendChild(document.createTextNode(message));
  if (action) {
    const btn = el('button', 'toast-action', action.label);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      toast.classList.remove('show');
      action.onClick();
    });
    toast.appendChild(btn);
  }
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), action ? 5200 : 2800);
}

function openSaveModal() {
  const text = $('prompt-input').value.trim();
  const auto = text.slice(0, 40) + (text.length > 40 ? '…' : '');
  $('save-title-input').value = auto;
  $('save-modal').classList.remove('hidden');
  $('save-title-input').focus();
  $('save-title-input').select();
}

function closeSaveModal() {
  $('save-modal').classList.add('hidden');
  $('save-library-btn').focus();
}

function initModal() {
  $('save-modal-cancel').addEventListener('click', closeSaveModal);
  $('save-modal-confirm').addEventListener('click', () => {
    saveLibraryEntry($('save-title-input').value.trim());
    closeSaveModal();
  });
  $('save-title-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveLibraryEntry($('save-title-input').value.trim());
      closeSaveModal();
    }
  });
  $('save-modal').addEventListener('click', (e) => {
    if (e.target === $('save-modal')) closeSaveModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('save-modal').classList.contains('hidden')) closeSaveModal();
  });
}

/* ============================ 11. Nav + init ============================ */

function initNav() {
  const burger = $('nav-burger');
  const links = $('nav-links');
  burger.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  links.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      links.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    }
  });
}

async function boot() {
  $('app-loading').classList.remove('hidden');
  $('app-error').classList.add('hidden');
  $('app-main').classList.add('hidden');
  try {
    await loadData();
  } catch (err) {
    $('app-loading').classList.add('hidden');
    $('app-error').classList.remove('hidden');
    $('app-error-detail').textContent =
      `The vendor data files could not be fetched (${err && err.message ? err.message : 'unknown error'}).`;
    return;
  }
  $('app-loading').classList.add('hidden');
  $('app-main').classList.remove('hidden');

  if (!state.compareIds.length || state.compareIds.some((id) => !state.engine.getModel(id))) {
    state.compareIds = defaultCompareIds();
  }
  initDemoStrip();
  initCoach();
  initCompare();
  initExplorerToolbar();
  renderExplorer();
  initLibrary();
  if (!applySharedLink()) updateCoach();
}

function init() {
  initTheme();
  initNav();
  initModal();
  $('retry-load').addEventListener('click', boot);
  // A share link opened on a page that is already loaded applies too.
  window.addEventListener('hashchange', () => {
    if (state.engine) applySharedLink();
  });
  boot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
