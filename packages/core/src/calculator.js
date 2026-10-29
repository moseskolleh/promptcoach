// EcoPrompt Coach Core — Impact Calculator
//
// Rebuilt (v2) around a per-token linear energy model instead of the old
// three-bucket interpolation:
//
//   E_query (Wh) = E_fixed  +  e_in · T_in  +  e_out · T_out_effective
//
// The three coefficients are fitted at load time from each model's three
// published benchmark points (short / medium / long from Jegham et al. 2025,
// arXiv:2505.09598), so the data file stays citable benchmark numbers while
// the engine derives a smooth, physically sensible curve. Decode (output)
// dominates because generation is sequential, while prefill (input) is
// massively parallel — so e_out (≈0.2–20 mWh/token: small models ~0.2–0.5,
// frontier chat ~1–3, reasoning ~7–18) dominates at chat-sized prompts,
// matching the literature.
//
// e_in is SMALL BUT NOT ZERO. Measured across the current catalog it spans
// 0.0009–0.516 mWh/token, non-zero for every model. Because the largest
// fitted benchmark point is 10,000 input tokens, extrapolating that term
// linearly into today's 200k–1M context windows inverts the finding this
// catalog cites for output-dominance (Adamska et al., arXiv:2503.10666,
// r≈0.9): unclamped, a 200k-token prompt attributes ~96% of its energy to
// input. estimateImpact() therefore holds the input term flat beyond
// INPUT_FIT_EXTRAPOLATION_LIMIT × benchMaxInput and reports energy.clamped.
// Do not remove that clamp without new benchmark points at long context.
//
// Water:  W (L)      = E_IT · WUE_site + E_query · WUE_source,  E_IT = E_query / PUE
// Carbon: C (kgCO2e) = E_query · CIF · embodiedFactor
//
// The embodied factor (default 1.15) amortizes hardware manufacturing and
// data-center construction over queries, following the lifecycle approach in
// Google's 2025 Gemini report and Mistral AI's 2025 LCA. See docs/METHODOLOGY.md.

'use strict';

// ----------------------------------------------------------------------------
// Linear algebra helpers: least squares for E = a·x + b·y + c with any
// subset of the three terms active.
// ----------------------------------------------------------------------------

/** Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(M, v) {
  const n = v.length;
  const A = M.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < 1e-12) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

/**
 * Least-squares fit of E = a·x + b·y + c over the benchmark points using
 * only the terms flagged active (the others are pinned to zero). With three
 * points and all three terms active this is the exact solve.
 */
function leastSquares(points, useA, useB, useC) {
  const cols = [];
  if (useA) cols.push((p) => p.x);
  if (useB) cols.push((p) => p.y);
  if (useC) cols.push(() => 1);
  const k = cols.length;
  const M = Array.from({ length: k }, () => Array(k).fill(0));
  const v = Array(k).fill(0);
  for (const p of points) {
    const row = cols.map((f) => f(p));
    for (let i = 0; i < k; i++) {
      v[i] += row[i] * p.e;
      for (let j = 0; j < k; j++) M[i][j] += row[i] * row[j];
    }
  }
  const sol = solveLinear(M, v);
  if (!sol) return null;
  let idx = 0;
  return {
    a: useA ? sol[idx++] : 0,
    b: useB ? sol[idx++] : 0,
    c: useC ? sol[idx++] : 0
  };
}

function residual(points, fit) {
  let rss = 0;
  for (const p of points) {
    const d = fit.a * p.x + fit.b * p.y + fit.c - p.e;
    rss += d * d;
  }
  return rss;
}

// Every subset of {e_in, e_out, E_fixed}, fullest first. Trying them all and
// keeping the best non-negative fit is non-negative least squares for a
// three-parameter model — cheap, exact, and it never discards a term that
// was positive just because a different one went negative.
const TERM_SUBSETS = [
  [true, true, true],
  [true, true, false],
  [false, true, true],
  [true, false, true],
  [false, true, false],
  [true, false, false],
  [false, false, true]
];

/**
 * Fit per-token energy coefficients for one model from its three benchmark
 * points. If the exact solve produces a negative coefficient (possible with
 * noisy measurements), the best-fitting non-negative subset of terms is used
 * instead, so the resulting curve is always monotonic in both token counts
 * and reproduces the measurements as closely as a physical model can.
 *
 * @param {Array<{input_tokens:number, output_tokens:number, energy_wh_mean:number, energy_wh_std:number}>} bench
 * @returns {{eIn:number, eOut:number, eFixed:number, relStd:number}}
 */
function fitCoefficients(bench) {
  ENGINE_STATS.fits += 1;
  const points = bench.map((b) => ({
    x: b.input_tokens,
    y: b.output_tokens,
    e: b.energy_wh_mean
  }));

  let fit = null;
  let bestRss = Infinity;
  for (const [useA, useB, useC] of TERM_SUBSETS) {
    const candidate = leastSquares(points, useA, useB, useC);
    if (!candidate || candidate.a < -1e-12 || candidate.b < -1e-12 || candidate.c < -1e-12) continue;
    const rss = residual(points, candidate);
    if (rss < bestRss - 1e-12) {
      bestRss = rss;
      fit = candidate;
    }
  }
  if (!fit) {
    // Degenerate data: fall back to pure proportional model on total tokens.
    const ratios = points.map((p) => p.e / Math.max(1, p.x + p.y));
    const perTok = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    fit = { a: perTok, b: perTok, c: 0 };
  }

  // Energy-weighted relative uncertainty across the bench points.
  let stdSum = 0, eSum = 0;
  for (const b of bench) {
    stdSum += b.energy_wh_std || 0;
    eSum += b.energy_wh_mean;
  }
  const relStd = eSum > 0 ? stdSum / eSum : 0.3;

  return {
    eIn: Math.max(0, fit.a),
    eOut: Math.max(0, fit.b),
    eFixed: Math.max(0, fit.c),
    relStd: Math.min(0.6, Math.max(0.05, relStd))
  };
}

// ----------------------------------------------------------------------------
// Engine
// ----------------------------------------------------------------------------

/** Coerce to a non-negative finite number; anything else counts as 0. */
/**
 * An entry's energy range: an impact's `energy.range`, or a stored
 * history record's lowWh/highWh (a null highWh is a floor). Null when the
 * entry is a single measured or benchmarked figure.
 */
function entryRange(i) {
  if (i.energy && typeof i.energy === 'object') {
    const r = i.energy.range;
    if (!r || !Number.isFinite(r.lowWh)) return null;
    return { lowWh: r.lowWh, highWh: Number.isFinite(r.highWh) ? r.highWh : null };
  }
  if (!Number.isFinite(i.lowWh) || i.lowWh < 0) return null;
  return { lowWh: i.lowWh, highWh: Number.isFinite(i.highWh) && i.highWh >= i.lowWh ? i.highWh : null };
}

function finiteOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const REASONING_EFFORT = {
  low: 0.4, // minimal thinking budget
  standard: 1.0, // typical budget — what the benchmarks measured
  high: 2.5 // extended thinking / hard problems
};

// Every effort level a provider can name, cheapest first, as a range of
// factors on thinking. low / standard / high are the three tiers above.
// Nothing past high has been measured, so xhigh and max start at high and
// widen by one more high-sized step each (METHODOLOGY §2.5.7). none means no
// thinking at all, which only a model that can stop thinking honours.
const EFFORT_LEVELS = Object.freeze({
  none: Object.freeze({ rank: 0, low: 0, high: 0 }),
  low: Object.freeze({ rank: 1, low: 0.4, high: 0.4 }),
  standard: Object.freeze({ rank: 2, low: 1, high: 1 }),
  high: Object.freeze({ rank: 3, low: 2.5, high: 2.5 }),
  xhigh: Object.freeze({ rank: 4, low: 2.5, high: 2.5 * 2.5 }),
  max: Object.freeze({ rank: 5, low: 2.5, high: 2.5 * 2.5 * 2.5 })
});
const EFFORT_ALIASES = Object.freeze({ medium: 'standard', 'extra high': 'xhigh', 'extra-high': 'xhigh' });

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Canonical effort level for a key or alias (any case), or null. */
function effortLevel(key) {
  const k = typeof key === 'string' ? key.trim().toLowerCase() : '';
  if (hasOwn(EFFORT_LEVELS, k)) return k;
  return hasOwn(EFFORT_ALIASES, k) ? EFFORT_ALIASES[k] : null;
}

// What each provider's own app calls its effort settings, mapped onto
// EFFORT_LEVELS, cheapest first. A label may also run several agents at once
// (Grok Heavy), which makes the estimate a floor; a label that switches the
// model (ChatGPT Pro runs on GPT-6 Astra) is detection's job (PLAN.md
// Step 6), so it is not listed here. Sources: METHODOLOGY §2.5.7.
const EFFORT_VOCABULARIES = Object.freeze({
  anthropic: {
    status: 'fetched',
    appDefault: 'standard',
    labels: { low: 'low', medium: 'standard', high: 'high', 'extra high': 'xhigh', max: 'max' }
  },
  openai: {
    status: 'search-only',
    appDefault: null,
    labels: { instant: 'none', medium: 'standard', high: 'high', 'extra high': 'xhigh' }
  },
  google: {
    status: 'search-only',
    appDefault: 'low',
    labels: { low: 'low', medium: 'standard', high: 'high' }
  },
  xai: {
    status: 'search-only',
    appDefault: 'low',
    labels: { fast: 'low', expert: 'high', heavy: { level: 'high', multiAgent: true } }
  },
  deepseek: {
    status: 'search-only',
    appDefault: null,
    labels: { 'non-think': 'none', instant: 'none', deepthink: 'high', 'think high': 'high', expert: 'high', 'think max': 'max' }
  },
  meta: {
    status: 'search-only',
    appDefault: null,
    labels: { instant: 'none', thinking: 'standard', contemplating: { level: 'standard', multiAgent: true } }
  }
});

/**
 * What one label in a provider's vocabulary means:
 * { level, multiAgent } or null when the label is not an effort setting.
 */
function effortFromLabel(vocab, label) {
  if (!hasOwn(EFFORT_VOCABULARIES, vocab) || typeof label !== 'string') return null;
  const labels = EFFORT_VOCABULARIES[vocab].labels;
  const key = label.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!hasOwn(labels, key)) return null;
  const hit = labels[key];
  return typeof hit === 'string' ? { level: hit, multiAgent: false } : { level: hit.level, multiAgent: !!hit.multiAgent };
}

// How far past the largest fitted input benchmark the linear input term may
// be extrapolated before it is held flat. The benchmarks top out at 10,000
// input tokens, so 5x reaches 50,000 — beyond that the term would dominate a
// number it was never fitted to support. See the header note on e_in.
const INPUT_FIT_EXTRAPOLATION_LIMIT = 5;

// A catalog entry is either a model a user can pick today ('current') or an
// older one kept as evidence for the estimators and so stored history can
// re-score ('reference'). Reference ids always resolve; they are only listed
// on request. See _metadata.notes.status_field in models.json.
const MODEL_STATUSES = ['current', 'reference'];

// The one default model every surface starts from: the web coach, the
// extension and mobile all read it here (PLAN.md Step 7). The catalog gate
// requires it to be a current entry. GPT-6.1 Sol, because the methodology
// rounds up when unsure, and ChatGPT's paid plans serve Sol.
const DEFAULT_MODEL_ID = 'gpt-6.1-sol';
const THINKING_MODES = ['always', 'adaptive', 'optional', 'none'];

const QUERY_CATEGORIES = [
  { id: 'short', maxTokens: 400, label: 'Short query' },
  { id: 'medium', maxTokens: 2000, label: 'Medium query' },
  { id: 'long', maxTokens: Infinity, label: 'Long query' }
];

// EU-energy-label-style grades on per-query energy (Wh). Anchored so that a
// median 2025 assistant prompt (Google-reported 0.24 Wh, OpenAI 0.34 Wh)
// lands in A, frontier chat in B–C, and reasoning-heavy work in D–E.
const GRADE_BANDS = [
  { grade: 'A', maxWh: 0.4 },
  { grade: 'B', maxWh: 1.2 },
  { grade: 'C', maxWh: 3.5 },
  { grade: 'D', maxWh: 10 },
  { grade: 'E', maxWh: Infinity }
];

// ----------------------------------------------------------------------------
// Estimating models nobody has measured (PLAN.md Step 2, METHODOLOGY §2.5)
//
// No lab has published a per-query energy figure for any 2026 model, so a
// current entry carries an `estimate` block instead of benchmark points. Both
// methods below derive every number from the reference (pre-2026) entries,
// and both return a range, never just a point:
//
//   active-params  open-weight models: EcoLogits' energy-per-token relation
//                  on the published active/total parameter counts, bridged to
//                  this catalog's scale by the measured reference entries.
//   tier           closed models: the median of a tier's reference entries,
//                  with their spread as the range.
//
// Thinking is a separate multiplier on top of either, taken from the
// reference pairs that differ only in thinking. A model that thinks is shown
// as a range only (decision recorded in PLAN.md, 2026-10-19).
// ----------------------------------------------------------------------------

// Ported from genai-impact/ecologits at d0b76e3 (v0.11.3, 2026-10-14),
// ecologits/impacts/llm.py, MPL-2.0. EcoLogits fitted these on ML.ENERGY
// leaderboard data: vLLM on NVIDIA H100 80GB, models up to 200B parameters.
// We use its fallback latency regression (no measured throughput) and its
// batch size of 64. Constants are copied from the source, not a paper.
const ECOLOGITS = Object.freeze({
  commit: 'd0b76e382442e63df688e9c37016f596223c8aff',
  gpuEnergyAlpha: 1.1665273170451914e-06,
  gpuEnergyBeta: -0.011205921025579175,
  gpuEnergyGamma: 4.052928146734005e-05,
  latencyAlpha: 0.0006785088094353663,
  latencyBeta: 0.0003119310311688259,
  latencyGamma: 0.019473717579473387,
  gpuMemoryGb: 80,
  serverGpus: 8,
  serverPowerKw: 1.2,
  batchSize: 64,
  defaultBits: 16
});

// Weight precision decides how many GPUs hold the model. EcoLogits assumes
// 16 bits for everything; 2026 models ship FP8 or FP4 weights and are served
// that way, so the precision a model card states is used instead.
const PRECISION_BITS = {
  fp32: 32, bf16: 16, fp16: 16, fp8: 8, mxfp8: 8, int8: 8, fp4: 4, mxfp4: 4, nvfp4: 4, int4: 4
};

const ESTIMATE_METHODS = ['active-params', 'tier'];

/** Weight bits for a stated precision; EcoLogits' 16 when none is stated. */
function precisionBits(precision) {
  return hasOwn(PRECISION_BITS, precision) ? PRECISION_BITS[precision] : ECOLOGITS.defaultBits;
}

/** GPUs needed to hold the weights: EcoLogits' 1.2× memory overhead, rounded up to a power of two. */
function ecologitsGpuCount(totalB, bits) {
  const memoryGb = (1.2 * totalB * bits) / 8;
  const gpus = Math.max(1, Math.ceil(memoryGb / ECOLOGITS.gpuMemoryGb));
  return 2 ** Math.ceil(Math.log2(gpus));
}

/**
 * IT energy per output token (Wh, before PUE), per EcoLogits: every required
 * GPU's decode energy plus those GPUs' share of the server, at batch 64.
 */
function ecologitsItWhPerToken(activeB, totalB, bits = ECOLOGITS.defaultBits) {
  const E = ECOLOGITS;
  const gpus = ecologitsGpuCount(totalB, bits);
  const gpuWh = E.gpuEnergyAlpha * Math.exp(E.gpuEnergyBeta * E.batchSize) * activeB + E.gpuEnergyGamma;
  const latencyS = E.latencyAlpha * activeB + E.latencyBeta * E.batchSize + E.latencyGamma;
  const serverWh = (latencyS / 3600) * E.serverPowerKw * 1000 * (gpus / E.serverGpus) / E.batchSize;
  return { gpus, wh: gpus * gpuWh + serverWh };
}

function geometricMean(values) {
  return Math.exp(values.reduce((s, v) => s + Math.log(v), 0) / values.length);
}

function median(values) {
  const a = [...values].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Energy of one plain answer from fitted coefficients: no effort, no task multiplier. */
function plainEnergyWh(c, benchMaxInput, tIn, tOut) {
  return c.eFixed + c.eIn * Math.min(tIn, benchMaxInput * INPUT_FIT_EXTRAPOLATION_LIMIT) + c.eOut * tOut;
}

/**
 * Everything the estimators take from the reference entries, derived once.
 *   calibration  measured, non-thinking open-weight entries: their fitted
 *                decode coefficient over EcoLogits' prediction (PUE applied)
 *   tiers        per tier, the members' fitted coefficients
 *   pairs        thinking entries with their non-thinking sibling
 */
function buildEvidence(fitted, grids) {
  const calibration = [];
  const tiers = Object.create(null);
  const pairs = [];
  for (const m of fitted) {
    if (m.dataSource === 'measured' && m.thinking === 'none' && m.params) {
      const pue = grids.providers[m.hostKey].pue;
      const eco = ecologitsItWhPerToken(m.params.active_b, m.params.total_b, precisionBits(m.params.precision));
      const c = m.coefficients;
      calibration.push({
        id: m.id,
        ratio: c.eOut / (eco.wh * pue),
        inPerOut: c.eIn / c.eOut,
        fixedTokens: c.eFixed / c.eOut,
        benchMaxInput: m.benchMaxInput,
        benchMaxOutput: m.benchMaxOutput
      });
    }
    if (m.tier) (tiers[m.tier] = tiers[m.tier] || []).push(m);
  }
  for (const m of fitted) {
    if (!m.thinkingPairOf) continue;
    const base = fitted.find((b) => b.id === m.thinkingPairOf);
    if (!base) throw new Error(`models.json: ${m.id} pairs with "${m.thinkingPairOf}", which has no benchmark points`);
    pairs.push({ thinking: m, base: { id: base.id, coefficients: base.coefficients, benchMaxInput: base.benchMaxInput } });
  }
  const ratios = calibration.map((c) => c.ratio);
  const cal = calibration.length
    ? {
        entries: calibration.map((c) => c.id),
        k: geometricMean(ratios),
        kLow: Math.min(...ratios),
        kHigh: Math.max(...ratios),
        inPerOut: geometricMean(calibration.map((c) => c.inPerOut)),
        fixedTokens: calibration.reduce((s, c) => s + c.fixedTokens, 0) / calibration.length,
        benchMaxInput: Math.max(...calibration.map((c) => c.benchMaxInput)),
        benchMaxOutput: Math.max(...calibration.map((c) => c.benchMaxOutput))
      }
    : null;
  // A measured open-weight model that always thinks is direct evidence too:
  // its plain answer is priced by the active-parameter estimator, and what
  // it measured beyond that is its thinking. (Its catalog sibling is only an
  // extrapolation, so the pair alone can disagree with the measurement.)
  if (cal) {
    for (const m of fitted) {
      if (m.dataSource !== 'measured' || m.thinking !== 'always' || !m.params) continue;
      const plain = activeParamsCoefficients(m.params, grids.providers[m.hostKey].pue, cal);
      pairs.push({ thinking: m, base: { id: `${m.id} (plain, estimated)`, coefficients: plain.coefficients, benchMaxInput: cal.benchMaxInput } });
    }
  }
  return { calibration: cal, tiers, pairs };
}

/** Plain-answer coefficients for an open-weight model, from its parameter counts. */
function activeParamsCoefficients(params, pue, cal) {
  const bits = precisionBits(params.precision);
  const eco = ecologitsItWhPerToken(params.active_b, params.total_b, bits);
  const eOut = eco.wh * pue * cal.k;
  return {
    coefficients: { eIn: eOut * cal.inPerOut, eOut, eFixed: eOut * cal.fixedTokens, relStd: 0 },
    bits,
    gpus: eco.gpus
  };
}

/** Coefficients and band factors for one `estimate` block. */
function estimateCoefficients(m, evidence, grids, hostKey) {
  ENGINE_STATS.estimates += 1;
  const est = m.estimate || {};
  if (!ESTIMATE_METHODS.includes(est.method)) {
    throw new Error(`models.json: ${m.model_id} has unknown estimate method "${est.method}"`);
  }
  if (m.thinking !== undefined && m.thinking !== 'none' && !evidence.pairs.length) {
    throw new Error(`models.json: ${m.model_id} thinks, but no reference thinking pair exists to estimate that from`);
  }
  if (est.method === 'active-params') {
    const p = m.params;
    if (!p || !(p.active_b > 0) || !(p.total_b >= p.active_b)) {
      throw new Error(`models.json: ${m.model_id} needs params.total_b >= params.active_b > 0 for active-params`);
    }
    if (p.precision !== undefined && !hasOwn(PRECISION_BITS, p.precision)) {
      throw new Error(`models.json: ${m.model_id} has unknown params.precision "${p.precision}"`);
    }
    const cal = evidence.calibration;
    if (!cal) throw new Error(`models.json: ${m.model_id} uses active-params, but no measured open-weight reference entry calibrates it`);
    const plain = activeParamsCoefficients(p, grids.providers[hostKey].pue, cal);
    return {
      coefficients: plain.coefficients,
      // The calibration entries disagree with each other by kHigh/kLow
      // (about 2x today), and a model none of them is can sit anywhere in
      // that spread, on either side. Leave-one-out confirms errors that size
      // (scripts/estimator-validation.js).
      band: { low: cal.kLow / cal.kHigh, high: cal.kHigh / cal.kLow },
      benchMaxInput: cal.benchMaxInput,
      benchMaxOutput: cal.benchMaxOutput,
      inputs: { activeB: p.active_b, totalB: p.total_b, bits: plain.bits, gpus: plain.gpus, calibratedOn: cal.entries, ecologitsCommit: ECOLOGITS.commit }
    };
  }
  const members = hasOwn(evidence.tiers, est.tier) ? evidence.tiers[est.tier] : null;
  if (!members || !members.length) {
    throw new Error(`models.json: ${m.model_id} uses tier "${est.tier}", which no reference entry belongs to`);
  }
  return {
    coefficients: {
      eIn: median(members.map((t) => t.coefficients.eIn)),
      eOut: median(members.map((t) => t.coefficients.eOut)),
      eFixed: median(members.map((t) => t.coefficients.eFixed)),
      relStd: 0
    },
    tierMembers: members,
    benchMaxInput: Math.max(...members.map((t) => t.benchMaxInput)),
    benchMaxOutput: Math.max(...members.map((t) => t.benchMaxOutput)),
    inputs: { tier: est.tier, members: members.map((t) => t.id) }
  };
}

/**
 * Hidden thinking tokens one answer adds at these token counts, low and high
 * across the reference pairs, at standard effort: the energy a pair's
 * thinking entry spends beyond its plain sibling, in the sibling's own decode
 * tokens. They are priced at the estimated model's own per-token cost, not as
 * a ratio: a ratio would double-count for a model that already costs more per
 * token. The caller scales them by the effort level's factor range.
 */
function thinkingTokens(pairs, tIn, tOut) {
  const tokens = pairs.map(({ thinking, base }) => {
    const extraWh = plainEnergyWh(thinking.coefficients, thinking.benchMaxInput, tIn, tOut) -
      plainEnergyWh(base.coefficients, base.benchMaxInput, tIn, tOut);
    return base.coefficients.eOut > 0 ? Math.max(0, extraWh / base.coefficients.eOut) : 0;
  });
  return { low: Math.min(...tokens), high: Math.max(...tokens) };
}

// The numbers a grid entry must carry, unless it borrows them.
const GRID_NUMBERS = ['pue', 'wue_onsite_l_per_kwh', 'wue_offsite_l_per_kwh', 'cif_kgco2e_per_kwh'];

/**
 * A host with no fetched source of its own borrows another host's numbers,
 * and says so: `proxy_of: "deepseek"` (PLAN.md Step 4). The entry keeps its
 * name and notes; the numbers are the target's. A proxy carries no numbers
 * of its own and can't point at another proxy, so what it borrows is never
 * ambiguous.
 */
function resolveProxies(providers) {
  if (!providers || typeof providers !== 'object') return providers;
  const out = {};
  for (const [key, p] of Object.entries(providers)) {
    if (!p || p.proxy_of === undefined) {
      out[key] = p;
      continue;
    }
    const target = hasOwn(providers, p.proxy_of) ? providers[p.proxy_of] : null;
    if (!target) throw new Error(`grids.json: ${key} is a proxy of "${p.proxy_of}", which is not a provider`);
    if (target.proxy_of !== undefined) throw new Error(`grids.json: ${key} is a proxy of "${p.proxy_of}", which is itself a proxy`);
    const own = GRID_NUMBERS.filter((n) => p[n] !== undefined);
    if (own.length) throw new Error(`grids.json: ${key} is a proxy of "${p.proxy_of}" but carries its own ${own.join(', ')}`);
    const borrowed = {};
    for (const n of GRID_NUMBERS) borrowed[n] = target[n];
    out[key] = { ...p, ...borrowed };
  }
  return out;
}

/**
 * precompute()'s output when it fits this catalog: the right version, and
 * exactly the catalog's model ids with every member and pair present.
 * Anything else, and the engine fits as usual.
 */
function usablePrecomputed(pre, entries) {
  if (!pre || pre.v !== PRECOMPUTED_VERSION || !pre.models || !Array.isArray(pre.pairs)) return null;
  const ids = (entries || []).map((m) => m && m.model_id);
  const stored = Object.keys(pre.models);
  if (stored.length !== ids.length || !ids.every((id) => hasOwn(pre.models, id))) return null;
  for (const id of ids) {
    const p = pre.models[id];
    if (!p || !p.coefficients) return null;
    if (p.estimate && p.estimate.members && !p.estimate.members.every((m) => hasOwn(pre.models, m))) return null;
  }
  if (!pre.pairs.every((p) => p && hasOwn(pre.models, p.thinking) && p.base && p.base.coefficients)) return null;
  return pre;
}

// How many fits and estimates have run, for the zero-at-start-up test
// (PLAN.md Step 13).
const ENGINE_STATS = { fits: 0, estimates: 0 };

const PRECOMPUTED_VERSION = 1;

/**
 * What an engine worked out from the catalog, ready to store: each model's
 * coefficients (fitted, or from Step 2's estimators) and the thinking pairs
 * the estimates read at query time (PLAN.md Step 13). scripts/sync-core.js
 * writes it to data/precomputed.json and into each app's bundle, and a test
 * holds it equal to a fresh fit.
 */
function precompute(engine) {
  const models = {};
  for (const r of Object.values(engine.models)) {
    models[r.id] = {
      coefficients: r.coefficients,
      benchMaxInput: r.benchMaxInput,
      benchMaxOutput: r.benchMaxOutput,
      estimate: r.estimate && {
        method: r.estimate.method,
        band: r.estimate.band,
        members: r.estimate.tierMembers ? r.estimate.tierMembers.map((t) => t.id) : null,
        inputs: r.estimate.inputs
      }
    };
  }
  return {
    v: PRECOMPUTED_VERSION,
    models,
    // A pair's base can be a priced answer rather than a catalog entry
    // (DeepSeek-R1's own plain answer), so it is stored whole.
    pairs: engine.evidence.pairs.map((p) => ({
      thinking: p.thinking.id,
      base: { id: p.base.id, coefficients: p.base.coefficients, benchMaxInput: p.base.benchMaxInput }
    }))
  };
}

class ImpactEngine {
  /**
   * @param {Object} bundle
   * @param {Object} bundle.models     parsed models.json
   * @param {Object} bundle.grids      parsed grids.json
   * @param {Object} [bundle.equivalents] parsed equivalents.json (used by conversions)
   * @param {Object} [bundle.precomputed] precompute()'s output for this same
   *        catalog: start without fitting. Used only when it covers exactly
   *        the catalog's model ids; the sync test keeps it current.
   */
  constructor(bundle) {
    if (!bundle || !bundle.models || !bundle.grids) {
      throw new Error('ImpactEngine requires { models, grids } data');
    }
    this.meta = bundle.models._metadata || {};
    this.grids = { ...bundle.grids, providers: resolveProxies(bundle.grids.providers) };
    this.equivalents = bundle.equivalents || null;
    this.embodiedFactor =
      (bundle.grids.lifecycle && bundle.grids.lifecycle.embodied_factor) || 1.15;

    this.models = {};
    const pending = [];
    const pre = usablePrecomputed(bundle.precomputed, bundle.models.models);
    for (const m of bundle.models.models || []) {
      if (!m || !m.model_id) throw new Error('models.json: every model needs a model_id');
      if (Object.prototype.hasOwnProperty.call(this.models, m.model_id)) {
        throw new Error(`models.json: ${m.model_id} is listed twice`);
      }
      // Bundles that predate the status field are all user-pickable models.
      const status = m.status === undefined ? 'current' : m.status;
      if (!MODEL_STATUSES.includes(status)) {
        throw new Error(`models.json: ${m.model_id} has unknown status "${m.status}"`);
      }
      const thinking = m.thinking === undefined ? (m.is_reasoning ? 'always' : 'none') : m.thinking;
      if (!THINKING_MODES.includes(thinking)) {
        throw new Error(`models.json: ${m.model_id} has unknown thinking mode "${m.thinking}"`);
      }
      // A model nobody has measured carries an `estimate` block instead of
      // benchmark points (never invented points in fields that mean measured).
      if (m.performance && m.estimate) {
        throw new Error(`models.json: ${m.model_id} has both performance points and an estimate block; keep one`);
      }
      const hostKey = m.host_key || String(m.host || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!this.grids.providers || !hasOwn(this.grids.providers, hostKey)) {
        throw new Error(`models.json: ${m.model_id} host_key "${hostKey}" has no entry in grids.providers`);
      }
      const defaultEffort = m.default_effort === undefined ? null : effortLevel(m.default_effort);
      if (m.default_effort !== undefined && !defaultEffort) {
        throw new Error(`models.json: ${m.model_id} has unknown default_effort "${m.default_effort}"`);
      }
      if (m.effort_vocab !== undefined && !hasOwn(EFFORT_VOCABULARIES, m.effort_vocab)) {
        throw new Error(`models.json: ${m.model_id} has unknown effort_vocab "${m.effort_vocab}"`);
      }
      const record = {
        id: m.model_id,
        name: m.name,
        provider: m.provider,
        host: m.host,
        hostKey,
        sizeClass: m.size_class,
        dataSource: m.data_source || 'measured',
        status,
        released: m.released || null,
        thinking,
        isReasoning: thinking !== 'none',
        defaultEffort,
        effortVocab: m.effort_vocab || null,
        anchor: m.provider_reported_anchor || null,
        params: m.params || null,
        tier: m.tier || null,
        thinkingPairOf: m.thinking_pair_of || null,
        supersededBy: m.superseded_by || null,
        estimate: null
      };
      // Estimated entries are filled in below, once the benchmarked ones
      // they are derived from are fitted; inserting the record now keeps
      // listModels() in data-file order.
      this.models[m.model_id] = record;
      if (m.estimate) {
        pending.push({ m: { ...m, thinking }, record });
        continue;
      }
      if (pre) {
        // Benchmark points stay as data; only their fit is precomputed.
        record.bench = ['short', 'medium', 'long'].map((k) => (m.performance || {})[k]);
        continue;
      }
      const perf = m.performance || {};
      const bench = ['short', 'medium', 'long'].map((k) => {
        const p = perf[k];
        if (!p || typeof p.energy_wh_mean !== 'number') {
          throw new Error(`models.json: ${m.model_id} is missing performance.${k}`);
        }
        return p;
      });
      Object.assign(record, {
        bench,
        benchMaxInput: Math.max(...bench.map((b) => b.input_tokens)),
        benchMaxOutput: Math.max(...bench.map((b) => b.output_tokens)),
        coefficients: fitCoefficients(bench)
      });
    }

    if (pre) {
      this.applyPrecomputed(pre);
      return;
    }

    const fitted = Object.values(this.models).filter((r) => r.bench);
    this.evidence = buildEvidence(fitted, this.grids);
    for (const { m, record } of pending) {
      const est = estimateCoefficients(m, this.evidence, this.grids, record.hostKey);
      Object.assign(record, {
        bench: [],
        benchMaxInput: est.benchMaxInput,
        benchMaxOutput: est.benchMaxOutput,
        coefficients: est.coefficients,
        estimate: {
          method: m.estimate.method,
          band: est.band || null,
          tierMembers: est.tierMembers || null,
          inputs: est.inputs
        }
      });
    }
  }

  /** Coefficients and estimates from precompute(), with no fitting. */
  applyPrecomputed(pre) {
    for (const record of Object.values(this.models)) {
      const p = pre.models[record.id];
      Object.assign(record, {
        coefficients: p.coefficients,
        benchMaxInput: p.benchMaxInput,
        benchMaxOutput: p.benchMaxOutput
      });
      if (p.estimate) {
        record.bench = [];
        record.estimate = {
          method: p.estimate.method,
          band: p.estimate.band,
          tierMembers: p.estimate.members ? p.estimate.members.map((id) => this.models[id]) : null,
          inputs: p.estimate.inputs
        };
      }
    }
    // Calibration and tiers only feed the estimators, which already ran.
    this.evidence = {
      calibration: null,
      tiers: null,
      pairs: pre.pairs.map((p) => ({ thinking: this.models[p.thinking], base: p.base }))
    };
  }

  /**
   * Models a user can pick, in data-file order. Reference entries (older
   * models kept as evidence) are left out unless asked for.
   *
   * @param {Object} [opts]
   * @param {boolean} [opts.includeReference=false]
   */
  listModels(opts = {}) {
    const includeReference = !!(opts && opts.includeReference);
    return Object.values(this.models)
      .filter((m) => includeReference || m.status === 'current')
      .map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        host: m.host,
        sizeClass: m.sizeClass,
        dataSource: m.dataSource,
        status: m.status,
        released: m.released,
        thinking: m.thinking,
        isReasoning: m.isReasoning
      }));
  }

  getModel(modelId) {
    // Own entries only: an id such as "constructor" from a share link is
    // not a model.
    return typeof modelId === 'string' && hasOwn(this.models, modelId) ? this.models[modelId] : null;
  }

  /**
   * The current model that replaced this one, following superseded_by
   * (PLAN.md Step 7): the id itself when it is current, null when its line
   * ended (superseded_by: null) or the id is unknown.
   */
  currentSuccessor(modelId) {
    const seen = new Set();
    let m = this.getModel(modelId);
    while (m && m.status !== 'current') {
      if (seen.has(m.id) || !m.supersededBy) return null;
      seen.add(m.id);
      m = this.getModel(m.supersededBy);
    }
    return m ? m.id : null;
  }

  /**
   * A saved model choice brought up to date (PLAN.md Step 7). A current id
   * stays; a reference id moves to its current successor; one whose line
   * ended, or that the catalog doesn't know, moves to DEFAULT_MODEL_ID.
   * `changed` is true only when a saved id moved, so the caller can say so
   * once; nothing saved is not a change.
   *
   * @returns {{ modelId: string, changed: boolean, from: string|null, via: 'kept'|'successor'|'default' }}
   */
  migrateModelId(modelId) {
    const saved = typeof modelId === 'string' && modelId ? modelId : null;
    const successor = saved ? this.currentSuccessor(saved) : null;
    if (successor) {
      return { modelId: successor, changed: successor !== saved, from: saved, via: successor === saved ? 'kept' : 'successor' };
    }
    return { modelId: DEFAULT_MODEL_ID, changed: saved !== null, from: saved, via: 'default' };
  }

  getCategory(inputTokens, outputTokens) {
    const total = finiteOrZero(inputTokens) + finiteOrZero(outputTokens);
    return QUERY_CATEGORIES.find((c) => total <= c.maxTokens).id;
  }

  /**
   * Region carbon-intensity lookup (kgCO2e/kWh). Returns null for unknown
   * keys or 'default' — caller falls back to the host grid's CIF.
   */
  getRegionCif(regionKey) {
    if (!regionKey || regionKey === 'default') return null;
    const region = this.grids.regions && this.grids.regions[regionKey];
    return region ? region.cif_kgco2e_per_kwh : null;
  }

  listRegions() {
    return Object.entries(this.grids.regions || {}).map(([key, r]) => ({
      key,
      name: r.name,
      cif: r.cif_kgco2e_per_kwh
    }));
  }

  /**
   * Estimate the environmental impact of one query.
   *
   * @param {Object} q
   * @param {string} q.modelId
   * @param {number} q.inputTokens
   * @param {number} q.outputTokens   expected/observed visible output tokens
   * @param {Object} [q.options]
   * @param {number} [q.options.taskMultiplier=1]  task-type energy multiplier
   * @param {string} [q.options.reasoningEffort]  an EFFORT_LEVELS key or alias;
   *        unknown or missing means the model's default_effort, else 'standard'
   * @param {boolean} [q.options.multiAgent=false]  several agents answer at
   *        once (Grok Heavy): an estimated model's figure becomes a floor
   * @param {boolean} [q.options.thinkingOn=false]  the page shows thinking
   *        switched on (ChatGPT's Medium … Extra High): a model whose thinking
   *        is optional then pays the least thinking, like one that always
   *        thinks. Adaptive models still decide for themselves.
   * @param {string} [q.options.regionKey]   override grid for carbon only
   * @param {number} [q.options.cifOverride] direct CIF override (kgCO2e/kWh)
   * @param {boolean} [q.options.includeEmbodied=true] include lifecycle uplift
   * @returns {Object|null}
   */
  estimateImpact({ modelId, inputTokens, outputTokens, options = {} }) {
    const model = this.getModel(modelId);
    if (!model) return null;
    const infra = this.grids.providers[model.hostKey];
    if (!infra) return null;

    const tIn = finiteOrZero(inputTokens);
    const tOut = finiteOrZero(outputTokens);
    const tm = Number(options.taskMultiplier);
    const taskMult = Number.isFinite(tm) && tm > 0 ? tm : 1;
    // Unknown effort falls back to the model's documented default, else to the
    // benchmark condition — and says which in factors.reasoningEffort.
    const effortKey = effortLevel(options.reasoningEffort) || model.defaultEffort || 'standard';
    // A benchmarked model scales its fitted thinking by a single factor:
    // nothing past high is measured, and it cannot stop thinking, so xhigh
    // and max count as high and none as low. An estimated model's
    // coefficients describe a plain answer; its thinking is applied below
    // as a range instead.
    const fittedEffort = REASONING_EFFORT[effortKey] ||
      (EFFORT_LEVELS[effortKey].rank < EFFORT_LEVELS.standard.rank ? REASONING_EFFORT.low : REASONING_EFFORT.high);
    const effort = model.isReasoning && !model.estimate ? fittedEffort : 1;
    const includeEmbodied = options.includeEmbodied !== false;

    const { eIn, eOut, eFixed, relStd } = model.coefficients;

    // The input coefficient is fitted over 100–10,000 tokens. Past a few
    // multiples of that, a linear term stops being an estimate and becomes an
    // invention — at 200k it would claim ~96% of the query's energy. Hold it
    // flat beyond the limit and say so, rather than emitting a confident
    // number built almost entirely out of extrapolation.
    const inputFitCap = model.benchMaxInput * INPUT_FIT_EXTRAPOLATION_LIMIT;
    const tInBilled = Math.min(tIn, inputFitCap);
    const inputClamped = tIn > inputFitCap;

    // Reasoning effort scales everything except prefill: hidden
    // chain-of-thought tokens show up in the fitted fixed term (they barely
    // vary with visible output length) as well as in the decode term.
    const decodeWh = eOut * tOut * effort;
    const fixedWh = eFixed * effort;
    let energyWh = (fixedWh + eIn * tInBilled + decodeWh) * taskMult;

    // A model nobody has measured: the evidence gives a range around that
    // plain answer, and thinking adds hidden tokens on top. A model that
    // thinks is a range only; its point is the range's geometric centre,
    // kept for sorting and totals, never for display (PLAN.md Step 2).
    let range = null;
    let thinkingRange = null;
    if (model.estimate) {
      // Hidden tokens. Only a model that always thinks, or optional thinking
      // the page shows switched on, is sure to pay the low end; adaptive
      // thinking may not think at all.
      const surelyThinks = model.thinking === 'always' ||
        (model.thinking === 'optional' && options.thinkingOn === true && effortKey !== 'none');
      let lowTokens = 0;
      let highTokens = 0;
      if (model.thinking !== 'none') {
        // A model that always thinks cannot be switched off: none is its
        // least effort.
        const level = model.thinking === 'always' && effortKey === 'none' ? EFFORT_LEVELS.low : EFFORT_LEVELS[effortKey];
        const t = thinkingTokens(this.evidence.pairs, tIn, tOut);
        lowTokens = surelyThinks ? t.low * level.low : 0;
        highTokens = t.high * level.high;
        thinkingRange = { lowTokens, highTokens };
      }
      let lowWh;
      let highWh;
      if (model.estimate.method === 'tier') {
        // Every member answers plainly at its own cost, then thinks at its
        // own per-token cost; the range is the cheapest to the dearest.
        const members = model.estimate.tierMembers.map((t) => ({
          plain: plainEnergyWh(t.coefficients, t.benchMaxInput, tIn, tOut),
          eOut: t.coefficients.eOut
        }));
        lowWh = Math.min(...members.map((x) => x.plain + lowTokens * x.eOut));
        highWh = Math.max(...members.map((x) => x.plain + highTokens * x.eOut));
        // A model sure to think is never estimated below its tier's median
        // plain answer plus the least thinking: the understatement
        // RESEARCH-2026 §4.1 rejected (PLAN.md Step 2).
        if (surelyThinks) {
          const floor = median(members.map((x) => x.plain)) + lowTokens * median(members.map((x) => x.eOut));
          lowWh = Math.max(lowWh, floor);
        }
      } else {
        const plain = plainEnergyWh(model.coefficients, model.benchMaxInput, tIn, tOut);
        lowWh = (plain + lowTokens * eOut) * model.estimate.band.low;
        highWh = (plain + highTokens * eOut) * model.estimate.band.high;
      }
      // Thinking switched off (effort none) leaves a plain answer: a point.
      const rangeOnly = highTokens > 0;
      range = { lowWh: lowWh * taskMult, highWh: highWh * taskMult, rangeOnly, floor: false };
      if (options.multiAgent === true) {
        // Several agents answer at once and nobody documents how many: one
        // agent's low end is all that is known, so the figure is a floor
        // (PLAN.md Step 3).
        range = { lowWh: range.lowWh, highWh: null, rangeOnly: true, floor: true };
        energyWh = range.lowWh;
      } else if (rangeOnly) {
        energyWh = Math.sqrt(range.lowWh * range.highWh);
      }
    }
    const energyKwh = energyWh / 1000;
    const scale = (value, wh) => (energyWh > 0 ? (value * wh) / energyWh : 0);

    // Water — on-site cooling applies to IT energy, source water to total.
    const itKwh = energyKwh / infra.pue;
    const waterOnsiteL = itKwh * infra.wue_onsite_l_per_kwh;
    const waterOffsiteL = energyKwh * infra.wue_offsite_l_per_kwh;
    const waterL = waterOnsiteL + waterOffsiteL;

    // Carbon — operational grid emissions plus lifecycle (embodied) uplift.
    let cif = infra.cif_kgco2e_per_kwh;
    let cifSource = 'host';
    if (typeof options.cifOverride === 'number' && options.cifOverride >= 0) {
      cif = options.cifOverride;
      cifSource = 'override';
    } else if (options.regionKey) {
      const regionCif = this.getRegionCif(options.regionKey);
      if (regionCif !== null) {
        cif = regionCif;
        cifSource = `region:${options.regionKey}`;
      }
    }
    const embodied = includeEmbodied ? this.embodiedFactor : 1;
    const carbonKg = energyKwh * cif * embodied;

    // Honest uncertainty: benchmark scatter, widened when we extrapolate
    // beyond the measured range on either axis (the benchmarks top out at
    // 10k input / 1.5k output tokens) or away from 'standard' effort.
    const extrapolated =
      !!model.estimate || tIn > model.benchMaxInput || tOut > model.benchMaxOutput || effort !== 1;
    const band = relStd * (extrapolated ? 2 : 1);
    const grade = inputClamped
      ? { ...this.gradeFor(energyWh), provisional: true }
      : this.gradeFor(energyWh);
    if (range) {
      grade.range = {
        low: this.gradeFor(range.lowWh).grade,
        high: range.highWh === null ? null : this.gradeFor(range.highWh).grade
      };
      grade.rangeOnly = range.rangeOnly;
      // A floor's grade is "at least" its low end.
      if (range.floor) grade.floor = true;
    }

    return {
      model: {
        id: model.id,
        name: model.name,
        provider: model.provider,
        host: model.host,
        sizeClass: model.sizeClass,
        dataSource: model.dataSource,
        status: model.status,
        released: model.released,
        thinking: model.thinking,
        isReasoning: model.isReasoning
      },
      tokens: { input: tIn, output: tOut, total: tIn + tOut },
      category: this.getCategory(tIn, tOut),
      energy: {
        wh: energyWh,
        kwh: energyKwh,
        breakdown: {
          fixedWh: fixedWh * taskMult,
          inputWh: eIn * tInBilled * taskMult,
          outputWh: decodeWh * taskMult
        },
        perTokenOutMwh: eOut * effort * 1000,
        extrapolated,
        // Present only when the prompt ran past the fitted input range. A
        // consumer that shows a number without checking this is showing a
        // floor, not an estimate.
        clamped: inputClamped
          ? {
              term: 'input',
              atTokens: inputFitCap,
              requestedTokens: tIn,
              fittedMaxTokens: model.benchMaxInput,
              reason: 'beyond fitted range — input term held flat; treat as a lower bound'
            }
          : null,
        confidence: range
          ? { minWh: range.lowWh, maxWh: range.highWh }
          : {
              minWh: Math.max(0, energyWh * (1 - band)),
              maxWh: energyWh * (1 + band)
            },
        // Present only for a model nobody has measured. With rangeOnly set,
        // `wh` is not a figure to show: display lowWh–highWh.
        range
      },
      water: {
        ml: waterL * 1000,
        l: waterL,
        breakdown: { onsiteMl: waterOnsiteL * 1000, offsiteMl: waterOffsiteL * 1000 },
        range: range
          ? { lowMl: scale(waterL * 1000, range.lowWh), highMl: range.highWh === null ? null : scale(waterL * 1000, range.highWh) }
          : null
      },
      carbon: {
        gCO2e: carbonKg * 1000,
        kgCO2e: carbonKg,
        operationalG: energyKwh * cif * 1000,
        embodiedG: energyKwh * cif * (embodied - 1) * 1000,
        range: range
          ? { lowG: scale(carbonKg * 1000, range.lowWh), highG: range.highWh === null ? null : scale(carbonKg * 1000, range.highWh) }
          : null
      },
      // A clamped estimate is a lower bound, so its grade is a floor too —
      // marked provisional rather than presented as a confident letter. An
      // estimated model's grade also carries the range's grades.
      grade,
      estimate: model.estimate
        ? {
            method: model.estimate.method,
            rangeOnly: range.rangeOnly,
            thinkingTokens: thinkingRange,
            inputs: model.estimate.inputs
          }
        : null,
      factors: {
        taskMultiplier: taskMult,
        reasoningEffort: model.isReasoning ? effortKey : null,
        pue: infra.pue,
        wueOnsite: infra.wue_onsite_l_per_kwh,
        wueOffsite: infra.wue_offsite_l_per_kwh,
        cif,
        cifSource,
        cifHostDefault: infra.cif_kgco2e_per_kwh,
        // Set when the host has no figures of its own yet and borrows
        // another host's (PLAN.md Step 4).
        hostProxyOf: infra.proxy_of || null,
        embodiedFactor: embodied
      }
    };
  }

  /**
   * EU-energy-label-style grade (A–E) for a per-query energy figure,
   * plus a 0–100 score for sorting/visuals (log scale).
   */
  gradeFor(energyWh) {
    const wh = Math.max(0.001, finiteOrZero(energyWh));
    const band = GRADE_BANDS.find((b) => wh <= b.maxWh) || GRADE_BANDS[GRADE_BANDS.length - 1];
    // 0.05 Wh → ~100, 30 Wh → ~0 (log interpolation)
    const logMin = Math.log(0.05);
    const logMax = Math.log(30);
    const score = Math.round(
      100 - ((Math.log(wh) - logMin) / (logMax - logMin)) * 100
    );
    return { grade: band.grade, score: Math.max(0, Math.min(100, score)) };
  }

  /**
   * Compare models on the same query. Returns results sorted most-efficient
   * first, with potential savings vs the worst option.
   */
  compareModels({ modelIds, includeReference = false, inputTokens, outputTokens, options = {} }) {
    // Omitting modelIds means "every model listModels() would list"; an
    // explicit empty list means none.
    const ids = [...new Set(Array.isArray(modelIds)
      ? modelIds
      : this.listModels({ includeReference }).map((m) => m.id))];
    const results = [];
    for (const id of ids) {
      const impact = this.estimateImpact({ modelId: id, inputTokens, outputTokens, options });
      if (impact) results.push(impact);
    }
    results.sort((a, b) => a.energy.wh - b.energy.wh);

    const best = results[0] || null;
    const worst = results[results.length - 1] || null;
    return {
      results,
      recommendation: best ? best.model.id : null,
      best,
      worst,
      potentialSavings:
        best && worst && worst.energy.wh > 0
          ? {
              energyWh: worst.energy.wh - best.energy.wh,
              waterMl: worst.water.ml - best.water.ml,
              carbonG: worst.carbon.gCO2e - best.carbon.gCO2e,
              ratio: (worst.energy.wh - best.energy.wh) / worst.energy.wh,
              // Never round a real saving up to "100% less energy".
              percentage: Math.min(
                best.energy.wh > 0 ? 99 : 100,
                Math.round(((worst.energy.wh - best.energy.wh) / worst.energy.wh) * 100)
              )
            }
          : null
    };
  }

  /**
   * Aggregate a list of impacts (e.g. a day's or week's history) into totals.
   */
  aggregate(impacts) {
    return aggregateImpacts(impacts);
  }
}

/**
 * Totals over impacts, stored history records, or earlier totals (one day's
 * summary): a record with a numeric `queries` adds the queries it holds and
 * its range as it is, so day summaries add up to a week without the rows
 * (PLAN.md Step 11). Needs no catalog, so the service worker can use it
 * before any data loads.
 */
function aggregateImpacts(impacts) {
  const totals = { queries: 0, energyWh: 0, waterMl: 0, carbonG: 0 };
  // Estimates sum as ranges: lows with lows, highs with highs. A measured
  // entry adds its own figure to both ends, and one floor makes the whole
  // total a floor. `range` appears only when some entry had one
  // (PLAN.md Step 8).
  const sum = { lowWh: 0, highWh: 0, lowMl: 0, highMl: 0, lowG: 0, highG: 0 };
  let anyRange = false;
  const addHigh = (wh, ml, g) => {
    if (wh === null || sum.highWh === null) {
      sum.highWh = sum.highMl = sum.highG = null;
    } else {
      sum.highWh += wh;
      sum.highMl += ml;
      sum.highG += g;
    }
  };
  for (const i of Array.isArray(impacts) ? impacts : []) {
    if (!i || typeof i !== 'object') continue;
    const wh = finiteOrZero(i.energy ? i.energy.wh : i.energyWh);
    const ml = finiteOrZero(i.water ? i.water.ml : i.waterMl);
    const g = finiteOrZero(i.carbon ? i.carbon.gCO2e : i.carbonG);
    totals.energyWh += wh;
    totals.waterMl += ml;
    totals.carbonG += g;
    if (!i.energy && typeof i.queries === 'number') {
      // Earlier totals: their range ends add as they are.
      totals.queries += finiteOrZero(i.queries);
      const r = i.range && typeof i.range === 'object' && Number.isFinite(i.range.lowWh) ? i.range : null;
      if (r) anyRange = true;
      sum.lowWh += r ? r.lowWh : wh;
      sum.lowMl += r ? finiteOrZero(r.lowMl) : ml;
      sum.lowG += r ? finiteOrZero(r.lowG) : g;
      if (r && r.highWh === null) addHigh(null);
      else addHigh(r ? r.highWh : wh, r ? finiteOrZero(r.highMl) : ml, r ? finiteOrZero(r.highG) : g);
      continue;
    }
    totals.queries += 1;
    const r = entryRange(i);
    if (r) anyRange = true;
    // Water and carbon scale with energy for one query on one host, as
    // estimateImpact's own ranges do.
    const lowShare = r && wh > 0 ? r.lowWh / wh : 1;
    const highShare = r ? (r.highWh === null ? null : wh > 0 ? r.highWh / wh : 1) : 1;
    sum.lowWh += r ? r.lowWh : wh;
    sum.lowMl += ml * lowShare;
    sum.lowG += g * lowShare;
    if (highShare === null) addHigh(null);
    else addHigh(r ? r.highWh : wh, ml * highShare, g * highShare);
  }
  if (anyRange) totals.range = sum;
  return totals;
}

// ----------------------------------------------------------------------------
// Which model is this chat page using?
// ----------------------------------------------------------------------------

// Each site's default model when nothing on the page names one (PLAN.md
// Step 6). A default is an assumption, and the apps show it as one
// ("assumed: site default"). A null default means the site's current models
// are not in the catalog yet, so the caller shows no number rather than
// another lab's model.
const HOST_DEFAULTS = {
  // Paid plans get GPT-6 Sol; Free and Go get Luna. The page doesn't show
  // the plan, so this is the paid default.
  'chatgpt.com': 'gpt-6-sol',
  'chat.openai.com': 'gpt-6-sol',
  'claude.ai': 'claude-sonnet-5-5',
  'gemini.google.com': 'gemini-3.8-flash',
  'copilot.microsoft.com': 'gpt-6-sol',
  // Le Chat is now Vibe, on the same host; Medium 3.5 is its default.
  'chat.mistral.ai': 'mistral-medium-3.5',
  // DeepSeek V4 is not in the catalog: no primary source could be read.
  'chat.deepseek.com': null,
  'meta.ai': 'muse-spark-1.3',
  // Perplexity's default is its own Sonar model, which has no entry.
  'perplexity.ai': null,
  'poe.com': 'claude-sonnet-5-5',
  'grok.com': 'grok-4.7'
};

// Hosts whose served model cannot be read off the page at all. A number shown
// for these is a per-site assumption, not a measurement of the user's choice.
// Gemini joins them: its Auto mode picks the model per prompt.
const ROUTED_HOSTS = ['perplexity.ai', 'poe.com', 'copilot.microsoft.com', 'gemini.google.com'];

function isRoutedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return ROUTED_HOSTS.some((d) => hostMatches(host, d));
}

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

/**
 * The model a chat site serves by default. Matches the domain or a subdomain
 * of it — never a substring, so "notclaude.ai" is not Claude. Null for an
 * unknown site, and for a known site whose current models are not in the
 * catalog; hostDefault() tells the two apart.
 */
function autoDetectModel(hostname) {
  return hostDefault(hostname).modelId;
}

/**
 * What a site's default is, and how far to trust it:
 * { modelId, known, routed, family }. `known` without a modelId means the
 * site is supported but its models are not in the catalog yet.
 */
function hostDefault(hostname) {
  const host = String(hostname || '').toLowerCase();
  for (const [domain, modelId] of Object.entries(HOST_DEFAULTS)) {
    if (hostMatches(host, domain)) {
      return { modelId, known: true, routed: isRoutedHost(host), family: familyForHost(host) };
    }
  }
  return { modelId: null, known: false, routed: false, family: null };
}

// The model a user has *selected* is the single largest source of error in
// the extension's estimates. Chat UIs show the selection as short text in a
// model-switcher button; the content script collects such labels and this
// pure function maps them to catalog ids.
//
// Every version is anchored at both ends with (?![\d.]), so "Sonnet 5" can't
// match "Sonnet 5.5". There are no bare catch-alls (haiku, flash, pro, large,
// medium): they absorbed every new generation into an older, cheaper sibling,
// so detection only ever understated (PLAN.md Step 6, finding 2). A label
// that names no catalog model returns null and the caller falls back to the
// site's documented default.
const MODEL_LABEL_PATTERNS = {
  openai: [
    { re: /\b(?:gpt|chatgpt)[\s-]?6\.1(?![\d.])/i, id: 'gpt-6.1-sol' },
    { re: /\bastra\b/i, id: 'gpt-6-astra' },
    { re: /\bluna\b/i, id: 'gpt-6-luna' },
    // ChatGPT's Pro is GPT-6 Astra. As a bare mode word it counts only as
    // the whole label.
    { re: /\b(?:gpt|chatgpt)[\s-]?6(?![\d.])[\s-]*pro\b/i, id: 'gpt-6-astra' },
    { re: /^pro$/i, id: 'gpt-6-astra' },
    { re: /\b(?:gpt|chatgpt)[\s-]?6(?![\d.])/i, id: 'gpt-6-sol' },
    // 2025 models still resolve where a page names them.
    { re: /\bo4[\s-]?mini\b/i, id: 'o4-mini' },
    { re: /\bo3\b(?![\s-]?mini)/i, id: 'o3' },
    { re: /\b(?:gpt|chatgpt)[\s-]?5(?![\d.])[\s-]*(?:thinking|pro|reasoning)\b/i, id: 'gpt-5-thinking' },
    { re: /\b4\.1[\s-]?nano\b/i, id: 'gpt-4.1-nano' },
    { re: /\b4o[\s-]?mini\b/i, id: 'gpt-4o-mini' },
    { re: /\b(?:gpt[\s-]?)?4o\b/i, id: 'gpt-4o' },
    { re: /\b(?:gpt|chatgpt)[\s-]?5(?![\d.])/i, id: 'gpt-5' }
  ],
  anthropic: [
    { re: /\bfable[\s-]*5\.1(?![\d.])/i, id: 'claude-fable-5-1' },
    { re: /\bopus[\s-]*5\.5(?![\d.])/i, id: 'claude-opus-5-5' },
    { re: /\bsonnet[\s-]*5\.5(?![\d.])|(?<![\d.])5\.5[\s-]*sonnet\b/i, id: 'claude-sonnet-5-5' },
    { re: /\bhaiku[\s-]*5\.5(?![\d.])|(?<![\d.])5\.5[\s-]*haiku\b/i, id: 'claude-haiku-5-5' },
    { re: /\bsonnet[\s-]*5(?![\d.])|(?<![\d.])5[\s-]*sonnet\b/i, id: 'claude-sonnet-5' },
    { re: /\bsonnet[\s-]*4\.5(?![\d.])|(?<![\d.])4\.5[\s-]*sonnet\b/i, id: 'claude-4.5-sonnet' },
    { re: /\bhaiku[\s-]*4\.5(?![\d.])|(?<![\d.])4\.5[\s-]*haiku\b/i, id: 'claude-4.5-haiku' },
    { re: /(?<![\d.])3\.7(?![\d.])[\s-]*sonnet\b|\bsonnet[\s-]*3\.7(?![\d.])/i, id: 'claude-3.7-sonnet' }
  ],
  google: [
    { re: /\bargon\b/i, id: 'gemini-4-argon' },
    { re: /(?<![\d.])3\.8[\s-]*flash\b(?![\s-]*lite)/i, id: 'gemini-3.8-flash' },
    { re: /(?<![\d.])3\.5[\s-]*flash[\s-]*lite\b/i, id: 'gemini-3.5-flash-lite' },
    { re: /(?<![\d.])2\.0[\s-]*flash\b/i, id: 'gemini-2.0-flash' },
    { re: /(?<![\d.])2\.5[\s-]*flash\b/i, id: 'gemini-2.5-flash' },
    { re: /(?<![\d.])2\.5[\s-]*pro\b/i, id: 'gemini-2.5-pro' }
  ],
  mistral: [
    { re: /\bmedium[\s-]*3\.5(?![\d.])/i, id: 'mistral-medium-3.5' },
    { re: /\bsmall[\s-]*4(?![\d.])/i, id: 'mistral-small-4' },
    { re: /\blarge[\s-]*2(?![\d.])/i, id: 'mistral-large' }
  ],
  deepseek: [
    // DeepSeek's own V4 modes (Instant, Expert) name models the catalog does
    // not carry yet, so only an explicit 2025 label resolves.
    { re: /\br1\b/i, id: 'deepseek-r1', requiresActive: true },
    { re: /\bv3(?![\d.])/i, id: 'deepseek-v3' }
  ],
  xai: [
    { re: /\bgrok[\s-]?4\.7(?![\d.])/i, id: 'grok-4.7' },
    { re: /\bgrok[\s-]?3(?![\d.])/i, id: 'grok-3' }
  ],
  meta: [
    { re: /\bmuse[\s-]*spark(?:[\s-]*1\.3(?![\d.]))?(?![\s-]*(?:\d|open\b))/i, id: 'muse-spark-1.3' }
  ],
  // Copilot does not show which model served a turn: nothing to match, so
  // the caller uses the site default. A family of its own keeps ChatGPT's
  // rules off its pages.
  microsoft: []
};

// Each family's effort vocabulary (EFFORT_VOCABULARIES), and the model a
// mode word means when no label names one: ChatGPT's Instant … Extra High
// are GPT-6 Sol at that effort, Grok's Fast, Expert and Heavy are Grok 4.7,
// and meta.ai's Instant, Thinking and Contemplating are Muse Spark 1.3.
// DeepSeek's modes name V4 models the catalog does not carry, so they give
// an effort but no model.
const FAMILY_MODES = {
  openai: { vocab: 'openai', modelId: 'gpt-6-sol' },
  anthropic: { vocab: 'anthropic', modelId: null },
  google: { vocab: 'google', modelId: null },
  xai: { vocab: 'xai', modelId: 'grok-4.7' },
  deepseek: { vocab: 'deepseek', modelId: null },
  meta: { vocab: 'meta', modelId: 'muse-spark-1.3' }
};

// How each model line's version reads in a label and in a catalog id. The
// newest version per line comes from the catalog, so a label naming a later
// one fails closed without anyone writing the list by hand: GPT-7, Claude 6,
// Opus 5.6, Gemini 5, Grok 5, DeepSeek V5, Muse 2 (PLAN.md Step 6).
const MODEL_LINES = [
  { family: 'openai', line: 'gpt', labels: [/\b(?:gpt|chatgpt)[\s-]?(\d+(?:\.\d+)?)(?![\d.])/gi], id: /^gpt-(\d+(?:\.\d+)?)(?=-|$)/ },
  { family: 'anthropic', line: 'claude', labels: [/\bclaude[\s-]*(\d+(?:\.\d+)?)(?![\d.])/gi], id: claudeVersion(null) },
  { family: 'anthropic', line: 'opus', labels: lineLabels('opus'), id: claudeVersion('opus') },
  { family: 'anthropic', line: 'sonnet', labels: lineLabels('sonnet'), id: claudeVersion('sonnet') },
  { family: 'anthropic', line: 'haiku', labels: lineLabels('haiku'), id: claudeVersion('haiku') },
  { family: 'anthropic', line: 'fable', labels: lineLabels('fable'), id: claudeVersion('fable') },
  {
    family: 'google',
    line: 'gemini',
    labels: [/\bgemini[\s-]*(\d+(?:\.\d+)?)(?![\d.])/gi, /(?<![\d.])(\d+(?:\.\d+)?)[\s-]*(?:pro|flash|argon|deep[\s-]*think)\b/gi],
    id: /^gemini-(\d+(?:\.\d+)?)(?=-)/
  },
  { family: 'xai', line: 'grok', labels: [/\bgrok[\s-]?(\d+(?:\.\d+)?)(?![\d.])/gi], id: /^grok-(\d+(?:\.\d+)?)$/ },
  { family: 'deepseek', line: 'deepseek', labels: [/(?<![\w.])v(\d+(?:\.\d+)?)(?![\d.])/gi], id: /^deepseek-v(\d+(?:\.\d+)?)$/ },
  // "Muse Glimmer 30B" is a size, not a version.
  { family: 'meta', line: 'muse', labels: [/\bmuse(?:[\s-]*spark)?[\s-]*(\d+(?:\.\d+)?)(?![\d.])(?![\s-]*b\b)/gi], id: /^muse-spark-(\d+(?:\.\d+)?)$/ },
  { family: 'mistral', line: 'medium', labels: [/\bmedium[\s-]*(\d+(?:\.\d+)?)(?![\d.])/gi], id: /^mistral-medium-(\d+(?:\.\d+)?)$/ },
  { family: 'mistral', line: 'small', labels: [/\bsmall[\s-]*(\d+(?:\.\d+)?)(?![\d.])/gi], id: /^mistral-small-(\d+(?:\.\d+)?)$/ },
  // mistral-large is Mistral Large 2, from before ids carried a version.
  {
    family: 'mistral',
    line: 'large',
    labels: [/\blarge[\s-]*(\d+(?:\.\d+)?)(?![\d.])/gi],
    id: { exec: (id) => (id === 'mistral-large' ? [id, '2'] : /^mistral-large-(\d+(?:\.\d+)?)$/.exec(id)) }
  }
];

function lineLabels(name) {
  return [
    new RegExp(`\\b${name}[\\s-]*(\\d+(?:\\.\\d+)?)(?![\\d.])`, 'gi'),
    new RegExp(`(?<![\\d.])(\\d+(?:\\.\\d+)?)[\\s-]*${name}\\b`, 'gi')
  ];
}

/** A Claude id's version, in either naming: claude-opus-5-5, claude-4.5-sonnet. */
function claudeVersion(name) {
  const tier = name || '(?:opus|sonnet|haiku|fable)';
  const newer = new RegExp(`^claude-${tier}-(\\d+(?:-\\d+)?)$`);
  const older = new RegExp(`^claude-(\\d+(?:\\.\\d+)?)-${tier}$`);
  return {
    exec(id) {
      const m = newer.exec(id);
      if (m) return [m[0], m[1].replace('-', '.')];
      return older.exec(id);
    }
  };
}

function parseVersion(text) {
  return String(text).split('.').map((n) => Number(n));
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Every catalog id a detector can return; the fallback catalog. */
function patternIds() {
  const ids = [];
  for (const list of Object.values(MODEL_LABEL_PATTERNS)) for (const p of list) ids.push(p.id);
  for (const mode of Object.values(FAMILY_MODES)) if (mode.modelId) ids.push(mode.modelId);
  return ids;
}

/** The newest version of each model line among the given catalog ids. */
function newestVersions(modelIds) {
  const newest = {};
  for (const line of MODEL_LINES) {
    for (const id of modelIds) {
      const m = line.id.exec(id);
      if (!m) continue;
      const v = parseVersion(m[1]);
      if (!newest[line.line] || compareVersions(v, newest[line.line]) > 0) newest[line.line] = v;
    }
  }
  return newest;
}

/**
 * The first label that names a later generation than the catalog's newest
 * in its line, or null. A line with no catalog version fails closed on any.
 */
function laterGeneration(family, items, newest) {
  for (const line of MODEL_LINES) {
    if (line.family !== family) continue;
    for (const item of items) {
      for (const re of line.labels) {
        re.lastIndex = 0;
        for (const m of item.text.matchAll(re)) {
          const top = newest[line.line];
          if (!top || compareVersions(parseVersion(m[1]), top) > 0) return item.text;
        }
      }
    }
  }
  return null;
}

const HOST_FAMILY = [
  ['chatgpt.com', 'openai'],
  ['chat.openai.com', 'openai'],
  // Copilot gets its own family. Mapping it to 'openai' leaked ChatGPT's
  // "Deep Research" rule onto Copilot's own Deep Research mode, reporting a
  // reasoning model's energy for a non-reasoning default — an 11.6x
  // overstatement. Copilot does not expose which model served a turn, so
  // there is nothing here to match: detection returns null and the caller
  // uses the documented host default.
  ['copilot.microsoft.com', 'microsoft'],
  ['claude.ai', 'anthropic'],
  ['gemini.google.com', 'google'],
  ['chat.mistral.ai', 'mistral'],
  ['chat.deepseek.com', 'deepseek'],
  ['grok.com', 'xai'],
  ['meta.ai', 'meta']
];

function familyForHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  for (const [domain, family] of HOST_FAMILY) {
    if (hostMatches(host, domain)) return family;
  }
  return null;
}

/**
 * Detect the selected model, and the selected effort or mode, from
 * model-picker labels scraped off a chat page.
 *
 * @param {string} hostname   page hostname (chooses the provider family)
 * @param {Array<string|{text:string, active?:boolean}>} labels
 *        short UI strings: the model switcher's text and aria-label, any
 *        pressed/checked toggle; {active} marks toggles that are on
 * @param {Object} [opts]
 * @param {string} [opts.family]  override the family (demo pages, unknown hosts)
 * @param {string[]} [opts.modelIds]  the catalog's ids, for the fail-closed
 *        check; defaults to the ids the detector itself can return
 * @returns {{modelId:string|null, effort:string|null, multiAgent:boolean,
 *            matchedText:string, source:string, unknownGeneration?:boolean}|null}
 *          modelId null with an effort means a mode with no model of its own
 *          (claude.ai's "Extra high"); the caller pairs it with the site
 *          default. null means nothing on the page was recognised.
 */
function detectModelFromLabels(hostname, labels, opts = {}) {
  const family = opts.family || familyForHost(hostname);
  if (!hasOwn(MODEL_LABEL_PATTERNS, family) || !Array.isArray(labels)) return null;
  const patterns = MODEL_LABEL_PATTERNS[family];
  const items = labels
    .map((l) => (typeof l === 'string' ? { text: l, active: false } : l))
    .filter((l) => l && typeof l.text === 'string')
    .map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), active: !!l.active }))
    .filter((l) => l.text.length > 0 && l.text.length <= 80);

  // Fail closed first. A label naming a later generation than the catalog
  // carries must not fall through to an older, cheaper sibling or to a mode
  // that implies one.
  const newest = newestVersions(Array.isArray(opts.modelIds) ? opts.modelIds : patternIds());
  const later = laterGeneration(family, items, newest);
  if (later !== null) {
    return { modelId: null, effort: null, multiAgent: false, matchedText: later, source: 'unknown-generation', unknownGeneration: true };
  }

  let model = null;
  for (const { re, id, requiresActive } of patterns) {
    for (const item of items) {
      if (requiresActive && !item.active) continue;
      if (re.test(item.text)) {
        model = { id, text: item.text };
        break;
      }
    }
    if (model) break;
  }

  // A mode or effort label, in the family's own words.
  const modes = hasOwn(FAMILY_MODES, family) ? FAMILY_MODES[family] : null;
  let effort = null;
  if (modes) {
    for (const item of items) {
      const hit = effortFromLabel(modes.vocab, item.text);
      if (hit) {
        effort = { ...hit, text: item.text };
        break;
      }
    }
  }

  if (!model && effort && modes.modelId) model = { id: modes.modelId, text: effort.text };
  if (!model && !effort) return null;
  return {
    modelId: model ? model.id : null,
    effort: effort ? effort.level : null,
    multiAgent: effort ? effort.multiAgent : false,
    matchedText: model ? model.text : effort.text,
    source: model && (!effort || model.text !== effort.text) ? 'label' : 'mode'
  };
}

// ----------------------------------------------------------------------------
// Exports (global for pages AND service workers via globalThis + CommonJS,
// no build step required)
// ----------------------------------------------------------------------------

const CalculatorModule = {
  ImpactEngine,
  fitCoefficients,
  autoDetectModel,
  hostDefault,
  detectModelFromLabels,
  familyForHost,
  isRoutedHost,
  REASONING_EFFORT,
  EFFORT_LEVELS,
  EFFORT_VOCABULARIES,
  effortLevel,
  effortFromLabel,
  GRADE_BANDS,
  INPUT_FIT_EXTRAPOLATION_LIMIT,
  MODEL_STATUSES,
  DEFAULT_MODEL_ID,
  THINKING_MODES,
  precompute,
  ENGINE_STATS,
  aggregateImpacts,
  ECOLOGITS,
  PRECISION_BITS,
  ESTIMATE_METHODS,
  ecologitsGpuCount,
  ecologitsItWhPerToken
};

if (typeof globalThis !== 'undefined') {
  globalThis.EcoPromptCore = globalThis.EcoPromptCore || {};
  Object.assign(globalThis.EcoPromptCore, CalculatorModule);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalculatorModule;
}
