// EcoPrompt Coach Core — one engine bootstrap (PLAN.md Step 13).
// node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = require('../src/index');
const { ImpactEngine, precompute, ENGINE_STATS } = require('../src/calculator');
const precomputed = require('../src/data/precomputed.json');
const { models, grids, equivalents } = core.data;

const SHAPES = [
  [150, 400, {}],
  [2000, 800, { reasoningEffort: 'xhigh' }],
  [30, 5000, { multiAgent: true }],
  [60000, 100, { thinkingOn: true, reasoningEffort: 'high', regionKey: 'nl' }]
];

/** Every model at every shape, from two engines: the same numbers, to the bit. */
function assertSameEstimates(a, b) {
  for (const m of a.listModels({ includeReference: true })) {
    for (const [tIn, tOut, options] of SHAPES) {
      const q = { modelId: m.id, inputTokens: tIn, outputTokens: tOut, options };
      assert.deepStrictEqual(b.estimateImpact(q), a.estimateImpact(q), `${m.id} ${tIn}/${tOut}`);
    }
  }
}

test('the precomputed coefficients are a fresh fit of the catalog', () => {
  const fresh = new ImpactEngine({ models, grids });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(precompute(fresh))), precomputed);
});

test('an engine from the precomputed coefficients starts with no fit and estimates the same', () => {
  const before = { ...ENGINE_STATS };
  const { engine } = core.createDefaultEngine();
  assert.strictEqual(ENGINE_STATS.fits - before.fits, 0, 'fits at start-up');
  assert.strictEqual(ENGINE_STATS.estimates - before.estimates, 0, 'estimates at start-up');
  assertSameEstimates(new ImpactEngine({ models, grids, equivalents }), engine);
});

test('precomputed coefficients for another catalog are ignored, and the engine fits', () => {
  const extra = JSON.parse(JSON.stringify(models));
  const copy = JSON.parse(JSON.stringify(extra.models.find((m) => m.model_id === 'gpt-4o')));
  extra.models.push({ ...copy, model_id: 'gpt-4o-copy', superseded_by: 'gpt-6.1-sol' });
  const missingMember = JSON.parse(JSON.stringify(precomputed));
  const tiered = Object.values(missingMember.models).find((p) => p.estimate && p.estimate.members);
  tiered.estimate.members.push('no-such-model');
  for (const [catalog, pre, why] of [
    [extra, precomputed, 'a model the precomputed data lacks'],
    [models, missingMember, 'a tier member that is not in the catalog'],
    [models, { ...precomputed, v: 99 }, 'another version'],
    [models, null, 'none at all']
  ]) {
    const before = ENGINE_STATS.fits;
    const engine = new ImpactEngine({ models: catalog, grids, precomputed: pre });
    assert.ok(ENGINE_STATS.fits > before, why);
    assert.ok(engine.estimateImpact({ modelId: 'gpt-6-luna', inputTokens: 100, outputTokens: 300 }), why);
  }
});

test('each app\'s bundle carries the engine, the data and the coefficients', () => {
  const file = path.join(__dirname, '..', '..', '..', 'apps', 'web', 'vendor', 'core.bundle.js');
  const context = vm.createContext({});
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const Core = context.EcoPromptCore;
  for (const name of ['ImpactEngine', 'analyzePrompt', 'createConverters', 'describeImpact', 'createBundledEngine']) {
    assert.strictEqual(typeof Core[name], 'function', name);
  }
  const before = { ...Core.ENGINE_STATS };
  const { engine, converters } = Core.createBundledEngine();
  assert.strictEqual(Core.ENGINE_STATS.fits - before.fits, 0);
  assert.strictEqual(Core.ENGINE_STATS.estimates - before.estimates, 0);
  assert.strictEqual(typeof converters.energy, 'function');
  // The bundle's engine gives the Node engine's numbers.
  const q = { modelId: 'claude-opus-5-5', inputTokens: 150, outputTokens: 400 };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(engine.estimateImpact(q))),
    JSON.parse(JSON.stringify(core.createDefaultEngine().engine.estimateImpact(q))));
});
