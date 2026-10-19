// EcoPrompt Coach Core — estimators for models nobody has measured
// (PLAN.md Step 2, METHODOLOGY §2.5). node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  ImpactEngine, ECOLOGITS, ecologitsGpuCount, ecologitsItWhPerToken
} = require('../src/calculator');
const modelsData = require('../src/data/models.json');
const grids = require('../src/data/grids.json');

const SHAPES = [[0, 0], [30, 150], [150, 400], [1000, 1000], [10000, 1500], [200000, 500]];
const EFFORTS = ['low', 'standard', 'high'];

function current(id, extra) {
  return {
    model_id: id, name: id, provider: 'Test', host: 'AWS', host_key: 'aws',
    status: 'current', released: '2026-09-01', data_source: 'extrapolated',
    sources: [{ url: 'https://example.org/card', status: 'fetched', checked_on: '2026-10-19' }],
    ...extra
  };
}

const CANDIDATES = [
  current('frontier-always', { thinking: 'always', estimate: { method: 'tier', tier: 'frontier' } }),
  current('frontier-adaptive', { thinking: 'adaptive', estimate: { method: 'tier', tier: 'frontier' } }),
  current('frontier-plain', { thinking: 'none', estimate: { method: 'tier', tier: 'frontier' } }),
  current('small-optional', { thinking: 'optional', estimate: { method: 'tier', tier: 'small' } }),
  current('moe-plain', { thinking: 'none', open_weight: true, params: { total_b: 320, active_b: 18, precision: 'fp8' }, estimate: { method: 'active-params' } }),
  current('moe-always', { thinking: 'always', open_weight: true, params: { total_b: 816, active_b: 42, precision: 'nvfp4' }, estimate: { method: 'active-params' } }),
  current('dense-small', { thinking: 'none', open_weight: true, params: { total_b: 27, active_b: 27 }, estimate: { method: 'active-params' } })
];

function catalogWith(extra) {
  const data = JSON.parse(JSON.stringify(modelsData));
  data.models.push(...extra);
  return data;
}

const engine = new ImpactEngine({ models: catalogWith(CANDIDATES), grids });
const est = (id, inputTokens, outputTokens, reasoningEffort = 'standard', taskMultiplier = 1) =>
  engine.estimateImpact({ modelId: id, inputTokens, outputTokens, options: { reasoningEffort, taskMultiplier } });

test('the EcoLogits port keeps its source constants and commit', () => {
  // genai-impact/ecologits ecologits/impacts/llm.py at this commit.
  assert.strictEqual(ECOLOGITS.commit, 'd0b76e382442e63df688e9c37016f596223c8aff');
  assert.strictEqual(ECOLOGITS.gpuEnergyAlpha, 1.1665273170451914e-06);
  assert.strictEqual(ECOLOGITS.gpuEnergyBeta, -0.011205921025579175);
  assert.strictEqual(ECOLOGITS.gpuEnergyGamma, 4.052928146734005e-05);
  assert.strictEqual(ECOLOGITS.latencyAlpha, 0.0006785088094353663);
  assert.strictEqual(ECOLOGITS.latencyBeta, 0.0003119310311688259);
  assert.strictEqual(ECOLOGITS.latencyGamma, 0.019473717579473387);
  assert.deepStrictEqual(
    [ECOLOGITS.gpuMemoryGb, ECOLOGITS.serverGpus, ECOLOGITS.serverPowerKw, ECOLOGITS.batchSize, ECOLOGITS.defaultBits],
    [80, 8, 1.2, 64, 16]
  );
});

test('the EcoLogits GPU count and per-token energy follow its formulas', () => {
  // 1.2 × params × bits/8 GB, ceil over 80 GB, rounded up to a power of two.
  assert.strictEqual(ecologitsGpuCount(1.23, 16), 1);
  assert.strictEqual(ecologitsGpuCount(70, 16), 4); // 168 GB -> 3 -> 4
  assert.strictEqual(ecologitsGpuCount(671, 16), 32); // 1610 GB -> 21 -> 32
  assert.strictEqual(ecologitsGpuCount(671, 8), 16); // 805 GB -> 11 -> 16
  assert.strictEqual(ecologitsGpuCount(0, 16), 1);
  // Llama 3.3 70B at 16 bits: 4 × (α·e^(64β)·70 + γ) + server share.
  const E = ECOLOGITS;
  const gpu = E.gpuEnergyAlpha * Math.exp(E.gpuEnergyBeta * 64) * 70 + E.gpuEnergyGamma;
  const server = ((E.latencyAlpha * 70 + E.latencyBeta * 64 + E.latencyGamma) / 3600) * 1.2 * 1000 * (4 / 8) / 64;
  assert.strictEqual(ecologitsItWhPerToken(70, 70, 16).wh, 4 * gpu + server);
  assert.ok(Math.abs(ecologitsItWhPerToken(70, 70, 16).wh - 5.48e-4) < 1e-5, 'about 0.55 mWh per token, IT only');
  // EcoLogits' own monotonicity: more active parameters never cost less.
  let prev = 0;
  for (const active of [1, 3, 8, 17, 37, 70, 104]) {
    const wh = ecologitsItWhPerToken(active, 200, 16).wh;
    assert.ok(wh > prev, `${active}B active`);
    prev = wh;
  }
});

test('the calibration bridge comes from the measured, non-thinking open-weight entries', () => {
  const cal = engine.evidence.calibration;
  assert.deepStrictEqual(cal.entries, ['llama-3.3-70b', 'llama-3.2-1b']);
  assert.ok(cal.kLow <= cal.k && cal.k <= cal.kHigh);
  // The catalog runs about 1.3-2.7x above EcoLogits for the same models.
  assert.ok(cal.kLow > 1.2 && cal.kHigh < 2.8, `k spans ${cal.kLow}-${cal.kHigh}`);
  // Every calibration entry's own decode coefficient sits inside the band.
  for (const id of cal.entries) {
    const m = engine.getModel(id);
    const predicted = ecologitsItWhPerToken(m.params.active_b, m.params.total_b, 16).wh * grids.providers[m.hostKey].pue * cal.k;
    const ratio = m.coefficients.eOut / predicted;
    assert.ok(ratio >= cal.kLow / cal.kHigh && ratio <= cal.kHigh / cal.kLow, `${id} at ${ratio}`);
  }
});

test('the thinking evidence is the GPT-5 pair and measured DeepSeek-R1', () => {
  assert.deepStrictEqual(
    engine.evidence.pairs.map((p) => `${p.thinking.id}|${p.base.id}`),
    ['gpt-5-thinking|gpt-5', 'deepseek-r1|deepseek-r1 (plain, estimated)']
  );
  const r = est('frontier-always', 150, 400);
  // About 5,300 and 5,800 hidden tokens at 150 in / 400 out.
  assert.ok(Math.abs(r.estimate.thinkingTokens.lowTokens - 5263) < 50, `${r.estimate.thinkingTokens.lowTokens}`);
  assert.ok(Math.abs(r.estimate.thinkingTokens.highTokens - 5834) < 50, `${r.estimate.thinkingTokens.highTokens}`);
});

test('a tier estimate spans every member of its tier', () => {
  const members = engine.getModel('frontier-plain').estimate.tierMembers.map((m) => m.id);
  assert.strictEqual(members.length, 8);
  for (const [i, o] of SHAPES) {
    const r = est('frontier-plain', i, o);
    for (const id of members) {
      const wh = est(id, i, o).energy.wh;
      assert.ok(wh >= r.energy.range.lowWh * (1 - 1e-12) && wh <= r.energy.range.highWh * (1 + 1e-12), `${id} at ${i}/${o}`);
    }
  }
});

test('a model that thinks is shown as a range only, a model that does not gets a point', () => {
  for (const [id, rangeOnly] of [['frontier-always', true], ['frontier-adaptive', true], ['small-optional', true],
    ['moe-always', true], ['frontier-plain', false], ['moe-plain', false], ['dense-small', false]]) {
    const r = est(id, 150, 400);
    assert.strictEqual(r.estimate.rangeOnly, rangeOnly, id);
    assert.strictEqual(r.grade.rangeOnly, rangeOnly, id);
    assert.ok(r.grade.range && r.grade.range.low && r.grade.range.high, `${id} grade range`);
    assert.strictEqual(r.energy.extrapolated, true, id);
    assert.deepStrictEqual(r.energy.confidence, { minWh: r.energy.range.lowWh, maxWh: r.energy.range.highWh }, id);
    if (rangeOnly) {
      // The stored centre is the range's geometric mean, for sorting only.
      assert.ok(Math.abs(r.energy.wh - Math.sqrt(r.energy.range.lowWh * r.energy.range.highWh)) < 1e-12, id);
    }
  }
  // A point estimate always sits inside its own range.
  for (const id of ['frontier-plain', 'moe-plain', 'dense-small']) {
    for (const [i, o] of SHAPES) {
      const r = est(id, i, o);
      assert.ok(r.energy.wh >= r.energy.range.lowWh && r.energy.wh <= r.energy.range.highWh, `${id} at ${i}/${o}`);
    }
  }
});

test('only a model that always thinks is sure to pay for thinking', () => {
  for (const [i, o] of SHAPES) {
    const always = est('frontier-always', i, o);
    const adaptive = est('frontier-adaptive', i, o);
    const plain = est('frontier-plain', i, o);
    assert.strictEqual(adaptive.energy.range.lowWh, plain.energy.range.lowWh, `${i}/${o}`);
    assert.strictEqual(adaptive.energy.range.highWh, always.energy.range.highWh, `${i}/${o}`);
    assert.ok(always.energy.range.lowWh > plain.energy.range.lowWh, `${i}/${o}`);
  }
});

test('a model that always thinks never starts below the frontier-chat median', () => {
  const frontier = engine.getModel('frontier-plain').estimate.tierMembers.map((m) => m.id);
  for (const [i, o] of SHAPES) {
    const medianWh = frontier.map((id) => est(id, i, o).energy.wh).sort((a, b) => a - b);
    const mid = (medianWh[3] + medianWh[4]) / 2;
    for (const effort of EFFORTS) {
      assert.ok(est('frontier-always', i, o, effort).energy.range.lowWh >= mid, `${i}/${o} ${effort}`);
    }
  }
});

test('ranges grow with tokens and with effort, never shrink', () => {
  for (const { model_id: id } of CANDIDATES) {
    for (const effort of EFFORTS) {
      let prev = null;
      for (const [i, o] of [[0, 0], [100, 100], [100, 1000], [5000, 1000], [5000, 4000], [80000, 4000]]) {
        const r = est(id, i, o, effort).energy.range;
        if (prev) assert.ok(r.lowWh >= prev.lowWh - 1e-12 && r.highWh >= prev.highWh - 1e-12, `${id} ${effort} ${i}/${o}`);
        prev = r;
      }
    }
    for (const [i, o] of SHAPES) {
      const [lo, st, hi] = EFFORTS.map((effort) => est(id, i, o, effort).energy.range);
      assert.ok(lo.highWh <= st.highWh && st.highWh <= hi.highWh, `${id} effort at ${i}/${o}`);
      assert.ok(lo.lowWh <= st.lowWh && st.lowWh <= hi.lowWh, `${id} effort at ${i}/${o}`);
    }
  }
});

test('water and carbon ranges move with the energy range', () => {
  const r = est('frontier-always', 150, 400, 'standard', 2);
  const f = r.energy.range.highWh / r.energy.wh;
  assert.ok(Math.abs(r.water.range.highMl / r.water.ml - f) < 1e-9);
  assert.ok(Math.abs(r.carbon.range.highG / r.carbon.gCO2e - f) < 1e-9);
  // The task multiplier scales the whole range, thinking included.
  const one = est('frontier-always', 150, 400, 'standard', 1);
  assert.ok(Math.abs(r.energy.range.lowWh / one.energy.range.lowWh - 2) < 1e-9);
  assert.ok(Math.abs(r.energy.range.highWh / one.energy.range.highWh - 2) < 1e-9);
});

test('long inputs are still clamped, and say so, for estimated models', () => {
  const r = est('moe-plain', 200000, 500);
  assert.ok(r.energy.clamped);
  assert.strictEqual(r.grade.provisional, true);
});

test('weight precision decides the GPU count', () => {
  const bf16 = new ImpactEngine({ models: catalogWith([current('a', { thinking: 'none', params: { total_b: 816, active_b: 42, precision: 'bf16' }, estimate: { method: 'active-params' } })]), grids });
  const fp4 = new ImpactEngine({ models: catalogWith([current('a', { thinking: 'none', params: { total_b: 816, active_b: 42, precision: 'nvfp4' }, estimate: { method: 'active-params' } })]), grids });
  assert.strictEqual(bf16.getModel('a').estimate.inputs.gpus, 32);
  assert.strictEqual(fp4.getModel('a').estimate.inputs.gpus, 8);
  assert.ok(fp4.getModel('a').coefficients.eOut < bf16.getModel('a').coefficients.eOut);
});

test('reference numbers do not depend on the estimators', () => {
  const plain = new ImpactEngine({ models: modelsData, grids });
  for (const { id } of plain.listModels({ includeReference: true })) {
    assert.deepStrictEqual(engine.estimateImpact({ modelId: id, inputTokens: 150, outputTokens: 400 }),
      plain.estimateImpact({ modelId: id, inputTokens: 150, outputTokens: 400 }), id);
    assert.strictEqual(plain.estimateImpact({ modelId: id, inputTokens: 1, outputTokens: 1 }).estimate, null);
  }
});

test('the engine refuses estimate blocks it cannot honour', () => {
  const build = (extra) => () => new ImpactEngine({ models: catalogWith([current('bad', extra)]), grids });
  assert.throws(build({ thinking: 'none', estimate: { method: 'vibes' } }), /unknown estimate method "vibes"/);
  assert.throws(build({ thinking: 'none', estimate: { method: 'tier', tier: 'giant' } }), /tier "giant", which no reference entry belongs to/);
  assert.throws(build({ thinking: 'none', estimate: { method: 'active-params' } }), /needs params/);
  assert.throws(build({ thinking: 'none', params: { total_b: 10, active_b: 20 }, estimate: { method: 'active-params' } }), /needs params/);
  assert.throws(build({ thinking: 'none', params: { total_b: 10, active_b: 1, precision: 'fp3' }, estimate: { method: 'active-params' } }), /unknown params.precision "fp3"/);
  // No thinking evidence at all: a thinking model cannot be estimated.
  const noPairs = JSON.parse(JSON.stringify(modelsData));
  for (const m of noPairs.models) {
    delete m.thinking_pair_of;
    if (m.model_id === 'deepseek-r1') m.data_source = 'benchmarked';
  }
  noPairs.models.push(current('thinker', { thinking: 'always', estimate: { method: 'tier', tier: 'frontier' } }));
  assert.throws(() => new ImpactEngine({ models: noPairs, grids }), /no reference thinking pair/);
  // No calibration entry: an open-weight model cannot be estimated.
  const noCal = JSON.parse(JSON.stringify(modelsData));
  for (const m of noCal.models) if (m.params) m.data_source = 'extrapolated';
  noCal.models.push(current('open', { thinking: 'none', params: { total_b: 10, active_b: 1 }, estimate: { method: 'active-params' } }));
  assert.throws(() => new ImpactEngine({ models: noCal, grids }), /no measured open-weight reference entry calibrates it/);
});
