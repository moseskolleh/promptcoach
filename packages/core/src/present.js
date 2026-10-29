// EcoPrompt Coach Core — Presentation (PLAN.md Step 13)
//
// What every surface shows the same way, so the extension, the web app and
// the mobile app can't drift apart:
//   - the grade palette, as colours and as dots
//   - technical figures, with one rounding rule
//   - how to label an impact, an estimate's range and method (Step 8)
//   - the estimateImpact request built from a surface's inputs
//   - quick per-model grades for a model picker
//   - the coach's one-click tip actions: trim, "≤100 words", a greener model
// No DOM here: each surface draws these its own way.

'use strict';

// The analyzer, for the trim action: required in Node; in a browser the
// core bundle has already put it on EcoPromptCore.
function presentAnalyzer() {
  return typeof module !== 'undefined' && module.exports ? require('./analyzer.js') : globalThis.EcoPromptCore;
}

// ---------------------------------------------------------------------------
// Grade palette
// ---------------------------------------------------------------------------

/** Each grade's colour. The CSS custom properties --grade-a…e must match. */
const GRADE_COLORS = Object.freeze({
  A: '#10B981',
  B: '#84CC16',
  C: '#F59E0B',
  D: '#F97316',
  E: '#EF4444'
});

/** Each grade as a dot, for places that hold text only (a <select>). */
const GRADE_DOTS = Object.freeze({ A: '🟢', B: '🟢', C: '🟡', D: '🟠', E: '🔴' });

function gradeColor(grade) {
  return GRADE_COLORS[grade] || null;
}

function gradeDot(grade) {
  return GRADE_DOTS[grade] || '⚪';
}

/**
 * A CSS background for a described impact: its grade's colour, or for a
 * grade range ("B–E") a gradient from its low grade to its high one
 * (PLAN.md Step 8). Null without a description.
 */
function gradeBackground(desc) {
  if (!desc) return null;
  const from = GRADE_COLORS[desc.gradeLow];
  return desc.gradeHigh && desc.gradeHigh !== desc.gradeLow
    ? `linear-gradient(135deg, ${from}, ${GRADE_COLORS[desc.gradeHigh]})`
    : from;
}

// ---------------------------------------------------------------------------
// Technical figures
// ---------------------------------------------------------------------------

/**
 * The one rounding rule for every technical figure: three significant
 * figures, never more than three decimals. 0.052, 1.23, 16.7, 412.
 */
function figure(value) {
  const a = Math.abs(value);
  const decimals = a >= 99.95 ? 0 : a >= 9.995 ? 1 : a >= 0.9995 ? 2 : 3;
  return value.toFixed(decimals);
}

// From 1000 of the unit, the next unit up: 1.20 kWh, not 1200 Wh.
function figureIn(value, unit, bigUnit) {
  return Math.abs(value) >= 999.5 ? `${figure(value / 1000)} ${bigUnit}` : `${figure(value)} ${unit}`;
}

/** Wh as a short technical figure: 0.052 Wh, 1.23 Wh, 16.7 Wh, 1.20 kWh. */
function formatWh(wh) {
  return figureIn(wh, 'Wh', 'kWh');
}

/** Water: 0.420 mL, 4.20 mL, 42.0 mL, 1.20 L. */
function formatMl(ml) {
  return figureIn(ml, 'mL', 'L');
}

/** Carbon: 0.231 g CO₂e, 23.1 g CO₂e, 1.20 kg CO₂e. */
function formatG(g) {
  return figureIn(g, 'g CO₂e', 'kg CO₂e');
}

/** A grid's carbon intensity, from kg CO₂e/kWh: "353 g CO₂e/kWh". */
function formatCif(cifKgPerKwh) {
  return `${Math.round(cifKgPerKwh * 1000)} g CO₂e/kWh`;
}

/** A count of things, tokens say: "12,400". */
function formatCount(n) {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Two formatted ends as one range, sharing the unit when both ends have it:
 * "0.520 Wh" and "16.7 Wh" make "0.520–16.7 Wh". A missing high end is a
 * floor, "≥ 0.520 Wh".
 */
function joinRange(lowText, highText) {
  if (highText === null || highText === undefined) return `≥ ${lowText}`;
  if (lowText === highText) return lowText;
  const lo = /^(\S+) (.+)$/.exec(lowText);
  const hi = /^(\S+) (.+)$/.exec(highText);
  if (lo && hi && lo[2] === hi[2]) return `${lo[1]}–${hi[1]} ${lo[2]}`;
  return `${lowText} – ${highText}`;
}

function formatWhRange(lowWh, highWh) {
  return joinRange(formatWh(lowWh), highWh === null ? null : formatWh(highWh));
}

// ---------------------------------------------------------------------------
// Labelling an impact (PLAN.md Step 8)
// ---------------------------------------------------------------------------

// What each estimator is called on screen.
const METHOD_CHIPS = {
  tier: 'estimated · tier',
  'active-params': 'estimated · from parameters'
};

/**
 * How to label an impact from ImpactEngine.estimateImpact (PLAN.md Step 8).
 * A measured or benchmarked model keeps its single number and grade. A model
 * nobody has measured shows its range, its method, a grade range whenever the
 * range crosses a band, and "likely high": the estimates are built from 2025
 * models on 2025 hardware, the chosen direction of error (PLAN.md Step 2).
 *
 * whText is the figure to show: the range for a model that thinks, "≥ …" for
 * a floor, the point otherwise (with rangeText beside it). gradeLow and
 * gradeHigh are for colour; gradeHigh is null for a floor. chipText is the
 * method chip and the note together, for a surface with room for one chip.
 */
function describeImpact(impact) {
  const grade = impact.grade;
  const range = impact.energy.range;
  if (!range) {
    const wh = impact.energy.wh;
    return {
      estimated: false,
      method: null,
      methodChip: null,
      chipText: null,
      rangeOnly: false,
      floor: false,
      lowWh: wh,
      highWh: wh,
      whText: formatWh(wh),
      rangeText: null,
      gradeText: grade.grade,
      gradeLow: grade.grade,
      gradeHigh: grade.grade,
      gradeLabel: `Eco-grade ${grade.grade}`,
      note: null,
      noteReason: null
    };
  }
  const low = grade.range.low;
  const high = grade.range.high;
  const method = impact.estimate ? impact.estimate.method : null;
  const methodChip = METHOD_CHIPS[method] || 'estimated';
  const note = 'likely high';
  const rangeText = formatWhRange(range.lowWh, range.highWh);
  const thinks = !!(impact.estimate && impact.estimate.thinkingTokens && impact.estimate.thinkingTokens.highTokens > 0);
  let gradeText;
  let gradeLabel;
  if (range.floor) {
    gradeText = `≥ ${low}`;
    gradeLabel = `Eco-grade ${low} or worse`;
  } else if (low === high) {
    gradeText = low;
    gradeLabel = `Eco-grade ${low}`;
  } else {
    gradeText = `${low}–${high}`;
    gradeLabel = `Eco-grade ${low} to ${high}`;
  }
  return {
    estimated: true,
    method,
    methodChip,
    chipText: `${methodChip} · ${note}`,
    rangeOnly: range.rangeOnly,
    floor: range.floor,
    lowWh: range.lowWh,
    highWh: range.highWh,
    whText: range.rangeOnly ? rangeText : formatWh(impact.energy.wh),
    rangeText,
    gradeText,
    gradeLow: low,
    gradeHigh: high,
    gradeLabel,
    note,
    noteReason: range.floor
      ? 'Several agents answer at once and nobody publishes how many, so this is one agent\'s least.'
      : thinks
        ? 'Hidden thinking is priced from 2025 models on 2025 hardware; newer hardware likely costs less.'
        : 'Built from 2025 models on 2025 hardware; newer hardware likely costs less.'
  };
}

/**
 * What can honestly be said when `better` replaces `worse` on the same
 * query. Two single numbers give a percentage, as compareModels does. With
 * an estimate on either side, a percentage only when better's dearest end
 * is below worse's cheapest, and then "at least" that much; overlapping
 * ranges give "probably less", never a number (PLAN.md Step 27).
 * Returns null when there is no saving to claim.
 *
 * @returns {{claim: 'percent'|'probably', percentage: number|null, atLeast: boolean, energyWh: number|null}|null}
 */
function savingClaim(better, worse) {
  const a = describeImpact(better);
  const b = describeImpact(worse);
  if (!a.estimated && !b.estimated) {
    const aWh = better.energy.wh;
    const bWh = worse.energy.wh;
    if (!(bWh > 0) || aWh >= bWh) return null;
    return {
      claim: 'percent',
      // Never round a real saving up to "100% less energy".
      percentage: Math.min(aWh > 0 ? 99 : 100, Math.round(((bWh - aWh) / bWh) * 100)),
      atLeast: false,
      energyWh: bWh - aWh
    };
  }
  // A floor has no dearest end, so nothing is certain about it.
  if (a.highWh !== null && b.lowWh > 0 && a.highWh < b.lowWh) {
    const percentage = Math.floor(((b.lowWh - a.highWh) / b.lowWh) * 100);
    if (percentage > 0) return { claim: 'percent', percentage, atLeast: true, energyWh: b.lowWh - a.highWh };
  }
  if (!a.floor && better.energy.wh < worse.energy.wh) {
    return { claim: 'probably', percentage: null, atLeast: false, energyWh: null };
  }
  return null;
}

/** A percentage claim's size: "57%", or "at least 54%" from two ranges. */
function savingPercent(claim) {
  return `${claim.atLeast ? 'at least ' : ''}${claim.percentage}%`;
}

/** "57% less energy" or "at least 54% less energy". */
function savingPhrase(claim) {
  return `${savingPercent(claim)} less energy`;
}

// ---------------------------------------------------------------------------
// The estimateImpact request
// ---------------------------------------------------------------------------

/**
 * The estimateImpact options for a surface's inputs:
 *   { taskMultiplier, effort, thinkingOn, multiAgent, region, embodied }
 * A missing effort or the 'default' region leaves the engine's own default.
 */
function impactOptions(inputs = {}) {
  const tm = Number(inputs.taskMultiplier);
  return {
    taskMultiplier: Number.isFinite(tm) && tm > 0 ? tm : 1,
    reasoningEffort: inputs.effort || undefined,
    thinkingOn: inputs.thinkingOn === true,
    multiAgent: inputs.multiAgent === true,
    regionKey: inputs.region && inputs.region !== 'default' ? inputs.region : undefined,
    includeEmbodied: inputs.embodied !== false
  };
}

/**
 * The estimateImpact request for a surface's inputs: the options above plus
 * { modelId, inTokens, outTokens }. The coach, a share link, the library,
 * the pill and history re-scoring all price a query with it, so the same
 * inputs give the same number on every surface.
 */
function impactRequest(inputs) {
  return {
    modelId: inputs.modelId,
    inputTokens: inputs.inTokens,
    outputTokens: inputs.outTokens,
    options: impactOptions(inputs)
  };
}

// ---------------------------------------------------------------------------
// Quick per-model grades
// ---------------------------------------------------------------------------

/** The typical short query a model's quick grade is taken at. */
const QUICK_QUERY = Object.freeze({ inTokens: 100, outTokens: 300 });

/** A model's impact at the quick query, with the surface's other inputs. */
function quickImpact(engine, modelId, inputs = {}) {
  return engine.estimateImpact(impactRequest({ ...inputs, ...QUICK_QUERY, modelId }));
}

/** describeImpact at the quick query for each model, by id; null when a model can't be priced. */
function quickGrades(engine, models, inputs = {}) {
  const out = {};
  for (const m of models) {
    const impact = quickImpact(engine, m.id, inputs);
    out[m.id] = impact ? describeImpact(impact) : null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tip actions
// ---------------------------------------------------------------------------

/** The least saving, in percent, worth offering a model switch for. */
const SWITCH_MIN_PERCENT = 15;

/** A prompt with an output budget: "… Answer in ≤100 words." */
function withWordBudget(text, words = 100) {
  const t = String(text || '').trim();
  const ask = `Answer in ≤${words} words.`;
  if (!t) return ask;
  return `${t}${/[.!?]$/.test(t) ? ' ' : '. '}${ask}`;
}

/**
 * A meaningfully greener model for the same query, or null. Nano-class
 * models are left out: "switch to a 1B model" isn't credible advice for
 * general tasks, and Small (Haiku/mini/Flash class) is the floor the tip
 * itself recommends. Thinking models count too: every 2026 model thinks,
 * and only a saving the ranges support is offered, never a percentage
 * between overlapping estimates nor a switch for "probably less".
 *
 * @param inputs the coach's inputs, as for impactRequest
 * @returns {{model: object, claim: object}|null}
 */
function greenerModel(engine, inputs, minPercent = SWITCH_MIN_PERCENT) {
  const ids = engine.listModels().filter((m) => m.sizeClass !== 'Nano').map((m) => m.id);
  if (!ids.includes(inputs.modelId)) ids.push(inputs.modelId);
  const req = impactRequest(inputs);
  const cmp = engine.compareModels({
    modelIds: ids,
    inputTokens: req.inputTokens,
    outputTokens: req.outputTokens,
    options: req.options
  });
  const best = cmp.best;
  const current = cmp.results.find((r) => r.model.id === inputs.modelId);
  if (!best || !current || best.model.id === inputs.modelId) return null;
  const claim = savingClaim(best, current);
  if (!claim || claim.claim !== 'percent' || claim.percentage < minPercent) return null;
  return { model: best.model, claim };
}

/**
 * The one-click action for a coach tip from analyzePrompt, or null when the
 * tip is advice only. Every surface offers the same actions in the same
 * words:
 *   { kind: 'text', label, toast, apply(text) } — apply gives the new prompt
 *   { kind: 'model', label, toast, model, claim } — switch to `model`
 * ctx is the coach's inputs, as for impactRequest, plus the engine.
 */
function tipAction(tip, ctx) {
  if (tip.kind === 'polite_words') {
    return {
      kind: 'text',
      label: '✂️ Trim it for me',
      toast: '✂️ Courtesy phrases trimmed',
      apply: (text) => presentAnalyzer().generateOptimizedPrompt(text)
    };
  }
  if (tip.kind === 'output_budget') {
    return {
      kind: 'text',
      label: '➕ Add "≤100 words"',
      toast: '📏 Output budget added',
      apply: (text) => withWordBudget(text, 100)
    };
  }
  if (tip.kind === 'model' && ctx && ctx.engine) {
    const greener = greenerModel(ctx.engine, ctx);
    if (!greener) return null;
    const { model, claim } = greener;
    return {
      kind: 'model',
      label: `🔁 Switch to ${model.name} (${claim.atLeast ? `at least ${claim.percentage}% less` : `−${claim.percentage}%`})`,
      toast: `🔁 Switched to ${model.name} — ${savingPhrase(claim)} on this prompt`,
      model,
      claim
    };
  }
  return null;
}

/**
 * What a text action did, for its toast: " — 12% less energy (C → B)", or
 * '' when the prompt got no cheaper. Both impacts are the same model's, so
 * the two points compare directly.
 */
function changeNote(before, after) {
  if (!before || !after) return '';
  const beforeWh = before.energy.wh;
  const afterWh = after.energy.wh;
  if (!(beforeWh > 0) || !(afterWh < beforeWh)) return '';
  const pct = Math.round((1 - afterWh / beforeWh) * 100);
  let note = pct > 0 ? ` — ${pct}% less energy` : '';
  const from = describeImpact(before).gradeText;
  const to = describeImpact(after).gradeText;
  if (from !== to) note += ` (${from} → ${to})`;
  return note;
}

const PresentModule = {
  GRADE_COLORS,
  GRADE_DOTS,
  gradeColor,
  gradeDot,
  gradeBackground,
  figure,
  formatWh,
  formatMl,
  formatG,
  formatCif,
  formatCount,
  joinRange,
  formatWhRange,
  METHOD_CHIPS,
  describeImpact,
  savingClaim,
  savingPercent,
  savingPhrase,
  impactOptions,
  impactRequest,
  QUICK_QUERY,
  quickImpact,
  quickGrades,
  SWITCH_MIN_PERCENT,
  withWordBudget,
  greenerModel,
  tipAction,
  changeNote
};

if (typeof globalThis !== 'undefined') {
  globalThis.EcoPromptCore = globalThis.EcoPromptCore || {};
  Object.assign(globalThis.EcoPromptCore, PresentModule);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PresentModule;
}
