// EcoPrompt Coach Core — host grids and proxies (PLAN.md Step 4).
// node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { ImpactEngine } = require('../src/calculator');
const modelsData = require('../src/data/models.json');
const grids = require('../src/data/grids.json');
const { gridProblems } = require('../../../scripts/check-catalog');

const NUMBERS = ['pue', 'wue_onsite_l_per_kwh', 'wue_offsite_l_per_kwh', 'cif_kgco2e_per_kwh'];

function withProviders(extra) {
  return { ...grids, providers: { ...grids.providers, ...extra } };
}

test('a proxy host borrows its target\'s figures and says which', () => {
  const engine = new ImpactEngine({ models: modelsData, grids });
  for (const [key, p] of Object.entries(grids.providers)) {
    if (p.proxy_of === undefined) continue;
    const resolved = engine.grids.providers[key];
    for (const n of NUMBERS) assert.strictEqual(resolved[n], grids.providers[p.proxy_of][n], `${key}.${n}`);
    assert.strictEqual(resolved.name, p.name);
    assert.strictEqual(resolved.proxy_of, p.proxy_of);
  }
  // The four Step 4 hosts are proxies until a primary source is read.
  assert.strictEqual(grids.providers.meta.proxy_of, 'aws');
  for (const k of ['moonshot', 'alibaba', 'zai']) assert.strictEqual(grids.providers[k].proxy_of, 'deepseek');
  // The data file itself is not rewritten.
  assert.strictEqual(grids.providers.meta.pue, undefined);
});

test('an estimate on a proxy host reports the proxy', () => {
  const data = JSON.parse(JSON.stringify(modelsData));
  data.models.push({
    model_id: 'kimi-test', name: 'Kimi test', provider: 'Moonshot', host: 'Moonshot AI (China)', host_key: 'moonshot',
    status: 'current', released: '2026-07-26', thinking: 'always', data_source: 'extrapolated',
    params: { total_b: 2800, active_b: 104, precision: 'fp4' }, open_weight: true,
    estimate: { method: 'active-params' },
    sources: [{ fact: 'params, precision, thinking', url: 'https://example.org', status: 'fetched', checked_on: '2026-10-20' }]
  });
  const engine = new ImpactEngine({ models: data, grids });
  const impact = engine.estimateImpact({ modelId: 'kimi-test', inputTokens: 150, outputTokens: 400 });
  assert.strictEqual(impact.factors.hostProxyOf, 'deepseek');
  assert.strictEqual(impact.factors.pue, grids.providers.deepseek.pue);
  const own = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 150, outputTokens: 400 });
  assert.strictEqual(own.factors.hostProxyOf, null);
});

test('the engine refuses a proxy it cannot resolve unambiguously', () => {
  const make = (extra) => () => new ImpactEngine({ models: modelsData, grids: withProviders(extra) });
  assert.throws(make({ x: { name: 'X', proxy_of: 'nowhere' } }), /x is a proxy of "nowhere", which is not a provider/);
  assert.throws(make({ x: { name: 'X', proxy_of: 'meta' } }), /x is a proxy of "meta", which is itself a proxy/);
  assert.throws(make({ x: { name: 'X', proxy_of: 'aws', pue: 1.3 } }), /carries its own pue/);
  assert.throws(make({ x: { name: 'X', proxy_of: 'constructor' } }), /not a provider/);
});

test('every grid entry cites a source or is marked as a proxy', () => {
  assert.deepStrictEqual(gridProblems(grids), []);
  const problems = gridProblems(withProviders({
    bare: { name: 'Bare', pue: 1.1, wue_onsite_l_per_kwh: 0.1, wue_offsite_l_per_kwh: 2, cif_kgco2e_per_kwh: 0.3 },
    quiet_proxy: { name: 'Quiet', proxy_of: 'aws' }
  }));
  assert.deepStrictEqual(problems, [
    'grids.json bare: needs a source, or proxy_of naming the host it borrows from',
    'grids.json quiet_proxy: a proxy must say why in its notes'
  ]);
});
