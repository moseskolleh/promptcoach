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
// massively parallel — the fit consistently recovers e_in ≈ 0 and
// e_out ≈ 1–10 mWh/token, matching the literature.
//
// Water:  W (L)      = E_IT · WUE_site + E_query · WUE_source,  E_IT = E_query / PUE
// Carbon: C (kgCO2e) = E_query · CIF · embodiedFactor
//
// The embodied factor (default 1.15) amortizes hardware manufacturing and
// data-center construction over queries, following the lifecycle approach in
// Google's 2025 Gemini report and Mistral AI's 2025 LCA. See docs/METHODOLOGY.md.

'use strict';

// ----------------------------------------------------------------------------
// Linear algebra helper: exact solve of the 3×3 system for (e_in, e_out, E_fixed)
// ----------------------------------------------------------------------------

/**
 * Solve E = a·x + b·y + c for three (x, y, E) benchmark points (Cramer's rule).
 * Returns null when the system is singular.
 */
function solve3(points) {
  const [p1, p2, p3] = points;
  const m = [
    [p1.x, p1.y, 1],
    [p2.x, p2.y, 1],
    [p3.x, p3.y, 1]
  ];
  const v = [p1.e, p2.e, p3.e];

  const det = (M) =>
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);

  const d = det(m);
  if (Math.abs(d) < 1e-12) return null;

  const withCol = (col) => m.map((row, i) => row.map((val, j) => (j === col ? v[i] : val)));
  return {
    a: det(withCol(0)) / d,
    b: det(withCol(1)) / d,
    c: det(withCol(2)) / d
  };
}

/**
 * Least-squares fit of E = b·y + c (input term pinned to zero) over the
 * benchmark points. Used as fallback when the exact solve goes negative.
 */
function fitOutputOnly(points) {
  const n = points.length;
  let sy = 0, se = 0, syy = 0, sye = 0;
  for (const p of points) {
    sy += p.y;
    se += p.e;
    syy += p.y * p.y;
    sye += p.y * p.e;
  }
  const denom = n * syy - sy * sy;
  if (Math.abs(denom) < 1e-12) return null;
  const b = (n * sye - sy * se) / denom;
  const c = (se - b * sy) / n;
  return { a: 0, b, c };
}

/**
 * Fit per-token energy coefficients for one model from its three benchmark
 * points. Negative coefficients (possible with noisy measurements) are
 * projected to zero and the remaining terms re-fitted, so the resulting
 * curve is always monotonic in both token counts.
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

  let fit = solve3(points);
  if (!fit || fit.a < 0 || fit.b < 0 || fit.c < 0) {
    fit = fitOutputOnly(points);
  }
  if (!fit || fit.b < 0) {
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

const REASONING_EFFORT = {
  low: 0.4, // minimal thinking budget
  standard: 1.0, // typical budget — what the benchmarks measured
  high: 2.5 // extended thinking / hard problems
};

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
    for (const m of bundle.models.models) {
      const bench = ['short', 'medium', 'long'].map((k) => m.performance[k]);
      this.models[m.model_id] = {
        id: m.model_id,
        name: m.name,
        provider: m.provider,
        host: m.host,
        hostKey: m.host_key || m.host.toLowerCase().replace(/\s+/g, '_'),
        sizeClass: m.size_class,
        dataSource: m.data_source || 'measured',
        isReasoning: !!m.is_reasoning,
        anchor: m.provider_reported_anchor || null,
        bench,
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
    const total = Math.max(0, inputTokens) + Math.max(0, outputTokens);
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

    const tIn = Math.max(0, Number(inputTokens) || 0);
    const tOut = Math.max(0, Number(outputTokens) || 0);
    const taskMult = Math.max(0, Number(options.taskMultiplier) || 1);
    const effortKey = options.reasoningEffort || 'standard';
    const effort = model.isReasoning ? (REASONING_EFFORT[effortKey] || 1) : 1;
    const includeEmbodied = options.includeEmbodied !== false;

    const { eIn, eOut, eFixed, relStd } = model.coefficients;

    // Reasoning effort scales everything except prefill: hidden
    // chain-of-thought tokens show up in the fitted fixed term (they barely
    // vary with visible output length) as well as in the decode term.
    const decodeWh = eOut * tOut * effort;
    const fixedWh = eFixed * effort;
    const energyWh = (fixedWh + eIn * tIn + decodeWh) * taskMult;
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
    // beyond the measured token range or away from 'standard' effort.
    const maxBenchTokens = 11500;
    const extrapolated = tIn + tOut > maxBenchTokens || effort !== 1;
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
          inputWh: eIn * tIn * taskMult,
          outputWh: decodeWh * taskMult
        },
        perTokenOutMwh: eOut * 1000,
        extrapolated,
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
      grade: this.gradeFor(energyWh),
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
    const wh = Math.max(0.001, energyWh);
    const band = GRADE_BANDS.find((b) => wh <= b.maxWh);
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
    const ids = modelIds && modelIds.length ? modelIds : Object.keys(this.models);
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
              percentage: Math.round(
                ((worst.energy.wh - best.energy.wh) / worst.energy.wh) * 100
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
    for (const i of impacts) {
      if (!i) continue;
      totals.queries += 1;
      totals.energyWh += i.energy ? i.energy.wh : i.energyWh || 0;
      totals.waterMl += i.water ? i.water.ml : i.waterMl || 0;
      totals.carbonG += i.carbon ? i.carbon.gCO2e : i.carbonG || 0;
    }
    return totals;
  }
}

/**
 * Map a chat site hostname to the model most likely serving it.
 */
function autoDetectModel(hostname) {
  const map = {
    'chatgpt.com': 'gpt-5',
    'chat.openai.com': 'gpt-5',
    'claude.ai': 'claude-4.5-sonnet',
    'gemini.google.com': 'gemini-2.5-flash',
    'copilot.microsoft.com': 'gpt-5',
    'chat.mistral.ai': 'mistral-large',
    'chat.deepseek.com': 'deepseek-v3',
    'perplexity.ai': 'gpt-4o-mini',
    'poe.com': 'claude-4.5-sonnet',
    'you.com': 'gpt-4o-mini',
    'grok.com': 'grok-3'
  };
  for (const [domain, modelId] of Object.entries(map)) {
    if (hostname && hostname.includes(domain)) return modelId;
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
  REASONING_EFFORT,
  GRADE_BANDS
};

if (typeof globalThis !== 'undefined') {
  globalThis.EcoPromptCore = globalThis.EcoPromptCore || {};
  Object.assign(globalThis.EcoPromptCore, CalculatorModule);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalculatorModule;
}
