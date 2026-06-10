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

function formatWh(wh) {
  if (wh >= 1000) return `${(wh / 1000).toFixed(2)} kWh`;
  if (wh >= 10) return `${wh.toFixed(1)} Wh`;
  if (wh >= 1) return `${wh.toFixed(2)} Wh`;
  return `${wh.toFixed(3)} Wh`;
}

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

const GRADE_DOTS = { A: '🟢', B: '🟢', C: '🟡', D: '🟠', E: '🔴' };

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

  // Coach
  modelId: 'gpt-4o-mini',
  regionKey: 'default',
  reasoningEffort: 'standard',
  outputTokens: 300,
  outputTouched: false, // user moved the slider manually
  analysis: null,
  impact: null,

  // Compare
  compareIds: ['gemini-2.5-flash', 'gpt-4o', 'gpt-5-thinking'],
  compareTouched: false, // user moved compare sliders manually
  compareInput: 100,
  compareOutput: 300,

  // Library
  librarySearch: '',
  librarySort: 'date-desc',

  demoTimer: null
};

/* ============================ 4. Data loading ============================ */

async function loadData() {
  const fetchJson = async (path) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  };
  const [models, grids, equivalents] = await Promise.all([
    fetchJson('vendor/data/models.json'),
    fetchJson('vendor/data/grids.json'),
    fetchJson('vendor/data/equivalents.json')
  ]);
  state.modelsRaw = models;
  state.engine = new EcoPromptCore.ImpactEngine({ models, grids, equivalents });
  state.conv = EcoPromptCore.createConverters(equivalents);
}

function providerAnchor(modelId) {
  const m = state.engine.getModel(modelId);
  return m ? m.anchor : null;
}

/** Grade at the standard short query (100 in / 300 out) — used for dots/cards. */
function shortQueryImpact(modelId) {
  return state.engine.estimateImpact({ modelId, inputTokens: 100, outputTokens: 300 });
}

/* ============================ 5. Hero live demo ============================ */

function buildDemoFacts() {
  const engine = state.engine;
  const conv = state.conv;
  const facts = [];

  // Fact 1: a reasoning-mode answer, in everyday units (computed live).
  const thinking = engine.estimateImpact({
    modelId: 'gpt-5-thinking', inputTokens: 100, outputTokens: 300
  });
  if (thinking) {
    const e = conv.energy(thinking.energy.wh);
    facts.push({
      emoji: '🧠',
      text: `One ${thinking.model.name} answer ≈ ${e.primary} (${e.secondary}).`
    });
  }

  // Fact 2: best vs worst on a typical short question.
  const cmp = engine.compareModels({ inputTokens: 100, outputTokens: 300 });
  if (cmp.best && cmp.worst && cmp.potentialSavings) {
    facts.push({
      emoji: '⚖️',
      text: `Same question, different model: ${cmp.best.model.name} uses ${cmp.potentialSavings.percentage}% less energy than ${cmp.worst.model.name}.`
    });
  }

  // Fact 3: a day of efficient prompting, summed up.
  const daily = engine.estimateImpact({
    modelId: 'gemini-2.5-flash', inputTokens: 100, outputTokens: 300
  });
  if (daily) {
    const e = conv.energy(daily.energy.wh * 25);
    const w = conv.water(daily.water.ml * 25);
    facts.push({
      emoji: '💧',
      text: `25 ${daily.model.name} queries a day ≈ ${e.primary} and ${w.primary}.`
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
  for (const [provider, list] of groups) {
    const og = document.createElement('optgroup');
    og.label = provider;
    for (const m of list) {
      const impact = shortQueryImpact(m.id);
      const grade = impact ? impact.grade.grade : '?';
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${GRADE_DOTS[grade] || '⚪'} ${m.name} — grade ${grade}${m.isReasoning ? ' · reasoning' : ''}`;
      og.appendChild(opt);
    }
    select.appendChild(og);
  }
  if (!state.engine.getModel(state.modelId)) state.modelId = models[0].id;
  select.value = state.modelId;
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
  $('bar-fixed').style.width = pct(fixedWh);
  $('bar-input').style.width = pct(inputWh);
  $('bar-output').style.width = pct(outputWh);
  $('legend-fixed').textContent = formatWh(fixedWh);
  $('legend-input').textContent = formatWh(inputWh);
  $('legend-output').textContent = formatWh(outputWh);
  $('energy-breakdown-bar').setAttribute(
    'aria-label',
    `Energy breakdown: fixed ${formatWh(fixedWh)}, input ${formatWh(inputWh)}, output ${formatWh(outputWh)}`
  );
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
    return;
  }

  $('prompt-token-count').textContent =
    `${analysis.tokens} ${analysis.tokens === 1 ? 'token' : 'tokens'}`;
  $('prompt-task-type').textContent =
    analysis.taskTypeRaw !== 'GENERAL' ? `Detected: ${analysis.taskType}` : '';

  // Default expected output from the analyzer, unless the user took over.
  const slider = $('output-slider');
  if (!state.outputTouched) {
    state.outputTokens = clamp(analysis.outputEstimate.estimated, 100, 2000);
    slider.value = state.outputTokens;
    $('output-slider-value').textContent = String(state.outputTokens);
    paintSlider(slider);
  }

  const impact = state.engine.estimateImpact({
    modelId: state.modelId,
    inputTokens: analysis.tokens,
    outputTokens: state.outputTokens,
    options: {
      taskMultiplier: analysis.energyMultiplier,
      reasoningEffort: state.reasoningEffort,
      regionKey: state.regionKey === 'default' ? undefined : state.regionKey
    }
  });
  state.impact = impact;
  if (!impact) return;

  emptyEl.classList.add('hidden');
  bodyEl.classList.remove('hidden');

  // Grade
  const badge = $('grade-badge');
  badge.dataset.grade = impact.grade.grade;
  $('grade-letter').textContent = impact.grade.grade;
  $('grade-summary').textContent =
    `${impact.model.name} · ${analysis.taskType} · ${impact.category} query`;
  $('grade-detail').textContent =
    `${formatWh(impact.energy.wh)} per query · eco-score ${impact.grade.score}/100` +
    (impact.energy.extrapolated ? ' · extrapolated beyond benchmark range' : '');

  // Metric cards
  const rel = state.conv.forImpact(impact);
  $('energy-primary').textContent = rel.energy.primary;
  $('energy-secondary').textContent = rel.energy.secondary;
  $('energy-range').textContent =
    `range ${formatWh(impact.energy.confidence.minWh)} – ${formatWh(impact.energy.confidence.maxWh)}`;

  $('water-primary').textContent = rel.water.primary;
  $('water-secondary').textContent = rel.water.secondary;
  $('water-detail').textContent =
    `incl. ${formatMl(impact.water.breakdown.offsiteMl)} off-site (power generation)`;

  $('carbon-primary').textContent = rel.carbon.primary;
  $('carbon-secondary').textContent = rel.carbon.secondary;
  const cifLabel = state.regionKey === 'default'
    ? `${impact.model.host} grid`
    : 'your selected grid';
  $('carbon-detail').textContent =
    `${Math.round(impact.factors.cif * 1000)} g CO₂/kWh · ${cifLabel} · incl. 15% embodied`;

  setSegmentWidths(impact);
  renderTips(analysis);

  // Copy-trimmed button only when courtesy phrases were found.
  $('copy-trimmed-btn').classList.toggle(
    'hidden', analysis.politeWords.totalTokensSaved === 0
  );

  // Mirror tokens into Compare unless the user took over those sliders.
  if (!state.compareTouched) {
    state.compareInput = clamp(analysis.tokens, 50, 10000);
    state.compareOutput = state.outputTokens;
    syncCompareSliders();
    renderCompare();
  }
}

const updateCoachDebounced = debounce(updateCoach, 220);

function initCoach() {
  populateModelSelect();
  populateRegionSelect();
  syncReasoningControl();
  paintSlider($('output-slider'));

  $('prompt-input').addEventListener('input', updateCoachDebounced);

  $('model-select').addEventListener('change', (e) => {
    state.modelId = e.target.value;
    syncReasoningControl();
    updateCoach();
  });

  $('region-select').addEventListener('change', (e) => {
    state.regionKey = e.target.value;
    updateCoach();
  });

  $('reasoning-control').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-effort]');
    if (!btn) return;
    state.reasoningEffort = btn.dataset.effort;
    syncReasoningControl();
    updateCoach();
  });

  const slider = $('output-slider');
  slider.addEventListener('input', () => {
    state.outputTouched = true;
    state.outputTokens = Number(slider.value);
    $('output-slider-value').textContent = slider.value;
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
  const inSlider = $('compare-input-slider');
  const outSlider = $('compare-output-slider');
  inSlider.value = state.compareInput;
  outSlider.value = state.compareOutput;
  $('compare-input-value').textContent = String(state.compareInput);
  $('compare-output-value').textContent = String(state.compareOutput);
  paintSlider(inSlider);
  paintSlider(outSlider);
}

function renderCompareChips() {
  const wrap = $('compare-chips');
  clearChildren(wrap);
  for (const m of state.engine.listModels()) {
    const chip = el('button', 'chip', m.name);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(state.compareIds.includes(m.id)));
    chip.addEventListener('click', () => {
      const i = state.compareIds.indexOf(m.id);
      if (i >= 0) {
        if (state.compareIds.length <= 2) {
          showToast('Keep at least 2 models to compare');
          return;
        }
        state.compareIds.splice(i, 1);
      } else {
        if (state.compareIds.length >= 4) {
          showToast('Pick at most 4 models — remove one first');
          return;
        }
        state.compareIds.push(m.id);
      }
      chip.setAttribute('aria-pressed', String(state.compareIds.includes(m.id)));
      renderCompare();
    });
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
      reasoningEffort: state.reasoningEffort,
      regionKey: state.regionKey === 'default' ? undefined : state.regionKey
    }
  });

  // Savings banner
  const banner = $('savings-banner');
  if (cmp.potentialSavings && cmp.potentialSavings.percentage > 0) {
    const per100 = state.conv.energy(cmp.potentialSavings.energyWh * 100);
    $('savings-text').textContent =
      `Switching from ${cmp.worst.model.name} to ${cmp.best.model.name} saves ` +
      `${cmp.potentialSavings.percentage}% — that's ${per100.primary} per 100 queries.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  const wrap = $('compare-results');
  clearChildren(wrap);

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
    const headRight = el('div');
    if (idx === 0) headRight.appendChild(el('span', 'best-tag', 'Greenest'));
    const pill = el('span', 'grade-pill', r.grade.grade);
    pill.dataset.grade = r.grade.grade;
    pill.style.marginLeft = '0.5em';
    pill.setAttribute('aria-label', `Eco-grade ${r.grade.grade}`);
    headRight.appendChild(pill);
    head.appendChild(headRight);
    card.appendChild(head);
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
    if (idx === 0) {
      const tag = el('span', 'best-tag', 'Greenest');
      tag.style.marginLeft = '0.5em';
      tdModel.appendChild(tag);
    }
    tdModel.appendChild(el('span', 'cell-provider', r.model.provider));
    tr.appendChild(tdModel);

    const tdGrade = el('td');
    const pill = el('span', 'grade-pill', r.grade.grade);
    pill.dataset.grade = r.grade.grade;
    pill.setAttribute('aria-label', `Eco-grade ${r.grade.grade}`);
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
  const maxWh = Math.max(...results.map((r) => r.energy.wh), 1e-9);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label',
    'Bar chart of energy per query: ' +
    results.map((r) => `${r.model.name} ${formatWh(r.energy.wh)}`).join(', '));

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

    const targetW = Math.max(8, (r.energy.wh / maxWh) * (width - 90));
    const bar = document.createElementNS(NS, 'rect');
    bar.setAttribute('x', '0');
    bar.setAttribute('y', String(y + labelH));
    bar.setAttribute('width', '8');
    bar.setAttribute('height', String(barH));
    bar.setAttribute('rx', '8');
    bar.setAttribute('class', 'chart-bar');
    bar.setAttribute('fill', GRADE_COLORS[r.grade.grade] || '#10B981');
    svg.appendChild(bar);
    bars.push({ bar, targetW, value: r.energy.wh, y: y + labelH });

    const value = document.createElementNS(NS, 'text');
    value.setAttribute('x', String(targetW + 8));
    value.setAttribute('y', String(y + labelH + barH - 3));
    value.setAttribute('class', 'chart-value');
    value.textContent = formatWh(r.energy.wh);
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
    state.compareInput = Number(inSlider.value);
    $('compare-input-value').textContent = inSlider.value;
    paintSlider(inSlider);
    onSlide();
  });
  outSlider.addEventListener('input', () => {
    state.compareTouched = true;
    state.compareOutput = Number(outSlider.value);
    $('compare-output-value').textContent = outSlider.value;
    paintSlider(outSlider);
    onSlide();
  });

  renderCompare();
}

/* ============================ 8. Model explorer ============================ */

function renderExplorer() {
  const grid = $('explorer-grid');
  clearChildren(grid);

  const models = state.engine.listModels()
    .map((m) => ({ meta: m, short: shortQueryImpact(m.id) }))
    .filter((x) => x.short)
    .sort((a, b) => a.short.energy.wh - b.short.energy.wh);

  for (const { meta, short } of models) {
    const long = state.engine.estimateImpact({
      modelId: meta.id, inputTokens: 10000, outputTokens: 1500
    });

    const card = el('article', 'explorer-card');

    const head = el('div', 'explorer-head');
    const names = el('div');
    names.appendChild(el('div', 'explorer-name', meta.name));
    names.appendChild(el('div', 'explorer-provider', `${meta.provider} · ${meta.host} · ${meta.sizeClass}`));
    head.appendChild(names);
    const pill = el('span', 'grade-pill', short.grade.grade);
    pill.dataset.grade = short.grade.grade;
    pill.setAttribute('aria-label', `Eco-grade ${short.grade.grade} at a short query`);
    head.appendChild(pill);
    card.appendChild(head);

    const stats = el('div', 'explorer-stats');
    const mkStat = (label, value) => {
      const s = el('div', 'explorer-stat');
      s.appendChild(el('span', 'stat-label', label));
      s.appendChild(el('span', 'stat-value', value));
      return s;
    };
    stats.appendChild(mkStat('Short query', formatWh(short.energy.wh)));
    if (long) stats.appendChild(mkStat('Long query', formatWh(long.energy.wh)));
    card.appendChild(stats);

    const chips = el('div', 'explorer-chips');
    const src = el('span', 'info-chip', meta.dataSource);
    src.dataset.kind = meta.dataSource;
    chips.appendChild(src);
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

function saveLibraryEntry(title) {
  const items = readLibrary();
  items.push({
    id: `epc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: title || 'Untitled prompt',
    text: $('prompt-input').value,
    modelId: state.modelId,
    tokens: {
      input: state.analysis ? state.analysis.tokens : 0,
      output: state.outputTokens
    },
    energyWh: state.impact ? state.impact.energy.wh : 0,
    grade: state.impact ? state.impact.grade.grade : '?',
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

  let items = readLibrary();

  const q = state.librarySearch.trim().toLowerCase();
  if (q) {
    items = items.filter((it) =>
      String(it.title || '').toLowerCase().includes(q) ||
      String(it.text || '').toLowerCase().includes(q));
  }

  const sorters = {
    'date-desc': (a, b) => (b.ts || 0) - (a.ts || 0),
    'date-asc': (a, b) => (a.ts || 0) - (b.ts || 0),
    'energy-asc': (a, b) => (a.energyWh || 0) - (b.energyWh || 0),
    'energy-desc': (a, b) => (b.energyWh || 0) - (a.energyWh || 0)
  };
  items.sort(sorters[state.librarySort] || sorters['date-desc']);

  const all = readLibrary();
  emptyEl.classList.toggle('hidden', all.length > 0);
  if (!items.length && all.length > 0) {
    const none = el('p', 'explorer-note', 'No saved prompts match your search.');
    listEl.appendChild(none);
    return;
  }

  for (const it of items) {
    const card = el('article', 'library-item');

    const head = el('div', 'library-item-head');
    head.appendChild(el('span', 'library-item-title', it.title || 'Untitled prompt'));
    const pill = el('span', 'grade-pill', it.grade || '?');
    if (it.grade) pill.dataset.grade = it.grade;
    pill.setAttribute('aria-label', `Eco-grade ${it.grade || 'unknown'}`);
    head.appendChild(pill);
    card.appendChild(head);

    card.appendChild(el('p', 'library-item-text', it.text || ''));

    const model = state.engine.getModel(it.modelId);
    const meta = el('div', 'library-item-meta');
    meta.appendChild(el('span', null, model ? model.name : (it.modelId || 'unknown model')));
    if (typeof it.energyWh === 'number') {
      meta.appendChild(el('span', null, `⚡ ${formatWh(it.energyWh)}`));
    }
    if (it.tokens) {
      meta.appendChild(el('span', null,
        `${it.tokens.input || 0} in / ${it.tokens.output || 0} out tokens`));
    }
    if (it.ts) {
      meta.appendChild(el('span', null, new Date(it.ts).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      })));
    }
    card.appendChild(meta);

    const actions = el('div', 'library-item-actions');
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
        const entry = {
          id: typeof it.id === 'string' && !seen.has(it.id)
            ? it.id
            : `epc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title: typeof it.title === 'string' ? it.title.slice(0, 80) : 'Imported prompt',
          text: it.text,
          modelId: typeof it.modelId === 'string' ? it.modelId : '',
          tokens: it.tokens && typeof it.tokens === 'object'
            ? { input: Number(it.tokens.input) || 0, output: Number(it.tokens.output) || 0 }
            : { input: 0, output: 0 },
          energyWh: Number(it.energyWh) || 0,
          grade: typeof it.grade === 'string' ? it.grade.slice(0, 1) : '?',
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
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
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

  initDemoStrip();
  initCoach();
  initCompare();
  renderExplorer();
  initLibrary();
  updateCoach();
}

function init() {
  initTheme();
  initNav();
  initModal();
  $('retry-load').addEventListener('click', boot);
  boot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
