// EcoPrompt Coach — popup
// Three tabs: Coach (live prompt analysis), Compare (model comparison),
// Impact (personal dashboard from recorded history).

'use strict';

(() => {
  const Core = window.EcoPromptCore;

  // An estimate's grade range ("B–E") is coloured from its low grade to its
  // high one (PLAN.md Step 8); a model with no grade yet is muted.
  const gradeBackground = (desc) => Core.gradeBackground(desc) || 'var(--muted)';

  const DEFAULT_SETTINGS = globalThis.EcoPromptDefaults;
  const Days = globalThis.EcoPromptDays;
  const History = globalThis.EcoPromptHistory;

  // Shared popup state (Coach <-> Compare share prompt/token inputs).
  const state = {
    engine: null,
    conv: null,
    settings: { ...DEFAULT_SETTINGS },
    models: [],
    modelDescs: {}, // modelId -> Core.describeImpact at Core.QUICK_QUERY
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

  /** The saved settings as stored; EcoPromptSettings.resolve applies them. */
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('eco_settings', (data) => {
        resolve((data && data.eco_settings) || {});
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

  /** The popup's inputs for Core.impactRequest: effort, region, embodied. */
  function popupInputs(extra = {}) {
    return {
      effort: $('effort-select').value || state.settings.reasoningEffort,
      region: state.settings.regionKey,
      embodied: state.settings.includeEmbodied,
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

  /** Quick grade per model at the typical short query, at the selected effort. */
  function refreshQuickGrades() {
    state.modelDescs = Core.quickGrades(state.engine, state.models, popupInputs());
  }

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
        const desc = state.modelDescs[m.id];
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} · ${desc ? desc.gradeText : '?'}${desc && desc.estimated ? ' · est.' : ''}`;
        opt.dataset.grade = desc ? desc.gradeLow : '?';
        group.appendChild(opt);
      }
      select.appendChild(group);
    }
  }

  function onModelChange() {
    const id = $('model-select').value;
    const model = state.models.find((m) => m.id === id);
    // Grade-colored dot reflects the selected model's quick grade.
    const desc = state.modelDescs[id];
    $('model-grade-dot').style.background = gradeBackground(desc);
    $('model-grade-dot').title = desc ? `${desc.gradeLabel} for a typical short query` : '';
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

    const impact = state.engine.estimateImpact(Core.impactRequest(popupInputs({
      modelId: $('model-select').value,
      inTokens: analysis.tokens,
      outTokens: analysis.outputEstimate.estimated,
      taskMultiplier: analysis.energyMultiplier
    })));
    if (!impact) return;

    // Header: grade + chips. An estimate shows a grade range, its method
    // and "likely high" (PLAN.md Step 8).
    const desc = Core.describeImpact(impact);
    const badge = $('grade-badge');
    badge.textContent = desc.gradeText;
    badge.style.background = gradeBackground(desc);
    badge.classList.toggle('is-span', desc.gradeText.length > 1);
    badge.title = desc.estimated ? desc.gradeLabel : `Eco-score ${impact.grade.score}/100`;
    const estChip = $('chip-est');
    estChip.classList.toggle('hidden', !desc.estimated);
    estChip.textContent = desc.chipText || '';
    estChip.title = desc.estimated ? desc.noteReason : '';
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
    if (desc.estimated) {
      // The secondary line is already the range; say where it comes from.
      range.textContent = desc.methodChip;
      range.title = desc.noteReason;
    } else {
      range.textContent = `± ${Core.formatWhRange(conf.minWh, conf.maxWh)}`;
      range.title = impact.energy.extrapolated
        ? 'Wider range: extrapolated beyond measured benchmark conditions'
        : 'Benchmark uncertainty range';
    }
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
        dot.style.background = gradeBackground(state.modelDescs[m.id]);
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
    // Sync token inputs with the Coach prompt analysis — but never overwrite
    // the field the user is currently typing in.
    if (document.activeElement !== $('compare-in')) {
      $('compare-in').value = state.inputTokens;
    }
    if (document.activeElement !== $('compare-out')) {
      $('compare-out').value = state.outputTokens;
    }
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
      options: Core.impactOptions(popupInputs(
        state.analysis ? { taskMultiplier: state.analysis.energyMultiplier } : {}
      ))
    });

    // Savings banner: a percentage only where the ranges allow one
    // (PLAN.md Step 27).
    const { best, worst } = comparison;
    const claim = best && worst && best !== worst ? Core.savingClaim(best, worst) : null;
    if (claim) {
      banner.classList.remove('hidden');
      banner.textContent = claim.claim === 'percent'
        ? `Save ${Core.savingPercent(claim)} by switching from ${worst.model.name} ` +
          `to ${best.model.name}`
        : `${best.model.name} probably uses less than ${worst.model.name}; their estimated ranges overlap`;
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
      const desc = Core.describeImpact(impact);
      const nameTd = document.createElement('td');
      nameTd.textContent = impact.model.name;
      if (desc.estimated) {
        const est = document.createElement('span');
        est.className = 'cell-secondary cell-est';
        est.textContent = desc.chipText;
        est.title = desc.noteReason;
        nameTd.appendChild(est);
      }
      const gradeTd = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'grade-pill';
      pill.textContent = desc.gradeText;
      pill.title = desc.gradeLabel;
      pill.style.background = gradeBackground(desc);
      pill.classList.toggle('is-span', desc.gradeText.length > 1);
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
  // Impact tab: from the daily totals ('agg:daily') alone. The rows are read
  // only to export them (PLAN.md Step 11).
  // --------------------------------------------------------------------------

  function loadDailyTotals() {
    return new Promise((resolve) => {
      chrome.storage.local.get(History.AGG_KEY, (data) => {
        const agg = data && data[History.AGG_KEY];
        resolve(agg && typeof agg === 'object' ? agg : {});
      });
    });
  }

  async function renderImpact() {
    const agg = await loadDailyTotals();
    const empty = $('impact-empty');
    const dash = $('impact-dashboard');

    const dates = Object.keys(agg).sort();
    if (!dates.some((d) => agg[d] && agg[d].queries)) {
      empty.classList.remove('hidden');
      dash.classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    dash.classList.remove('hidden');

    // Calendar days, so a daylight-saving change can't shift the edges.
    const week = Days.lastDays(Date.now(), 7).map((d) => ({ ...d, date: History.dateOf(d.start) }));
    const today = week[6].date;
    const todayTotals = History.totalsBetween(agg, today, today);
    const weekTotals = History.totalsBetween(agg, week[0].date, today);
    const allTotals = History.totalsBetween(agg, dates[0], dates[dates.length - 1]);

    // Period cards: query counts + short energy line
    // With an estimate among them, totals are a range.
    const periodSub = (totals) => {
      if (!totals.queries) return 'no queries';
      const r = totals.range;
      return r ? state.conv.energyRange(r.lowWh, r.highWh).secondary : state.conv.energy(totals.energyWh).secondary;
    };
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

    renderWeekChart(agg, week);
    renderStreak(agg, week[6].start, todayTotals);
  }

  function renderWeekChart(agg, week) {
    const chart = $('week-chart');
    chart.textContent = '';
    const today = week[week.length - 1].date;
    const days = week.map(({ start, date }) => {
      const totals = agg[date];
      return {
        dayStart: start,
        today: date === today,
        energyWh: (totals && totals.energyWh) || 0,
        queries: (totals && totals.queries) || 0
      };
    });
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
      if (day.today) bar.classList.add('is-today');
      bar.title = day.queries
        ? `${day.queries} queries · ${Core.formatWh(day.energyWh)}`
        : 'No queries';
      const label = document.createElement('span');
      label.className = 'chart-day';
      label.textContent = dayNames[new Date(day.dayStart).getDay()];
      col.append(bar, label);
      chart.appendChild(col);
    }
  }

  function renderStreak(agg, today0, todayTotals) {
    // Streak: consecutive days (ending today, or yesterday if today is quiet
    // so far) whose average per-query energy earns grade A.
    let streak = 0;
    // Walk back one calendar day at a time.
    let dayStart = todayTotals.queries ? today0 : Days.startOfDay(today0 - 1);
    for (let i = 0; i < 3650; i++) {
      const totals = agg[History.dateOf(dayStart)];
      if (!totals || !totals.queries) break;
      if (state.engine.gradeFor(totals.energyWh / totals.queries).grade !== 'A') break;
      streak += 1;
      dayStart = Days.startOfDay(dayStart - 1);
    }
    $('streak-value').textContent = `${streak}-day streak`;
  }

  /** Ask the service worker, history's only writer, to do something. */
  function askWorker(type) {
    return chrome.runtime.sendMessage({ type }).then((res) => {
      if (!res || !res.ok) throw new Error((res && res.error) || 'no answer');
      return res.result;
    });
  }

  function onResetClick() {
    if (!confirm('Delete all recorded query history? This cannot be undone.')) return;
    askWorker('eco:clear').then(renderImpact, () => {});
  }

  /** Re-estimate stored queries from their inputs with the current catalog. */
  async function onRescoreClick() {
    const status = $('rescore-status');
    status.textContent = 'Re-scoring…';
    try {
      const { rescored, kept } = await askWorker('eco:rescore');
      status.textContent = `Re-scored ${rescored} ${rescored === 1 ? 'query' : 'queries'} with today's catalog.` +
        (kept ? ` ${kept} older ${kept === 1 ? 'one keeps its' : 'ones keep their'} saved figures: no inputs were stored.` : '');
      renderImpact();
    } catch (err) {
      status.textContent = 'Could not re-score: try again after reopening the popup.';
    }
  }

  // --------------------------------------------------------------------------
  // History export — the raw per-query records, for spreadsheets, team
  // roll-ups and sustainability reporting. Nothing leaves the machine unless
  // the user shares the file.
  // --------------------------------------------------------------------------

  function csvCell(value) {
    const s = value === undefined || value === null ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function historyToCsv(history) {
    const header = ['timestamp_ms', 'datetime_iso', 'host', 'model_id', 'energy_wh', 'water_ml', 'carbon_g', 'grade',
      'low_wh', 'high_wh', 'version', 'model_source', 'effort', 'task_type', 'input_tokens', 'output_tokens_est',
      'region', 'conversation'];
    const rows = history.map((e) => [
      e.ts,
      Number.isFinite(e.ts) ? new Date(e.ts).toISOString() : '',
      e.host,
      e.modelId,
      Number(e.energyWh) || 0,
      Number(e.waterMl) || 0,
      Number(e.carbonG) || 0,
      e.grade,
      e.lowWh,
      e.highWh,
      e.v,
      e.modelSource,
      e.effort,
      e.taskType,
      e.inTokens,
      e.outTokensEst,
      e.region,
      e.convKey
    ].map(csvCell).join(','));
    return header.join(',') + '\n' + rows.join('\n') + '\n';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportHistory(format) {
    const history = await History.allRows(History.chromeStore(chrome.storage.local));
    if (!history.length) return;
    const date = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      downloadBlob(new Blob([historyToCsv(history)], { type: 'text/csv' }), `ecoprompt-history-${date}.csv`);
    } else {
      const payload = {
        exported_at: new Date().toISOString(),
        source: 'EcoPrompt Coach extension',
        totals: state.engine.aggregate(history),
        queries: history
      };
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `ecoprompt-history-${date}.json`);
    }
  }

  // --------------------------------------------------------------------------
  // Pause on this site: no pill, nothing recorded (PLAN.md Step 11)
  // --------------------------------------------------------------------------

  function initSiteSwitch() {
    if (!chrome.tabs || !chrome.tabs.query) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let host = null;
      try {
        const url = new URL((tabs && tabs[0] && tabs[0].url) || '');
        if (url.protocol === 'https:' || url.protocol === 'http:') host = url.hostname.toLowerCase();
      } catch (err) {
        /* no page, or one the popup may not read */
      }
      // Only on a chat site the content script runs on.
      if (!host || !Core.hostDefault(host).known) return;
      const box = $('site-switch');
      const sync = () => {
        box.checked = !globalThis.EcoPromptSettings.isSitePaused(state.settings, host);
      };
      $('site-switch-host').textContent = host.replace(/^www\./, '');
      $('site-switch-row').hidden = false;
      sync();
      box.addEventListener('change', () => {
        const paused = (state.settings.pausedSites || []).filter((s) => s !== host && !host.endsWith(`.${s}`));
        if (!box.checked) paused.push(host);
        state.settings = { ...state.settings, pausedSites: paused };
        chrome.storage.sync.get('eco_settings', (data) => {
          chrome.storage.sync.set({ eco_settings: { ...((data && data.eco_settings) || {}), pausedSites: paused } });
        });
      });
    });
  }

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------

  async function init() {
    const [saved, session] = await Promise.all([loadSettings(), loadSession()]);

    // No fetch, no fitting: the bundle carries both (PLAN.md Step 13).
    const bundled = Core.createBundledEngine();
    state.engine = bundled.engine;
    const settings = globalThis.EcoPromptSettings.resolve(saved, state.engine);
    state.settings = settings;
    globalThis.EcoPromptSettings.showNotice($('model-notice'));
    state.conv = bundled.converters;
    state.models = state.engine.listModels();

    // Restore the effort first: the quick grades below are computed at the
    // effort the select shows (PLAN.md Step 10).
    $('effort-select').value = session.effort || settings.reasoningEffort;
    if (!$('effort-select').value) $('effort-select').value = 'standard';
    refreshQuickGrades();

    populateModelSelect();
    populateChecklist();

    // Restore session / settings defaults
    const modelSelect = $('model-select');
    // A model kept from before an update moves to its current successor.
    const wanted = state.engine.migrateModelId(session.modelId || settings.defaultModel).modelId;
    if (state.models.some((m) => m.id === wanted)) modelSelect.value = wanted;
    if (session.prompt) {
      state.prompt = session.prompt;
      $('prompt-input').value = session.prompt;
    }
    const kept = Array.isArray(session.compareIds)
      ? [...new Set(session.compareIds.map((id) => state.engine.currentSuccessor(id)).filter(Boolean))]
      : [];
    if (kept.length) {
      state.compareIds = kept.slice(0, 4);
      populateChecklist();
    } else {
      // Sensible default comparison: current model + an efficient small model.
      const small = state.models.find((m) => m.id === 'gemini-3.5-flash-lite') || state.models[0];
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
      // The quick grades follow the effort, in the picker and the checklist.
      const selected = $('model-select').value;
      refreshQuickGrades();
      populateModelSelect();
      $('model-select').value = selected;
      populateChecklist();
      onModelChange();
    });
    $('trim-btn').addEventListener('click', onTrimClick);
    $('compare-in').addEventListener('input', onTokensInput);
    $('compare-out').addEventListener('input', onTokensInput);
    $('reset-btn').addEventListener('click', onResetClick);
    $('rescore-btn').addEventListener('click', onRescoreClick);
    initSiteSwitch();
    $('export-csv-btn').addEventListener('click', () => exportHistory('csv'));
    $('export-json-btn').addEventListener('click', () => exportHistory('json'));
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
