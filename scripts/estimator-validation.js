#!/usr/bin/env node
// Leave-one-out checks of the two estimators against the reference catalog
// (PLAN.md Step 2). Prints the tables quoted in docs/METHODOLOGY.md §2.5.
//
//   1. active-params: calibrate on one measured open-weight entry, predict
//      the other; and price DeepSeek-R1's plain answer.
//   2. tier: predict each tier member from the others; is it inside the range?
//   3. thinking: predict each piece of thinking evidence from the other.
//
// Run:  node scripts/estimator-validation.js
'use strict';

const path = require('node:path');
const { ImpactEngine } = require(path.join(__dirname, '..', 'packages', 'core', 'src', 'calculator'));
const models = require(path.join(__dirname, '..', 'packages', 'core', 'src', 'data', 'models.json'));
const grids = require(path.join(__dirname, '..', 'packages', 'core', 'src', 'data', 'grids.json'));

const SHAPES = [[100, 300], [1000, 1000], [10000, 1500]];
const clone = () => JSON.parse(JSON.stringify(models));
const byId = (data, id) => data.models.find((m) => m.model_id === id);
const fmt = (wh) => (wh >= 10 ? wh.toFixed(1) : wh.toFixed(2));
const pct = (pred, actual) => `${pred >= actual ? '+' : ''}${Math.round((pred / actual - 1) * 100)}%`;

/** An estimated copy of `src`, with the source entry's evidence role removed. */
function estimatedTwin(data, src, estimate, extra = {}) {
  data.models.push({
    model_id: `${src.model_id}~est`,
    name: src.name,
    provider: src.provider,
    host: src.host,
    host_key: src.host_key,
    status: 'reference',
    thinking: src.thinking,
    params: src.params,
    estimate,
    ...extra
  });
  return `${src.model_id}~est`;
}

function measured(id, i, o) {
  return new ImpactEngine({ models, grids }).estimateImpact({ modelId: id, inputTokens: i, outputTokens: o }).energy.wh;
}

console.log('## 1. active-params: leave one calibration entry out\n');
// A single calibration entry has no spread, so each held-out prediction is
// tested against the band the shipped engine uses (from both entries).
const shipped = new ImpactEngine({ models, grids }).evidence.calibration;
const bandLow = shipped.kLow / shipped.kHigh;
const bandHigh = shipped.kHigh / shipped.kLow;
console.log(`Shipped band: x${bandLow.toFixed(2)}–x${bandHigh.toFixed(2)} around the estimate.\n`);
console.log('| Predicted | Calibrated on | Shape | Fitted | Predicted | Error | Within the shipped band |');
console.log('|---|---|---|---|---|---|---|');
const calibrators = ['llama-3.2-1b', 'llama-3.3-70b'];
for (const target of calibrators) {
  const data = clone();
  const src = byId(data, target);
  src.data_source = 'extrapolated'; // no longer calibrates
  const twin = estimatedTwin(data, src, { method: 'active-params' });
  const e = new ImpactEngine({ models: data, grids });
  for (const [i, o] of SHAPES) {
    const r = e.estimateImpact({ modelId: twin, inputTokens: i, outputTokens: o });
    const actual = measured(target, i, o);
    const inside = actual >= r.energy.wh * bandLow && actual <= r.energy.wh * bandHigh;
    console.log(`| ${target} | ${calibrators.find((c) => c !== target)} | ${i}/${o} | ${fmt(actual)} Wh | ${fmt(r.energy.wh)} Wh | ${pct(r.energy.wh, actual)} | ${inside ? 'yes' : '**no**'} |`);
  }
}

console.log('\n## 2. tier: leave each member out\n');
console.log('| Tier | Members inside the others\' range at 100/300 | at 1000/1000 | at 10000/1500 | Worst error at centre |');
console.log('|---|---|---|---|---|');
for (const tier of ['small', 'frontier']) {
  const members = models.models.filter((m) => m.tier === tier);
  const inside = SHAPES.map(() => 0);
  let worst = 0;
  for (const target of members) {
    const data = clone();
    const src = byId(data, target.model_id);
    delete src.tier;
    const twin = estimatedTwin(data, src, { method: 'tier', tier }, { thinking: 'none', params: undefined });
    const e = new ImpactEngine({ models: data, grids });
    SHAPES.forEach(([i, o], k) => {
      const r = e.estimateImpact({ modelId: twin, inputTokens: i, outputTokens: o });
      const actual = measured(target.model_id, i, o);
      if (actual >= r.energy.range.lowWh && actual <= r.energy.range.highWh) inside[k] += 1;
      worst = Math.max(worst, Math.abs(r.energy.wh / actual - 1));
    });
  }
  console.log(`| ${tier} | ${inside[0]}/${members.length} | ${inside[1]}/${members.length} | ${inside[2]}/${members.length} | ±${Math.round(worst * 100)}% |`);
}

console.log('\n## 3. thinking: predict each piece of evidence from the other\n');
console.log('| Predicted | From | Shape | Benchmark | Predicted range | Inside range |');
console.log('|---|---|---|---|---|---|');
{
  // DeepSeek-R1 from the GPT-5 pair alone: R1 stops being evidence.
  const data = clone();
  const r1 = byId(data, 'deepseek-r1');
  r1.data_source = 'benchmarked';
  const twin = estimatedTwin(data, r1, { method: 'active-params' });
  const e = new ImpactEngine({ models: data, grids });
  for (const [i, o] of SHAPES) {
    const r = e.estimateImpact({ modelId: twin, inputTokens: i, outputTokens: o });
    const actual = measured('deepseek-r1', i, o);
    const ok = actual >= r.energy.range.lowWh && actual <= r.energy.range.highWh;
    console.log(`| DeepSeek-R1 (measured) | GPT-5 pair | ${i}/${o} | ${fmt(actual)} Wh | ${fmt(r.energy.range.lowWh)}–${fmt(r.energy.range.highWh)} | ${ok ? 'yes' : '**no**'} |`);
  }
}
{
  // GPT-5 Thinking from DeepSeek-R1 alone, as a frontier-tier model that always thinks.
  const data = clone();
  const gt = byId(data, 'gpt-5-thinking');
  delete gt.thinking_pair_of;
  const twin = estimatedTwin(data, gt, { method: 'tier', tier: 'frontier' }, { params: undefined });
  const e = new ImpactEngine({ models: data, grids });
  for (const [i, o] of SHAPES) {
    const r = e.estimateImpact({ modelId: twin, inputTokens: i, outputTokens: o });
    const actual = measured('gpt-5-thinking', i, o);
    const ok = actual >= r.energy.range.lowWh && actual <= r.energy.range.highWh;
    console.log(`| GPT-5 Thinking (extrapolated) | DeepSeek-R1 | ${i}/${o} | ${fmt(actual)} Wh | ${fmt(r.energy.range.lowWh)}–${fmt(r.energy.range.highWh)} | ${ok ? 'yes' : '**no**'} |`);
  }
}
