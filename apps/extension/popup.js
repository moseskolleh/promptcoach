// EcoPrompt Coach — popup
// Three tabs: Coach (live prompt analysis), Compare (model comparison),
// Impact (personal dashboard from recorded history).

'use strict';

(() => {
  const Core = window.EcoPromptCore;

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

  // Shared popup state (Coach <-> Compare share prompt/token inputs).
  const state = {
    engine: null,
    conv: null,
    settings: { ...DEFAULT_SETTINGS },
    models: [],
    modelGrades: {}, // modelId -> grade letter (quick 100/300 estimate)
    prompt: '',
    analysis: null,
    inputTokens: 100,
    outputTokens: 300,
    compareIds: []
  };

  const $ = (id) => document.getElementById(id);

  // --------------------------------------------------------------------------
  // Bootstrapping: data, settings, session state
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

  function loadSession() {
    return new Promise((resolve) => {
      if (!chrome.storage.session) return resolve({});
      try {
        chrome.storage.session.get('eco_popup_state', (data) => {
          resolve((data && data.eco_popup_state) || {});
        });
      } catch (e) {
        resolve({});
      }
    });
  }

  function saveSession() {
    if (!chrome.storage.session) return;
    try {
      chrome.storage.session.set({
        eco_popup_state: {
          prompt: state.prompt,
          modelId: $('model-select').value,
          effort: $('effort-select').value,
          compareIds: state.compareIds
        }
      });
    } catch (e) {
      /* session storage unavailable — non-fatal */
    }
  }

  function impactOptions(extra = {}) {
    return {
      reasoningEffort: $('effort-select').value || state.settings.reasoningEffort,
      regionKey: state.settings.regionKey,
      includeEmbodied: state.settings.includeEmbodied,
      ...extra
    };
  }

  // --------------------------------------------------------------------------
  // Tab switching
  // --------------------------------------------------------------------------

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.panel').forEach((panel) => {
      const active = panel.id === `panel-${name}`;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if (name === 'compare') renderCompare();
    if (name === 'impact') renderImpact();
  }

  // --------------------------------------------------------------------------
  // Coach tab
  // --------------------------------------------------------------------------

  function populateModelSelect() {
    const select = $('model-select');
    select.textContent = '';
    const byProvider = new Map();
    for (const m of state.models) {
      if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
      byProvider.get(m.provider).push(m);
    }
    for (const [provider, models] of byProvider) {
      const group = document.createElement('optgroup');
      group.label = provider;
      for (const m of models) {
        const grade = state.modelGrades[m.id] || '?';
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} · ${grade}`;
        opt.dataset.grade = grade;
        group.appendChild(opt);
      }
      select.appendChild(group);
    }
  }

  function onModelChange() {
    const id = $('model-select').value;
    const model = state.models.find((m) => m.id === id);
    // Grade-colored dot reflects the selected model's quick grade.
    const grade = state.modelGrades[id];
    $('model-grade-dot').style.background = GRADE_COLORS[grade] || 'var(--muted)';
    $('model-grade-dot').title = grade ? `Eco-grade ${grade} for a typical short query` : '';
    // Reasoning-effort control only applies to reasoning models.
    $('effort-select').classList.toggle('hidden', !(model && model.isReasoning));
    renderCoach();
    saveSession();
  }

  let coachTimer = null;
  function onPromptInput() {
    state.prompt = $('prompt-input').value;
    clearTimeout(coachTimer);
    coachTimer = setTimeout(() => {
      renderCoach();
      saveSession();
    }, 300);
  }

  function renderCoach() {
    const text = state.prompt.trim();
    const emptyEl = $('coach-empty');
    const analysisEl = $('coach-analysis');

    if (!text) {
      state.analysis = null;
      emptyEl.classList.remove('hidden');
      analysisEl.classList.add('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    analysisEl.classList.remove('hidden');

    const analysis = Core.analyzePrompt(text);
    state.analysis = analysis;
    state.inputTokens = analysis.tokens;
    state.outputTokens = analysis.outputEstimate.estimated;

    const impact = state.engine.estimateImpact({
      modelId: $('model-select').value,
      inputTokens: analysis.tokens,
      outputTokens: analysis.outputEstimate.estimated,
      options: impactOptions({ taskMultiplier: analysis.energyMultiplier })
    });
    if (!impact) return;

    // Header: grade + chips
    const badge = $('grade-badge');
    badge.textContent = impact.grade.grade;
    badge.style.background = GRADE_COLORS[impact.grade.grade];
    badge.title = `Eco-score ${impact.grade.score}/100`;
    $('chip-tokens').textContent = `${analysis.tokens} tokens in`;
    $('chip-task').textContent = analysis.taskType;
    $('chip-output').textContent =
      `~${analysis.outputEstimate.estimated} out (${analysis.outputEstimate.min}–${analysis.outputEstimate.max})`;

    // Metric rows: relatable primary + technical secondary
    const c = state.conv.forImpact(impact);
    $('energy-primary').textContent = c.energy.primary;
    $('energy-secondary').textContent = c.energy.secondary;
    const conf = impact.energy.confidence;
    const range = $('energy-range');
    range.textContent = `± ${conf.minWh.toFixed(2)}–${conf.maxWh.toFixed(2)} Wh`;
    range.title = impact.energy.extrapolated
      ? 'Wider range: extrapolated beyond measured benchmark conditions'
      : 'Benchmark uncertainty range';
    $('water-primary').textContent = c.water.primary;
    $('water-secondary').textContent = c.water.secondary;
    $('carbon-primary').textContent = c.carbon.primary;
    $('carbon-secondary').textContent = c.carbon.secondary;

    // Trim button
    const trimBtn = $('trim-btn');
    if (analysis.politeWords.totalTokensSaved > 0) {
      trimBtn.classList.remove('hidden');
      if (!trimBtn.classList.contains('is-copied')) {
        trimBtn.textContent =
          `Trim & copy optimized prompt (−${analysis.politeWords.totalTokensSaved} tokens)`;
      }
    } else {
      trimBtn.classList.add('hidden');
    }

    renderTips(analysis.tips);
  }

  function renderTips(tips) {
    const list = $('tips-list');
    list.textContent = '';
    for (const tip of tips) {
      const li = document.createElement('li');
      li.className = `tip tip-${tip.priority || 'low'}`;
      const title = document.createElement('div');
      title.className = 'tip-title';
      title.textContent = tip.title;
      const desc = document.createElement('p');
      desc.className = 'tip-desc';
      desc.textContent = tip.description;
      const impact = document.createElement('span');
      impact.className = 'tip-impact';
      impact.textContent = tip.impact;
      li.append(title, desc, impact);
      list.appendChild(li);
    }
  }

  async function onTrimClick() {
    const optimized = Core.generateOptimizedPrompt(state.prompt);
    const btn = $('trim-btn');
    try {
      await navigator.clipboard.writeText(optimized);
      btn.classList.add('is-copied');
      btn.textContent = 'Copied! Paste it into your chat';
    } catch (e) {
      // Clipboard can be blocked — fall back to replacing the textarea content.
      $('prompt-input').value = optimized;
      state.prompt = optimized;
      btn.classList.add('is-copied');
      btn.textContent = 'Clipboard blocked — prompt replaced above';
      renderCoach();
    }
    setTimeout(() => {
      btn.classList.remove('is-copied');
      renderCoach();
    }, 1800);
  }

  // --------------------------------------------------------------------------
  // Compare tab
  // --------------------------------------------------------------------------

  function populateChecklist() {
    const wrap = $('model-checklist');
    wrap.textContent = '';
    const byProvider = new Map();
    for (const m of state.models) {
      if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
      byProvider.get(m.provider).push(m);
    }
    for (const [provider, models] of byProvider) {
      const label = document.createElement('div');
      label.className = 'check-group-label';
      label.textContent = provider;
      wrap.appendChild(label);
      for (const m of models) {
        const row = document.createElement('label');
        row.className = 'check-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = m.id;
        box.checked = state.compareIds.includes(m.id);
        box.addEventListener('change', () => onCheckChange(box));
        const dot = document.createElement('span');
        dot.className = 'grade-dot';
        dot.style.background = GRADE_COLORS[state.modelGrades[m.id]] || 'var(--muted)';
        const name = document.createElement('span');
        name.className = 'check-name';
        name.textContent = m.name + (m.isReasoning ? ' · reasoning' : '');
        row.append(box, dot, name);
        wrap.appendChild(row);
      }
    }
    enforceCheckLimit();
  }

  function onCheckChange(box) {
    if (box.checked) {
      if (state.compareIds.length >= 4) {
        box.checked = false;
        return;
      }
      state.compareIds.push(box.value);
    } else {
      state.compareIds = state.compareIds.filter((id) => id !== box.value);
    }
    enforceCheckLimit();
    renderCompare();
    saveSession();
  }

  function enforceCheckLimit() {
    const full = state.compareIds.length >= 4;
    document.querySelectorAll('#model-checklist .check-row').forEach((row) => {
      const box = row.querySelector('input');
      const disabled = full && !box.checked;
      box.disabled = disabled;
      row.classList.toggle('is-disabled', disabled);
    });
  }

  function onTokensInput() {
    state.inputTokens = Math.max(1, parseInt($('compare-in').value, 10) || 1);
    state.outputTokens = Math.max(1, parseInt($('compare-out').value, 10) || 1);
    renderCompare();
  }

  function renderCompare() {
    // Sync token inputs with the Coach prompt analysis.
    $('compare-in').value = state.inputTokens;
    $('compare-out').value = state.outputTokens;
    $('compare-context').textContent = state.analysis
      ? `Using your Coach prompt: ${state.analysis.tokens} tokens in, ` +
        `~${state.analysis.outputEstimate.estimated} expected out (${state.analysis.taskType}).`
      : 'No prompt yet — adjust the token counts below, or write one in the Coach tab.';

    const banner = $('savings-banner');
    const tableWrap = $('compare-table-wrap');
    const empty = $('compare-empty');

    if (state.compareIds.length < 2) {
      banner.classList.add('hidden');
      tableWrap.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    const comparison = state.engine.compareModels({
      modelIds: state.compareIds,
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      options: impactOptions(
        state.analysis ? { taskMultiplier: state.analysis.energyMultiplier } : {}
      )
    });

    // Savings banner
    const savings = comparison.potentialSavings;
    if (savings && savings.percentage > 0 && comparison.best && comparison.worst) {
      banner.classList.remove('hidden');
      banner.textContent =
        `Save ${savings.percentage}% by switching from ${comparison.worst.model.name} ` +
        `to ${comparison.best.model.name}`;
    } else {
      banner.classList.add('hidden');
    }

    // Table
    const tbody = $('compare-tbody');
    tbody.textContent = '';
    for (const impact of comparison.results) {
      const cc = state.conv.forImpact(impact);
      const tr = document.createElement('tr');
      if (comparison.best && impact.model.id === comparison.best.model.id) {
        tr.classList.add('is-best');
      }
      const nameTd = document.createElement('td');
      nameTd.textContent = impact.model.name;
      const gradeTd = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'grade-pill';
      pill.textContent = impact.grade.grade;
      pill.style.background = GRADE_COLORS[impact.grade.grade];
      gradeTd.appendChild(pill);
      tr.append(nameTd, gradeTd);
      for (const metric of [
        { primary: cc.energy.primary, secondary: cc.energy.secondary },
        { primary: cc.water.primary, secondary: cc.water.secondary },
        { primary: cc.carbon.primary, secondary: cc.carbon.secondary }
      ]) {
        const td = document.createElement('td');
        td.textContent = metric.primary;
        const sec = document.createElement('span');
        sec.className = 'cell-secondary';
        sec.textContent = metric.secondary;
        td.appendChild(sec);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tableWrap.classList.remove('hidden');
  }

  // --------------------------------------------------------------------------
  // Impact tab (dashboard from chrome.storage.local 'eco_history')
  // --------------------------------------------------------------------------

  function loadHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.get('eco_history', (data) => {
        resolve(Array.isArray(data && data.eco_history) ? data.eco_history : []);
      });
    });
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  async function renderImpact() {
    const history = await loadHistory();
    const empty = $('impact-empty');
    const dash = $('impact-dashboard');

    if (!history.length) {
      empty.classList.remove('hidden');
      dash.classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    dash.classList.remove('hidden');

    const today0 = startOfDay(Date.now());
    const week0 = today0 - 6 * 86400000; // rolling 7 days including today
    const todayEntries = history.filter((e) => e.ts >= today0);
    const weekEntries = history.filter((e) => e.ts >= week0);

    const todayTotals = state.engine.aggregate(todayEntries);
    const weekTotals = state.engine.aggregate(weekEntries);
    const allTotals = state.engine.aggregate(history);

    // Period cards: query counts + short energy line
    const periodSub = (totals) =>
      totals.queries ? state.conv.energy(totals.energyWh).secondary : 'no queries';
    $('period-today').textContent = String(todayTotals.queries);
    $('period-today-sub').textContent = periodSub(todayTotals);
    $('period-week').textContent = String(weekTotals.queries);
    $('period-week-sub').textContent = periodSub(weekTotals);
    $('period-all').textContent = String(allTotals.queries);
    $('period-all-sub').textContent = periodSub(allTotals);

    // Narrative sentence + relatable stat cards for the week
    const totalsForCards = weekTotals.queries ? weekTotals : allTotals;
    const periodLabel = weekTotals.queries ? 'this week' : 'all time';
    const t = state.conv.forTotals(totalsForCards, periodLabel);
    $('totals-sentence').textContent = t.sentence;
    $('stat-energy').textContent = t.energy.primary;
    $('stat-energy-sub').textContent = t.energy.secondary;
    $('stat-water').textContent = t.water.primary;
    $('stat-water-sub').textContent = t.water.secondary;
    $('stat-carbon').textContent = t.carbon.primary;
    $('stat-carbon-sub').textContent = t.carbon.secondary;

    renderWeekChart(history, today0);
    renderStreak(history, today0, todayTotals);
  }

  function renderWeekChart(history, today0) {
    const chart = $('week-chart');
    chart.textContent = '';
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = today0 - i * 86400000;
      const entries = history.filter((e) => e.ts >= dayStart && e.ts < dayStart + 86400000);
      days.push({
        dayStart,
        energyWh: entries.reduce((sum, e) => sum + (e.energyWh || 0), 0),
        queries: entries.length
      });
    }
    const maxWh = Math.max(...days.map((d) => d.energyWh), 0.001);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const day of days) {
      const col = document.createElement('div');
      col.className = 'chart-col';
      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      const pct = Math.round((day.energyWh / maxWh) * 100);
      bar.style.height = `${Math.max(2, pct)}%`;
      if (!day.queries) bar.classList.add('is-empty');
      if (day.dayStart === today0) bar.classList.add('is-today');
      bar.title = day.queries
        ? `${day.queries} queries · ${day.energyWh.toFixed(2)} Wh`
        : 'No queries';
      const label = document.createElement('span');
      label.className = 'chart-day';
      label.textContent = dayNames[new Date(day.dayStart).getDay()];
      col.append(bar, label);
      chart.appendChild(col);
    }
  }

  function renderStreak(history, today0, todayTotals) {
    // Streak: consecutive days (ending today, or yesterday if today is quiet
    // so far) whose average per-query energy earns grade A.
    let streak = 0;
    let dayStart = today0;
    if (!todayTotals.queries) dayStart -= 86400000;
    for (let i = 0; i < 365; i++) {
      const entries = history.filter((e) => e.ts >= dayStart && e.ts < dayStart + 86400000);
      if (!entries.length) break;
      const avgWh = entries.reduce((s, e) => s + (e.energyWh || 0), 0) / entries.length;
      if (state.engine.gradeFor(avgWh).grade !== 'A') break;
      streak += 1;
      dayStart -= 86400000;
    }
    $('streak-value').textContent = `${streak}-day streak`;
  }

  function onResetClick() {
    if (!confirm('Delete all recorded query history? This cannot be undone.')) return;
    chrome.storage.local.set({ eco_history: [] }, () => renderImpact());
  }

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------

  async function init() {
    const [models, grids, equivalents, settings, session] = await Promise.all([
      fetchJson('vendor/data/models.json'),
      fetchJson('vendor/data/grids.json'),
      fetchJson('vendor/data/equivalents.json'),
      loadSettings(),
      loadSession()
    ]);

    state.settings = settings;
    state.engine = new Core.ImpactEngine({ models, grids, equivalents });
    state.conv = Core.createConverters(equivalents);
    state.models = state.engine.listModels();

    // Quick grade per model (typical short query: 100 in / 300 out).
    for (const m of state.models) {
      const impact = state.engine.estimateImpact({
        modelId: m.id,
        inputTokens: 100,
        outputTokens: 300,
        options: impactOptions()
      });
      state.modelGrades[m.id] = impact ? impact.grade.grade : '?';
    }

    populateModelSelect();
    populateChecklist();

    // Restore session / settings defaults
    const modelSelect = $('model-select');
    const wanted = session.modelId || settings.defaultModel;
    if (state.models.some((m) => m.id === wanted)) modelSelect.value = wanted;
    $('effort-select').value = session.effort || settings.reasoningEffort;
    if (session.prompt) {
      state.prompt = session.prompt;
      $('prompt-input').value = session.prompt;
    }
    if (Array.isArray(session.compareIds) && session.compareIds.length) {
      state.compareIds = session.compareIds.slice(0, 4);
      populateChecklist();
    } else {
      // Sensible default comparison: current model + an efficient small model.
      const small = state.models.find((m) => m.id === 'gemini-2.0-flash') || state.models[0];
      state.compareIds = [...new Set([modelSelect.value, small.id])];
      populateChecklist();
    }

    // Events
    document.querySelectorAll('.tab').forEach((tab) =>
      tab.addEventListener('click', () => switchTab(tab.dataset.tab))
    );
    $('prompt-input').addEventListener('input', onPromptInput);
    $('model-select').addEventListener('change', onModelChange);
    $('effort-select').addEventListener('change', () => {
      renderCoach();
      saveSession();
    });
    $('trim-btn').addEventListener('click', onTrimClick);
    $('compare-in').addEventListener('input', onTokensInput);
    $('compare-out').addEventListener('input', onTokensInput);
    $('reset-btn').addEventListener('click', onResetClick);
    $('settings-link').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });

    onModelChange();
    renderCoach();
  }

  init().catch((err) => {
    console.error('EcoPrompt Coach popup failed to initialize:', err);
  });
})();
