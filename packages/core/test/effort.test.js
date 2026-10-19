// EcoPrompt Coach Core — effort as each provider names it (PLAN.md Step 3).
// node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  ImpactEngine, EFFORT_LEVELS, EFFORT_VOCABULARIES, REASONING_EFFORT, effortLevel, effortFromLabel
} = require('../src/calculator');
const modelsData = require('../src/data/models.json');
const grids = require('../src/data/grids.json');

const LEVELS = Object.keys(EFFORT_LEVELS);

function current(id, extra) {
  return {
    model_id: id, name: id, provider: 'Test', host: 'AWS', host_key: 'aws',
    status: 'current', released: '2026-09-01', data_source: 'extrapolated',
    sources: [{ url: 'https://example.org/card', status: 'fetched', checked_on: '2026-10-19' }],
    ...extra
  };
}

function engineWith(extra) {
  const data = JSON.parse(JSON.stringify(modelsData));
  data.models.push(...extra);
  return new ImpactEngine({ models: data, grids });
}

const engine = engineWith([
  current('always', { thinking: 'always', estimate: { method: 'tier', tier: 'frontier' } }),
  current('adaptive', { thinking: 'adaptive', estimate: { method: 'tier', tier: 'frontier' } }),
  current('optional', { thinking: 'optional', estimate: { method: 'tier', tier: 'small' } }),
  current('open-always', { thinking: 'always', params: { total_b: 320, active_b: 18, precision: 'fp8' }, estimate: { method: 'active-params' } }),
  current('defaults-high', { thinking: 'adaptive', default_effort: 'high', effort_vocab: 'anthropic', estimate: { method: 'tier', tier: 'frontier' } })
]);
const est = (id, reasoningEffort, extra = {}) =>
  engine.estimateImpact({ modelId: id, inputTokens: 150, outputTokens: 400, options: { reasoningEffort, ...extra } });

test('effort levels are ordered, and each one costs at least as much as the last', () => {
  let prev = null;
  for (const key of LEVELS) {
    const l = EFFORT_LEVELS[key];
    assert.ok(l.low <= l.high, key);
    if (prev) {
      assert.strictEqual(l.rank, prev.rank + 1, key);
      assert.ok(l.low >= prev.low && l.high >= prev.high, key);
    }
    prev = l;
  }
  // The three measured tiers are the engine's existing factors.
  for (const key of ['low', 'standard', 'high']) {
    assert.deepStrictEqual([EFFORT_LEVELS[key].low, EFFORT_LEVELS[key].high], [REASONING_EFFORT[key], REASONING_EFFORT[key]]);
  }
  // Past high nothing is measured: a range that starts at high.
  assert.strictEqual(EFFORT_LEVELS.xhigh.low, REASONING_EFFORT.high);
  assert.ok(EFFORT_LEVELS.max.high > EFFORT_LEVELS.xhigh.high);
});

test('effort keys and aliases resolve in any case; anything else is unknown', () => {
  assert.strictEqual(effortLevel('medium'), 'standard');
  assert.strictEqual(effortLevel('Standard'), 'standard');
  assert.strictEqual(effortLevel(' Extra High '), 'xhigh');
  assert.strictEqual(effortLevel('MAX'), 'max');
  assert.strictEqual(effortLevel('none'), 'none');
  for (const bad of ['ultra', '', null, undefined, 3, 'constructor', '__proto__']) {
    assert.strictEqual(effortLevel(bad), null, String(bad));
  }
});

test('every provider vocabulary maps onto real levels, cheapest label first', () => {
  for (const [vocab, v] of Object.entries(EFFORT_VOCABULARIES)) {
    assert.ok(['fetched', 'search-only'].includes(v.status), vocab);
    if (v.appDefault !== null) assert.ok(EFFORT_LEVELS[v.appDefault], `${vocab} appDefault`);
    let prevRank = -1;
    for (const label of Object.keys(v.labels)) {
      const hit = effortFromLabel(vocab, label);
      assert.ok(hit && EFFORT_LEVELS[hit.level], `${vocab}: ${label}`);
      assert.ok(EFFORT_LEVELS[hit.level].rank >= prevRank, `${vocab}: ${label} is cheaper than the label before it`);
      prevRank = EFFORT_LEVELS[hit.level].rank;
    }
  }
});

test('labels read the way each app shows them', () => {
  // claude.ai, fetched: Low / Medium / High / Extra high / Max; Medium by default.
  assert.deepStrictEqual(effortFromLabel('anthropic', 'Extra high'), { level: 'xhigh', multiAgent: false });
  assert.deepStrictEqual(effortFromLabel('anthropic', 'Medium'), { level: 'standard', multiAgent: false });
  assert.strictEqual(EFFORT_VOCABULARIES.anthropic.appDefault, 'standard');
  // ChatGPT: Instant is no thinking at all.
  assert.deepStrictEqual(effortFromLabel('openai', 'Instant'), { level: 'none', multiAgent: false });
  assert.deepStrictEqual(effortFromLabel('openai', 'Extra  High'), { level: 'xhigh', multiAgent: false });
  // Grok Heavy and Muse Spark Contemplating run several agents.
  assert.deepStrictEqual(effortFromLabel('xai', 'Heavy'), { level: 'high', multiAgent: true });
  assert.deepStrictEqual(effortFromLabel('meta', 'Contemplating'), { level: 'standard', multiAgent: true });
  // Not effort labels.
  assert.strictEqual(effortFromLabel('openai', 'Pro'), null);
  assert.strictEqual(effortFromLabel('openai', 'GPT-6'), null);
  assert.strictEqual(effortFromLabel('nobody', 'High'), null);
  assert.strictEqual(effortFromLabel('anthropic', null), null);
  // Names Object.prototype carries are not vocabularies or labels.
  assert.strictEqual(effortFromLabel('constructor', 'High'), null);
  assert.strictEqual(effortFromLabel('anthropic', 'constructor'), null);
  assert.strictEqual(effortFromLabel('anthropic', 'toString'), null);
});

test('every level costs at least as much as the one below it, for every thinking mode', () => {
  for (const id of ['always', 'adaptive', 'optional', 'open-always']) {
    let prev = null;
    for (const level of LEVELS) {
      const r = est(id, level).energy.range;
      if (prev) {
        assert.ok(r.lowWh >= prev.lowWh - 1e-12, `${id} ${level} low`);
        assert.ok(r.highWh >= prev.highWh - 1e-12, `${id} ${level} high`);
      }
      prev = r;
    }
  }
});

test('effort none switches thinking off, except for a model that always thinks', () => {
  const off = est('optional', 'none');
  assert.strictEqual(off.estimate.rangeOnly, false);
  assert.deepStrictEqual(off.estimate.thinkingTokens, { lowTokens: 0, highTokens: 0 });
  assert.ok(off.energy.wh >= off.energy.range.lowWh && off.energy.wh <= off.energy.range.highWh);
  // A model that always thinks cannot stop: none is its least effort.
  assert.deepStrictEqual(est('always', 'none').energy.range, est('always', 'low').energy.range);
  assert.strictEqual(est('always', 'none').estimate.rangeOnly, true);
});

test('past high the range widens upward, never down', () => {
  const high = est('always', 'high').energy.range;
  const xhigh = est('always', 'xhigh').energy.range;
  const max = est('always', 'max').energy.range;
  assert.strictEqual(xhigh.lowWh, high.lowWh);
  assert.ok(xhigh.highWh > high.highWh && max.highWh > xhigh.highWh);
});

test('with no effort given, a model uses its own documented default', () => {
  assert.deepStrictEqual(est('defaults-high', undefined).energy.range, est('defaults-high', 'high').energy.range);
  assert.deepStrictEqual(est('defaults-high', 'ultra').energy.range, est('defaults-high', 'high').energy.range);
  assert.strictEqual(est('defaults-high', undefined).factors.reasoningEffort, 'high');
  // Without a documented default, the benchmark condition.
  assert.deepStrictEqual(est('adaptive', undefined).energy.range, est('adaptive', 'standard').energy.range);
  assert.strictEqual(engine.getModel('defaults-high').effortVocab, 'anthropic');
});

test('benchmarked thinking models keep their single factor', () => {
  const r1 = (reasoningEffort) =>
    engine.estimateImpact({ modelId: 'deepseek-r1', inputTokens: 150, outputTokens: 400, options: { reasoningEffort } });
  assert.strictEqual(r1('medium').energy.wh, r1('standard').energy.wh);
  assert.strictEqual(r1('xhigh').energy.wh, r1('high').energy.wh);
  assert.strictEqual(r1('max').energy.wh, r1('high').energy.wh);
  assert.strictEqual(r1('none').energy.wh, r1('low').energy.wh);
  assert.strictEqual(r1('xhigh').factors.reasoningEffort, 'xhigh');
  assert.strictEqual(r1('xhigh').energy.range, null);
  // A plain benchmarked model ignores effort entirely.
  const plain = (reasoningEffort) =>
    engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 150, outputTokens: 400, options: { reasoningEffort } }).energy.wh;
  assert.strictEqual(plain('max'), plain('none'));
});

test('several agents at once make the figure a floor', () => {
  const one = est('always', 'high');
  const heavy = est('always', 'high', { multiAgent: true });
  assert.strictEqual(heavy.energy.range.floor, true);
  assert.strictEqual(heavy.energy.range.highWh, null);
  assert.strictEqual(heavy.energy.range.lowWh, one.energy.range.lowWh);
  assert.strictEqual(heavy.energy.wh, one.energy.range.lowWh);
  assert.strictEqual(heavy.energy.confidence.maxWh, null);
  assert.strictEqual(heavy.grade.floor, true);
  assert.strictEqual(heavy.grade.range.high, null);
  assert.strictEqual(heavy.water.range.highMl, null);
  assert.strictEqual(heavy.carbon.range.highG, null);
  assert.ok(heavy.water.range.lowMl > 0 && heavy.carbon.range.lowG > 0);
  // Ordinary answers carry floor: false.
  assert.strictEqual(one.energy.range.floor, false);
  // Benchmarked models are unaffected.
  const ref = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 150, outputTokens: 400, options: { multiAgent: true } });
  assert.strictEqual(ref.energy.range, null);
});

test('the engine refuses an effort default or vocabulary it does not know', () => {
  assert.throws(() => engineWith([current('x', { thinking: 'none', default_effort: 'turbo', estimate: { method: 'tier', tier: 'small' } })]),
    /unknown default_effort "turbo"/);
  assert.throws(() => engineWith([current('x', { thinking: 'none', effort_vocab: 'acme', estimate: { method: 'tier', tier: 'small' } })]),
    /unknown effort_vocab "acme"/);
  assert.throws(() => engineWith([current('x', { thinking: 'none', effort_vocab: 'constructor', estimate: { method: 'tier', tier: 'small' } })]),
    /unknown effort_vocab "constructor"/);
  assert.throws(() => engineWith([current('x', { thinking: 'none', default_effort: '__proto__', estimate: { method: 'tier', tier: 'small' } })]),
    /unknown default_effort "__proto__"/);
});
