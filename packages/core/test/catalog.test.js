// EcoPrompt Coach Core — catalog schema v3 tests (node --test)
//
// Current vs reference entries (PLAN.md Step 1). The data rules below are
// checked against models.json AND against synthetic catalogs that break
// them, so a rule that has nothing to check today still provably bites.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { ImpactEngine } = require('../src/calculator');
const modelsData = require('../src/data/models.json');
const grids = require('../src/data/grids.json');
const { snapshot } = require('./fixtures/make-reference-snapshot');
const referenceSnapshot = require('./fixtures/reference-estimates.json');

const { CURRENT_FROM, catalogProblems, readDenyList, loadDenyList, modelIdsIn } = require('../../../scripts/check-catalog');

const BENCH = {
  short: { input_tokens: 100, output_tokens: 300, energy_wh_mean: 0.5, energy_wh_std: 0.1 },
  medium: { input_tokens: 1000, output_tokens: 1000, energy_wh_mean: 1.5, energy_wh_std: 0.3 },
  long: { input_tokens: 10000, output_tokens: 1500, energy_wh_mean: 3, energy_wh_std: 0.6 }
};

function entry(id, extra = {}) {
  return {
    model_id: id, name: id, provider: 'Test', host: 'AWS', host_key: 'aws',
    status: 'current', released: '2026-09-01', thinking: 'none',
    sources: [{ fact: 'name, released, thinking', url: 'https://example.org/model-card', status: 'fetched', checked_on: '2026-10-19' }],
    performance: BENCH,
    performance_source: { url: 'https://example.org/benchmark', status: 'fetched' },
    ...extra
  };
}

function engineWith(models) {
  return new ImpactEngine({ models: { models }, grids });
}

test('models.json follows the catalog rules', () => {
  assert.deepStrictEqual(catalogProblems(modelsData, { denyList: loadDenyList() }), []);
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
      entry('open-no-params', { open_weight: true }),
      entry('fact-less-source', { sources: [{ url: 'https://example.org', status: 'fetched', checked_on: '2026-10-19' }] }),
      entry('unknown-fact', { sources: [{ fact: 'vibes', url: 'https://example.org', status: 'fetched', checked_on: '2026-10-19' }] })
    ]
  };
  const problems = catalogProblems(broken);
  for (const m of broken.models) {
    assert.ok(problems.some((p) => p.startsWith(`${m.model_id}:`)), `no problem reported for ${m.model_id}`);
  }
  assert.deepStrictEqual(catalogProblems({ models: [entry('fine')] }), []);
});

// PLAN.md Step 9's gates.
const source = (fact, status = 'fetched') =>
  ({ fact, url: `https://example.org/${fact.replace(/\W+/g, '-')}`, status, checked_on: '2026-10-19' });
const estimated = (id, method, sources) => entry(id, {
  performance: undefined, performance_source: undefined,
  estimate: method === 'tier' ? { method, tier: 'frontier' } : { method },
  ...(method === 'active-params' ? { open_weight: true, params: { total_b: 120, active_b: 12, precision: 'fp8' } } : {}),
  sources
});

test('an estimate never rests on search-only facts alone', () => {
  const ok = { models: [
    estimated('tier-ok', 'tier', [source('name, released, thinking'), source('tier')]),
    estimated('open-ok', 'active-params', [source('name, released, params, precision, thinking')])
  ] };
  assert.deepStrictEqual(catalogProblems(ok), []);
  // A lab that publishes no precision: estimated at 16 bits, nothing to source.
  const unstated = estimated('open-unstated', 'active-params', [source('name, released, params, thinking')]);
  delete unstated.params.precision;
  assert.deepStrictEqual(catalogProblems({ models: [unstated] }), []);

  const broken = { models: [
    estimated('tier-search-only', 'tier', [source('name, released, thinking'), source('tier', 'search-only')]),
    estimated('tier-no-thinking', 'tier', [source('name, released, tier'), source('thinking', 'search-only')]),
    estimated('open-search-only', 'active-params', [source('name, released, thinking'), source('params, precision', 'search-only')]),
    estimated('open-no-precision', 'active-params', [source('name, released, params, thinking')])
  ] };
  const problems = catalogProblems(broken);
  assert.strictEqual(problems.length, 4, problems.join('\n'));
  assert.match(problems[0], /^tier-search-only: its tier estimate rests on facts no fetched source supports \(tier\)/);
  assert.match(problems[1], /^tier-no-thinking: .*\(thinking\)/);
  assert.match(problems[2], /^open-search-only: .*\(params, precision\)/);
  assert.match(problems[3], /^open-no-precision: .*\(precision\). Fetch the primary page, or the entry waits$/);
});

test('no current model cites an arXiv id from the RESEARCH-2026 deny-list', () => {
  const denyList = loadDenyList();
  // The list is read from the document itself.
  assert.ok(denyList.length >= 15);
  assert.ok(denyList.includes('2601.22357'));
  assert.throws(() => readDenyList('# no such section'), /section 3.1/);
  assert.throws(() => readDenyList('### 3.1 Do NOT add these citations\n\n```\n```'), /no arXiv ids/);

  const cited = (id, status) => entry(id, {
    status,
    superseded_by: null,
    sources: [source('name, released, thinking'), { ...source('params'), url: 'https://arxiv.org/abs/2601.22357v2' }]
  });
  const problems = catalogProblems({ models: [cited('cites-denied', 'current'), cited('old-cites-denied', 'reference')] }, { denyList });
  assert.deepStrictEqual(problems, [
    'cites-denied: cites arXiv 2601.22357, on the RESEARCH-2026 §3.1 deny-list (never resolved to a document)'
  ]);
  // Citations elsewhere in the entry count too.
  const inNotes = entry('notes-cite', { notes: 'see arXiv:2609.19499' });
  assert.strictEqual(catalogProblems({ models: [inNotes] }, { denyList }).length, 1);
});

test('every superseded_by chain ends at a current model or an explicit null', () => {
  const ref = (id, extra = {}) => entry(id, { status: 'reference', released: '2025-03-01', ...extra });
  const ok = { models: [
    entry('new'),
    ref('old', { superseded_by: 'older-but-renamed' }),
    ref('older-but-renamed', { superseded_by: 'new' }),
    ref('history-only', { superseded_by: null }),
    entry('also-new', { superseded_by: null })
  ] };
  assert.deepStrictEqual(catalogProblems(ok), []);

  const broken = { models: [
    entry('new'),
    ref('to-nowhere', { superseded_by: 'gone' }),
    ref('loop-a', { superseded_by: 'loop-b' }),
    ref('loop-b', { superseded_by: 'loop-a' }),
    ref('to-unmarked', { superseded_by: 'unmarked' }),
    ref('unmarked'),
    entry('current-but-superseded', { superseded_by: 'new' })
  ] };
  const problems = catalogProblems(broken);
  const of = (id) => problems.filter((p) => p.startsWith(`${id}:`));
  assert.match(of('to-nowhere')[0], /chain reaches "gone", which is not in the catalog/);
  assert.match(of('loop-a')[0], /loops back to "loop-a"/);
  assert.match(of('loop-b')[0], /loops back to "loop-b"/);
  assert.match(of('to-unmarked')[0], /stops at reference "unmarked", which has no superseded_by/);
  assert.match(of('unmarked')[0], /a reference entry needs superseded_by/);
  assert.match(of('current-but-superseded')[0], /a current model is not superseded/);
  assert.deepStrictEqual(of('new'), []);

  // Before any current model exists, reference entries need not say yet.
  assert.deepStrictEqual(catalogProblems({ models: [ref('lonely')] }), []);
});

test('the apps check finds hard-coded model ids, and only those', () => {
  const code = [
    "let modelId = 'gpt-6-sol';",
    "if (host === 'claude.ai') pick(\"o4-mini\");",
    "$('model-select'); el('span', 'grade-pill'); const q = 'o3';",
    "const open = `muse-spark-open`; const family = 'gpt';"
  ].join('\n');
  assert.deepStrictEqual(modelIdsIn(code), [
    { id: 'gpt-6-sol', line: 1 },
    { id: 'o4-mini', line: 2 },
    { id: 'o3', line: 3 },
    { id: 'muse-spark-open', line: 4 }
  ]);
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
  // Benchmark points and an estimate block on one entry would leave it
  // unclear which numbers the model shows.
  assert.throws(
    () => engineWith([entry('x', { estimate: { method: 'tier', tier: 'frontier' } })]),
    /both performance points and an estimate block/
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
