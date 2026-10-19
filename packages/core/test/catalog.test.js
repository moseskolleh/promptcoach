// EcoPrompt Coach Core — catalog schema v3 tests (node --test)
//
// Current vs reference entries (PLAN.md Step 1). The data rules below are
// checked against models.json AND against synthetic catalogs that break
// them, so a rule that has nothing to check today still provably bites.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { ImpactEngine, MODEL_STATUSES, THINKING_MODES } = require('../src/calculator');
const modelsData = require('../src/data/models.json');
const grids = require('../src/data/grids.json');
const { snapshot } = require('./fixtures/make-reference-snapshot');
const referenceSnapshot = require('./fixtures/reference-estimates.json');

const CURRENT_FROM = '2026-01-01';
const SOURCE_STATUSES = ['fetched', 'search-only'];
const ISO_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** Every way a catalog breaks the schema v3 rules, as readable strings. */
function catalogProblems(data) {
  const problems = [];
  for (const m of data.models) {
    const id = m.model_id;
    if (!MODEL_STATUSES.includes(m.status)) problems.push(`${id}: status must be one of ${MODEL_STATUSES}`);
    if (!THINKING_MODES.includes(m.thinking)) problems.push(`${id}: thinking must be one of ${THINKING_MODES}`);
    if ('is_reasoning' in m || 'retired' in m) problems.push(`${id}: is_reasoning/retired are replaced by thinking/status`);
    if (m.released !== undefined && !ISO_DATE.test(m.released)) problems.push(`${id}: released must be an ISO date`);
    for (const s of m.sources || []) {
      if (!s.url || !SOURCE_STATUSES.includes(s.status) || !ISO_DATE.test(s.checked_on || '')) {
        problems.push(`${id}: every source needs a url, a status (${SOURCE_STATUSES}) and checked_on`);
      }
    }
    if (m.open_weight && !(m.params && m.params.active_b > 0 && m.params.total_b >= m.params.active_b)) {
      problems.push(`${id}: an open-weight entry needs params.total_b >= params.active_b > 0`);
    }
    if (m.status !== 'current') continue;
    if (!m.released || m.released < CURRENT_FROM) problems.push(`${id}: a current model must be released on or after ${CURRENT_FROM}`);
    if (!(m.sources || []).length) problems.push(`${id}: a current model needs sources`);
    // Benchmark points on a current entry must say which benchmark measured
    // them; otherwise they are invented numbers in fields that mean "measured".
    if (m.performance) {
      const src = m.performance_source;
      if (!src || !src.url || src.status !== 'fetched') {
        problems.push(`${id}: a current model's performance points must cite a fetched benchmark (performance_source)`);
      }
    } else if (!m.estimate) {
      problems.push(`${id}: a current model needs performance points or an estimate block`);
    }
  }
  return problems;
}

const BENCH = {
  short: { input_tokens: 100, output_tokens: 300, energy_wh_mean: 0.5, energy_wh_std: 0.1 },
  medium: { input_tokens: 1000, output_tokens: 1000, energy_wh_mean: 1.5, energy_wh_std: 0.3 },
  long: { input_tokens: 10000, output_tokens: 1500, energy_wh_mean: 3, energy_wh_std: 0.6 }
};

function entry(id, extra = {}) {
  return {
    model_id: id, name: id, provider: 'Test', host: 'AWS', host_key: 'aws',
    status: 'current', released: '2026-09-01', thinking: 'none',
    sources: [{ url: 'https://example.org/model-card', status: 'fetched', checked_on: '2026-10-19' }],
    performance: BENCH,
    performance_source: { url: 'https://example.org/benchmark', status: 'fetched' },
    ...extra
  };
}

function engineWith(models) {
  return new ImpactEngine({ models: { models }, grids });
}

test('models.json follows the schema v3 rules', () => {
  assert.deepStrictEqual(catalogProblems(modelsData), []);
});

test('the schema rules catch each way a current entry can break them', () => {
  const broken = {
    models: [
      entry('pre-2026', { released: '2025-12-31' }),
      entry('no-release', { released: undefined }),
      entry('no-sources', { sources: [] }),
      entry('uncited-points', { performance_source: undefined }),
      entry('search-only-points', { performance_source: { url: 'https://example.org', status: 'search-only' } }),
      entry('nothing-to-estimate', { performance: undefined, performance_source: undefined }),
      entry('bad-source', { sources: [{ url: 'https://example.org' }] }),
      entry('bad-status', { status: 'retired' }),
      entry('old-flag', { is_reasoning: true }),
      entry('open-no-params', { open_weight: true })
    ]
  };
  const problems = catalogProblems(broken);
  for (const m of broken.models) {
    assert.ok(problems.some((p) => p.startsWith(`${m.model_id}:`)), `no problem reported for ${m.model_id}`);
  }
  assert.deepStrictEqual(catalogProblems({ models: [entry('fine')] }), []);
});

test('every reference id still estimates exactly what it did before schema v3', () => {
  const engine = new ImpactEngine({ models: modelsData, grids });
  const ids = modelsData.models.filter((m) => m.status === 'reference').map((m) => m.model_id);
  assert.deepStrictEqual(ids.sort(), Object.keys(referenceSnapshot).sort());
  assert.deepStrictEqual(snapshot(engine, ids), referenceSnapshot);
});

test('listModels returns current models only, unless asked for reference ones', () => {
  const engine = engineWith([entry('new-model'), entry('old-model', { status: 'reference', released: '2025-03-01' })]);
  assert.deepStrictEqual(engine.listModels().map((m) => m.id), ['new-model']);
  assert.deepStrictEqual(engine.listModels({ includeReference: true }).map((m) => m.id), ['new-model', 'old-model']);
  for (const m of engine.listModels()) {
    assert.strictEqual(m.status, 'current');
    assert.ok(m.released >= CURRENT_FROM, `${m.id} released ${m.released}`);
  }
  // The real catalog obeys the same rule, whatever it holds.
  for (const m of new ImpactEngine({ models: modelsData, grids }).listModels()) {
    assert.strictEqual(m.status, 'current');
    assert.ok(m.released >= CURRENT_FROM, `${m.id} released ${m.released}`);
  }
});

test('reference ids stay resolvable for history, share links and comparisons', () => {
  const engine = engineWith([entry('new-model'), entry('old-model', { status: 'reference' })]);
  assert.strictEqual(engine.getModel('old-model').status, 'reference');
  const old = engine.estimateImpact({ modelId: 'old-model', inputTokens: 100, outputTokens: 300 });
  assert.strictEqual(old.model.status, 'reference');
  assert.ok(old.energy.wh > 0);
  // compareModels with no ids compares what listModels lists.
  assert.deepStrictEqual(engine.compareModels({ inputTokens: 100, outputTokens: 300 }).results.map((r) => r.model.id), ['new-model']);
  assert.strictEqual(engine.compareModels({ includeReference: true, inputTokens: 100, outputTokens: 300 }).results.length, 2);
  // Explicit ids are honoured whatever their status.
  assert.strictEqual(engine.compareModels({ modelIds: ['old-model'], inputTokens: 100, outputTokens: 300 }).results.length, 1);
});

test('the engine refuses malformed entries instead of guessing', () => {
  assert.throws(() => engineWith([entry('x', { status: 'retired' })]), /unknown status "retired"/);
  assert.throws(() => engineWith([entry('x', { thinking: 'sometimes' })]), /unknown thinking mode "sometimes"/);
  assert.throws(() => engineWith([entry('x'), entry('x')]), /listed twice/);
  // An id that shadows an Object.prototype name is still just an id.
  assert.strictEqual(engineWith([entry('constructor')]).listModels()[0].id, 'constructor');
  // An unmeasured model's estimate block needs an estimator (PLAN.md Step 2);
  // until there is one, the engine must not invent points to fit.
  assert.throws(
    () => engineWith([entry('x', { performance: undefined, estimate: { method: 'tier', tier: 'frontier' } })]),
    /estimate method "tier", which this engine does not support yet/
  );
});

test('bundles from before schema v3 still load', () => {
  const legacy = entry('legacy', { status: undefined, thinking: undefined, is_reasoning: true });
  const engine = engineWith([legacy, entry('plain', { status: undefined, thinking: undefined })]);
  assert.deepStrictEqual(engine.listModels().map((m) => m.id), ['legacy', 'plain']);
  assert.strictEqual(engine.getModel('legacy').thinking, 'always');
  assert.strictEqual(engine.getModel('legacy').isReasoning, true);
  assert.strictEqual(engine.getModel('plain').thinking, 'none');
  assert.strictEqual(engine.getModel('plain').isReasoning, false);
});

test('thinking drives the reasoning-effort scaling exactly as is_reasoning did', () => {
  const engine = engineWith([entry('thinker', { thinking: 'always' }), entry('plain')]);
  const at = (id, reasoningEffort) =>
    engine.estimateImpact({ modelId: id, inputTokens: 100, outputTokens: 300, options: { reasoningEffort } }).energy.wh;
  assert.ok(at('thinker', 'high') > at('thinker', 'standard'));
  assert.strictEqual(at('plain', 'high'), at('plain', 'standard'));
});
