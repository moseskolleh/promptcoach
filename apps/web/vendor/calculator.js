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
function finiteOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const REASONING_EFFORT = {
  low: 0.4, // minimal thinking budget
  standard: 1.0, // typical budget — what the benchmarks measured
  high: 2.5 // extended thinking / hard problems
};

// How far past the largest fitted input benchmark the linear input term may
// be extrapolated before it is held flat. The benchmarks top out at 10,000
// input tokens, so 5x reaches 50,000 — beyond that the term would dominate a
// number it was never fitted to support. See the header note on e_in.
const INPUT_FIT_EXTRAPOLATION_LIMIT = 5;

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

class ImpactEngine {
  /**
   * @param {Object} bundle
   * @param {Object} bundle.models     parsed models.json
   * @param {Object} bundle.grids      parsed grids.json
   * @param {Object} [bundle.equivalents] parsed equivalents.json (used by conversions)
   */
  constructor(bundle) {
    if (!bundle || !bundle.models || !bundle.grids) {
      throw new Error('ImpactEngine requires { models, grids } data');
    }
    this.meta = bundle.models._metadata || {};
    this.grids = bundle.grids;
    this.equivalents = bundle.equivalents || null;
    this.embodiedFactor =
      (bundle.grids.lifecycle && bundle.grids.lifecycle.embodied_factor) || 1.15;

    this.models = {};
    for (const m of bundle.models.models || []) {
      if (!m || !m.model_id) throw new Error('models.json: every model needs a model_id');
      const perf = m.performance || {};
      const bench = ['short', 'medium', 'long'].map((k) => {
        const p = perf[k];
        if (!p || typeof p.energy_wh_mean !== 'number') {
          throw new Error(`models.json: ${m.model_id} is missing performance.${k}`);
        }
        return p;
      });
      const hostKey = m.host_key || String(m.host || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!this.grids.providers || !this.grids.providers[hostKey]) {
        throw new Error(`models.json: ${m.model_id} host_key "${hostKey}" has no entry in grids.providers`);
      }
      this.models[m.model_id] = {
        id: m.model_id,
        name: m.name,
        provider: m.provider,
        host: m.host,
        hostKey,
        sizeClass: m.size_class,
        dataSource: m.data_source || 'measured',
        isReasoning: !!m.is_reasoning,
        anchor: m.provider_reported_anchor || null,
        bench,
        benchMaxInput: Math.max(...bench.map((b) => b.input_tokens)),
        benchMaxOutput: Math.max(...bench.map((b) => b.output_tokens)),
        coefficients: fitCoefficients(bench)
      };
    }
  }

  listModels() {
    return Object.values(this.models).map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      host: m.host,
      sizeClass: m.sizeClass,
      dataSource: m.dataSource,
      isReasoning: m.isReasoning
    }));
  }

  getModel(modelId) {
    return this.models[modelId] || null;
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
   * @param {'low'|'standard'|'high'} [q.options.reasoningEffort='standard']
   * @param {string} [q.options.regionKey]   override grid for carbon only
   * @param {number} [q.options.cifOverride] direct CIF override (kgCO2e/kWh)
   * @param {boolean} [q.options.includeEmbodied=true] include lifecycle uplift
   * @returns {Object|null}
   */
  estimateImpact({ modelId, inputTokens, outputTokens, options = {} }) {
    const model = this.models[modelId];
    if (!model) return null;
    const infra = this.grids.providers[model.hostKey];
    if (!infra) return null;

    const tIn = finiteOrZero(inputTokens);
    const tOut = finiteOrZero(outputTokens);
    const tm = Number(options.taskMultiplier);
    const taskMult = Number.isFinite(tm) && tm > 0 ? tm : 1;
    // Unknown effort keys fall back to the benchmark condition — and say so.
    const effortKey = REASONING_EFFORT[options.reasoningEffort] ? options.reasoningEffort : 'standard';
    const effort = model.isReasoning ? REASONING_EFFORT[effortKey] : 1;
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
    const energyWh = (fixedWh + eIn * tInBilled + decodeWh) * taskMult;
    const energyKwh = energyWh / 1000;

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
      tIn > model.benchMaxInput || tOut > model.benchMaxOutput || effort !== 1;
    const band = relStd * (extrapolated ? 2 : 1);

    return {
      model: {
        id: model.id,
        name: model.name,
        provider: model.provider,
        host: model.host,
        sizeClass: model.sizeClass,
        dataSource: model.dataSource,
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
        confidence: {
          minWh: Math.max(0, energyWh * (1 - band)),
          maxWh: energyWh * (1 + band)
        }
      },
      water: {
        ml: waterL * 1000,
        l: waterL,
        breakdown: { onsiteMl: waterOnsiteL * 1000, offsiteMl: waterOffsiteL * 1000 }
      },
      carbon: {
        gCO2e: carbonKg * 1000,
        kgCO2e: carbonKg,
        operationalG: energyKwh * cif * 1000,
        embodiedG: energyKwh * cif * (embodied - 1) * 1000
      },
      // A clamped estimate is a lower bound, so its grade is a floor too —
      // mark it provisional rather than presenting a confident letter.
      grade: inputClamped
        ? { ...this.gradeFor(energyWh), provisional: true }
        : this.gradeFor(energyWh),
      factors: {
        taskMultiplier: taskMult,
        reasoningEffort: model.isReasoning ? effortKey : null,
        pue: infra.pue,
        wueOnsite: infra.wue_onsite_l_per_kwh,
        wueOffsite: infra.wue_offsite_l_per_kwh,
        cif,
        cifSource,
        cifHostDefault: infra.cif_kgco2e_per_kwh,
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
  compareModels({ modelIds, inputTokens, outputTokens, options = {} }) {
    // Omitting modelIds means "all models"; an explicit empty list means none.
    const ids = [...new Set(Array.isArray(modelIds) ? modelIds : Object.keys(this.models))];
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
    const totals = { queries: 0, energyWh: 0, waterMl: 0, carbonG: 0 };
    for (const i of Array.isArray(impacts) ? impacts : []) {
      if (!i || typeof i !== 'object') continue;
      totals.queries += 1;
      totals.energyWh += finiteOrZero(i.energy ? i.energy.wh : i.energyWh);
      totals.waterMl += finiteOrZero(i.water ? i.water.ml : i.waterMl);
      totals.carbonG += finiteOrZero(i.carbon ? i.carbon.gCO2e : i.carbonG);
    }
    return totals;
  }
}

// ----------------------------------------------------------------------------
// Which model is this chat page using?
// ----------------------------------------------------------------------------

const HOST_DEFAULTS = {
  'chatgpt.com': 'gpt-5',
  'chat.openai.com': 'gpt-5',
  'claude.ai': 'claude-sonnet-5',
  'gemini.google.com': 'gemini-2.5-flash',
  'copilot.microsoft.com': 'gpt-5',
  'chat.mistral.ai': 'mistral-large',
  'chat.deepseek.com': 'deepseek-v3',
  // Perplexity and Poe are multi-model routers: the served model is chosen
  // per query and is not observable from the page, so these defaults are a
  // guess, not a detection. They are kept so the UI has something to show,
  // and flagged below so a caller can label them honestly.
  'perplexity.ai': 'gpt-4o-mini',
  'poe.com': 'claude-4.5-sonnet',
  'grok.com': 'grok-3'
};

// Hosts whose served model cannot be read off the page at all. A number shown
// for these is a per-site assumption, not a measurement of the user's choice.
const ROUTED_HOSTS = ['perplexity.ai', 'poe.com', 'copilot.microsoft.com'];

function isRoutedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return ROUTED_HOSTS.some((d) => hostMatches(host, d));
}

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

/**
 * Map a chat site hostname to the model most likely serving it (the site's
 * default). Matches the domain or a subdomain of it — never a substring, so
 * "notclaude.ai" is not Claude.
 */
function autoDetectModel(hostname) {
  const host = String(hostname || '').toLowerCase();
  for (const [domain, modelId] of Object.entries(HOST_DEFAULTS)) {
    if (hostMatches(host, domain)) return modelId;
  }
  return null;
}

// The model the user has *selected* is the single largest source of error in
// the extension's estimates: the same ChatGPT tab is a 0.5 Wh gpt-5 answer or
// a 30× costlier "Thinking" answer depending on one dropdown. Chat UIs show
// the selection as short text in a model-switcher button; the content script
// collects such labels and this pure function maps them to catalog ids.
// Patterns are ordered most-specific first, per provider family. A label
// that names no catalog model returns null so the caller keeps its default.
// A label naming a generation the catalog does not carry must NOT fall
// through to the nearest older sibling. Every such fallback resolved to a
// cheaper, non-reasoning model, so detection error was one-directional: the
// product only ever understated. These run before the family patterns and
// force a null (the caller then shows a documented host default, which is
// explainable, instead of asserting a specific wrong model's coefficients).
const UNKNOWN_GENERATION = [
  // GPT-6+ and any GPT-5 minor version the catalog has no entry for.
  /\bgpt[\s-]?[6-9]\b/i,
  /\b(?:gpt[\s-]?|chatgpt\s+)5\.[1-9]\b/i,
  // Claude generations with no catalog entry. Sonnet 5 is deliberately NOT
  // listed here — it has an entry, so it is matched below.
  /\b(?:opus|fable|mythos)[\s-]*\d/i,
  /\b(?:sonnet|haiku)[\s-]*[6-9]\b/i,
  /\bclaude[\s-]*[6-9]\b/i,
  // Opus has no catalog entry at any version — never guess a sibling tier.
  /\bopus\b/i,
  // Gemini 3+.
  /\bgemini[\s-]*[3-9]\b/i,
  // The lookbehind keeps "2.5 Pro" out: without it \b matches after the
  // decimal point and the trailing "5 Pro" reads as a bare generation.
  /(?<![\d.])[3-9][\s-]*(?:pro|flash|deep\s+think)\b/i,
  // Grok 4+, DeepSeek V4+, Mistral generations past the catalog.
  /\bgrok[\s-]?[4-9]\b/i,
  /\bv[4-9]\b/i,
  // Router / auto modes pick a model we cannot observe.
  /\bauto\b/i
];

const MODEL_LABEL_PATTERNS = {
  openai: [
    { re: /\bo4[\s-]?mini\b/i, id: 'o4-mini' },
    { re: /\bo3\b(?![\s-]?mini)/i, id: 'o3' },
    { re: /\b(?:gpt[\s-]?)?5[\s-]*(?:thinking|pro|reasoning)\b|\bthinking\b|\bthink\s+longer\b|\bdeep\s+research\b/i, id: 'gpt-5-thinking' },
    { re: /\b4\.1[\s-]?nano\b/i, id: 'gpt-4.1-nano' },
    { re: /\b4o[\s-]?mini\b/i, id: 'gpt-4o-mini' },
    { re: /\b(?:gpt[\s-]?)?4o\b/i, id: 'gpt-4o' },
    // Anchored to bare 5 — "5.6" is handled by UNKNOWN_GENERATION above.
    { re: /\b(?:gpt[\s-]?|chatgpt\s+)?5\b(?:[\s-]*(?:instant|chat|fast|mini|nano))?/i, id: 'gpt-5' }
  ],
  anthropic: [
    // Version-first, most-specific-first. There is deliberately no bare
    // /\bsonnet\b/ catch-all: it silently absorbed every future Sonnet.
    { re: /\bhaiku[\s-]*4\.5\b|\b4\.5[\s-]*haiku\b/i, id: 'claude-4.5-haiku' },
    { re: /\bhaiku\b/i, id: 'claude-4.5-haiku' },
    { re: /\b(?:sonnet[\s-]*)?3\.7\b/i, id: 'claude-3.7-sonnet' },
    { re: /\bsonnet[\s-]*4\.5\b|\b4\.5[\s-]*sonnet\b/i, id: 'claude-4.5-sonnet' },
    { re: /\bsonnet[\s-]*5\b|\b5[\s-]*sonnet\b/i, id: 'claude-sonnet-5' }
  ],
  google: [
    { re: /\b2\.0[\s-]?flash\b/i, id: 'gemini-2.0-flash' },
    { re: /\b2\.5[\s-]?flash(?:[\s-]?lite)?\b|\bflash(?:[\s-]?lite)?\b/i, id: 'gemini-2.5-flash' },
    { re: /\b2\.5[\s-]?pro\b|\bpro\b|\bdeep\s+think\b|\bthinking\b/i, id: 'gemini-2.5-pro' }
  ],
  mistral: [
    { re: /\bsmall\b|\bministral\b/i, id: 'mistral-small' },
    { re: /\blarge\b|\bmedium\b/i, id: 'mistral-large' }
  ],
  deepseek: [
    // DeepThink is a toggle: only an *active* toggle means R1 is in use.
    { re: /\bdeep\s*think\b|\br1\b|\breason(?:er|ing)?\b/i, id: 'deepseek-r1', requiresActive: true },
    { re: /\bv3\b|\bchat\b/i, id: 'deepseek-v3' }
  ],
  xai: [
    { re: /\bgrok[\s-]?3\b/i, id: 'grok-3' }
  ]
};

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
  ['grok.com', 'xai']
];

function familyForHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  for (const [domain, family] of HOST_FAMILY) {
    if (hostMatches(host, domain)) return family;
  }
  return null;
}

/**
 * Detect the selected model from model-picker labels scraped off a chat
 * page.
 *
 * @param {string} hostname   page hostname (chooses the provider family)
 * @param {Array<string|{text:string, active?:boolean}>} labels
 *        short UI strings: the model switcher's text and aria-label, any
 *        pressed/checked toggle; {active} marks toggles that are on
 * @param {Object} [opts]
 * @param {string} [opts.family]  override the family (demo pages, unknown hosts)
 * @returns {{modelId:string, matchedText:string}|null}
 */
function detectModelFromLabels(hostname, labels, opts = {}) {
  const family = opts.family || familyForHost(hostname);
  const patterns = MODEL_LABEL_PATTERNS[family];
  if (!patterns || !Array.isArray(labels)) return null;
  const items = labels
    .map((l) => (typeof l === 'string' ? { text: l, active: false } : l))
    .filter((l) => l && typeof l.text === 'string')
    .map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), active: !!l.active }))
    .filter((l) => l.text.length > 0 && l.text.length <= 80);
  // Fail closed first. If any visible label names a generation the catalog
  // does not carry, refuse rather than matching a looser pattern further
  // down — that path always resolved to an older, cheaper, non-reasoning
  // sibling and made the product understate.
  for (const item of items) {
    for (const re of UNKNOWN_GENERATION) {
      if (re.test(item.text)) {
        return {
          modelId: null,
          matchedText: item.text,
          source: 'unknown-generation',
          unknownGeneration: true
        };
      }
    }
  }

  for (const { re, id, requiresActive } of patterns) {
    for (const item of items) {
      if (requiresActive && !item.active) continue;
      if (re.test(item.text)) {
        return { modelId: id, matchedText: item.text, source: 'label' };
      }
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// Exports (global for pages AND service workers via globalThis + CommonJS,
// no build step required)
// ----------------------------------------------------------------------------

const CalculatorModule = {
  ImpactEngine,
  fitCoefficients,
  autoDetectModel,
  detectModelFromLabels,
  familyForHost,
  isRoutedHost,
  REASONING_EFFORT,
  GRADE_BANDS,
  INPUT_FIT_EXTRAPOLATION_LIMIT
};

if (typeof globalThis !== 'undefined') {
  globalThis.EcoPromptCore = globalThis.EcoPromptCore || {};
  Object.assign(globalThis.EcoPromptCore, CalculatorModule);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalculatorModule;
}
