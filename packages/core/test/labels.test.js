// EcoPrompt Coach Core — honest labels for estimates (PLAN.md Step 8).
// node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  ImpactEngine, createConverters, describeImpact, savingClaim, formatWh, formatWhRange, METHOD_CHIPS
} = require('../src/index');
const modelsData = require('../src/data/models.json');
const grids = require('../src/data/grids.json');
const equivalents = require('../src/data/equivalents.json');

function current(id, extra) {
  return {
    model_id: id, name: id, provider: 'Test', host: 'AWS', host_key: 'aws',
    status: 'current', released: '2026-09-01', data_source: 'extrapolated',
    sources: [{ url: 'https://example.org/card', status: 'fetched', checked_on: '2026-10-19' }],
    ...extra
  };
}

const data = JSON.parse(JSON.stringify(modelsData));
data.models.push(
  current('always', { thinking: 'always', estimate: { method: 'tier', tier: 'frontier' } }),
  current('adaptive', { thinking: 'adaptive', estimate: { method: 'tier', tier: 'frontier' } }),
  current('plain', { thinking: 'none', estimate: { method: 'tier', tier: 'frontier' } }),
  current('small', { thinking: 'none', estimate: { method: 'tier', tier: 'small' } }),
  current('open', { thinking: 'none', params: { total_b: 120, active_b: 12, precision: 'fp8' }, estimate: { method: 'active-params' } }),
  current('open-thinks', { thinking: 'always', params: { total_b: 320, active_b: 18, precision: 'fp8' }, estimate: { method: 'active-params' } })
);
const engine = new ImpactEngine({ models: data, grids });
const conv = createConverters(equivalents);
const ESTIMATED = ['always', 'adaptive', 'plain', 'small', 'open', 'open-thinks'];
const SHAPES = [[100, 300], [150, 400], [1000, 1000], [10000, 1500]];
const at = (modelId, inputTokens = 150, outputTokens = 400, options = {}) =>
  engine.estimateImpact({ modelId, inputTokens, outputTokens, options });

test('a measured or benchmarked model keeps its single number and grade', () => {
  for (const { id } of engine.listModels({ includeReference: true }).filter((m) => m.status === 'reference')) {
    const impact = at(id);
    const d = describeImpact(impact);
    assert.strictEqual(d.estimated, false, id);
    assert.strictEqual(d.methodChip, null, id);
    assert.strictEqual(d.note, null, id);
    assert.strictEqual(d.gradeText, impact.grade.grade, id);
    assert.strictEqual(d.whText, formatWh(impact.energy.wh), id);
    // Its relatable text is exactly what it was before ranges existed.
    assert.deepStrictEqual(conv.forImpact(impact), {
      energy: conv.energy(impact.energy.wh),
      water: conv.water(impact.water.ml),
      carbon: conv.carbon(impact.carbon.gCO2e)
    }, id);
  }
});

test('every estimate shows its range, its method and "likely high"', () => {
  for (const id of ESTIMATED) {
    for (const [tIn, tOut] of SHAPES) {
      const impact = at(id, tIn, tOut);
      const d = describeImpact(impact);
      const label = `${id} ${tIn}/${tOut}`;
      assert.strictEqual(d.estimated, true, label);
      assert.strictEqual(d.methodChip, METHOD_CHIPS[impact.estimate.method], label);
      assert.strictEqual(d.note, 'likely high', label);
      assert.ok(d.noteReason, label);
      assert.strictEqual(d.rangeText, formatWhRange(impact.energy.range.lowWh, impact.energy.range.highWh), label);
      // A model that thinks shows the range as its figure, never a point.
      if (d.rangeOnly) assert.strictEqual(d.whText, d.rangeText, label);
      else assert.strictEqual(d.whText, formatWh(impact.energy.wh), label);
      // The technical figure on every dimension is the range.
      const rel = conv.forImpact(impact);
      assert.strictEqual(rel.energy.secondary,
        conv.energyRange(impact.energy.range.lowWh, impact.energy.range.highWh).secondary, label);
      for (const dim of ['energy', 'water', 'carbon']) {
        if (d.rangeOnly) assert.ok(!/^about /.test(rel[dim].primary), `${label} ${dim}: ${rel[dim].primary}`);
        else assert.ok(/^about /.test(rel[dim].primary), `${label} ${dim}: ${rel[dim].primary}`);
      }
    }
  }
  assert.strictEqual(METHOD_CHIPS.tier, 'estimated · tier');
  assert.strictEqual(METHOD_CHIPS['active-params'], 'estimated · from parameters');
});

test('the grade is a range whenever the energy range crosses a band', () => {
  for (const id of ESTIMATED) {
    for (const [tIn, tOut] of SHAPES) {
      const impact = at(id, tIn, tOut);
      const d = describeImpact(impact);
      const lo = engine.gradeFor(impact.energy.range.lowWh).grade;
      const hi = engine.gradeFor(impact.energy.range.highWh).grade;
      assert.strictEqual(d.gradeLow, lo);
      assert.strictEqual(d.gradeHigh, hi);
      assert.strictEqual(d.gradeText, lo === hi ? lo : `${lo}–${hi}`, `${id} ${tIn}/${tOut}`);
    }
  }
  // At 150/400 a frontier model that may or may not think spans B to E.
  assert.strictEqual(describeImpact(at('adaptive')).gradeText, 'B–E');
  assert.strictEqual(describeImpact(at('adaptive')).gradeLabel, 'Eco-grade B to E');
});

test('a floor reads "at least", with no high end', () => {
  const impact = at('always', 150, 400, { multiAgent: true });
  const d = describeImpact(impact);
  assert.strictEqual(d.floor, true);
  assert.strictEqual(d.highWh, null);
  assert.strictEqual(d.gradeHigh, null);
  assert.strictEqual(d.gradeText, `≥ ${d.gradeLow}`);
  assert.strictEqual(d.gradeLabel, `Eco-grade ${d.gradeLow} or worse`);
  assert.match(d.whText, /^≥ /);
  const rel = conv.forImpact(impact);
  for (const dim of ['energy', 'water', 'carbon']) {
    assert.match(rel[dim].primary, /^at least /, dim);
    assert.match(rel[dim].secondary, /^≥ /, dim);
  }
});

test('ranges read in one everyday unit when one fits, and never in fractions of a thing', () => {
  assert.strictEqual(conv.energyRange(8.93, 16.7).primary, '6.9–12.8 minutes of video streaming');
  assert.strictEqual(conv.energyRange(0.05, 0.2).primary, '18–72 seconds of an LED bulb');
  // Too wide for one unit: both ends in their own.
  assert.match(conv.energyRange(2, 2000).primary, /^between .+ and .+$/);
  // Ends that read the same are one figure.
  assert.strictEqual(conv.waterRange(7, 7.01).primary, conv.water(7).primary);
  const awkward = /^0(?:\.\d+)?\s|\b0\.\d+[ –]/;
  for (const id of ESTIMATED) {
    for (const [tIn, tOut] of SHAPES) {
      for (const options of [{}, { multiAgent: true }, { reasoningEffort: 'max' }]) {
        const rel = conv.forImpact(at(id, tIn, tOut, options));
        for (const dim of ['energy', 'water', 'carbon']) {
          assert.ok(!awkward.test(rel[dim].primary), `${id} ${tIn}/${tOut} ${dim}: ${rel[dim].primary}`);
          assert.ok(!/about (under|less than)/.test(rel[dim].primary), rel[dim].primary);
        }
      }
    }
  }
});

test('forImpact can repeat the same query', () => {
  const ref = at('gpt-4o');
  assert.deepStrictEqual(conv.forImpact(ref, 25).energy, conv.energy(ref.energy.wh * 25));
  const est = at('adaptive');
  assert.deepStrictEqual(conv.forImpact(est, 25).energy,
    conv.energyRange(est.energy.range.lowWh * 25, est.energy.range.highWh * 25));
  const floor = at('always', 150, 400, { multiAgent: true });
  assert.match(conv.forImpact(floor, 25).water.secondary, /^≥ /);
  assert.deepStrictEqual(conv.forImpact(est, 0), conv.forImpact(est));
});

test('Wh ranges share their unit', () => {
  assert.strictEqual(formatWhRange(0.522, 16.7), '0.522–16.7 Wh');
  assert.strictEqual(formatWhRange(8.93, null), '≥ 8.93 Wh');
  assert.strictEqual(formatWhRange(1.234, 1.2341), '1.23 Wh');
  assert.strictEqual(formatWhRange(850, 1200), '850.0 Wh – 1.20 kWh');
});

test('a saving is a percentage only when the ranges do not overlap', () => {
  // Two benchmarked models: the same percentage compareModels gives.
  const cmp = engine.compareModels({ modelIds: ['gpt-4o-mini', 'gpt-4o'], inputTokens: 150, outputTokens: 400 });
  assert.deepStrictEqual(savingClaim(cmp.best, cmp.worst),
    { claim: 'percent', percentage: cmp.potentialSavings.percentage, atLeast: false, energyWh: cmp.potentialSavings.energyWh });
  assert.strictEqual(savingClaim(cmp.worst, cmp.best), null);

  // Disjoint ranges: at least the gap between the near ends.
  const plain = at('plain');
  const always = at('always');
  const claim = savingClaim(plain, always);
  assert.strictEqual(claim.claim, 'percent');
  assert.strictEqual(claim.atLeast, true);
  assert.ok(claim.percentage > 0 && claim.percentage <= Math.round((1 - plain.energy.range.highWh / always.energy.range.lowWh) * 100));

  // Overlapping ranges: "probably", never a number.
  const overlap = savingClaim(plain, at('adaptive'));
  assert.deepStrictEqual(overlap, { claim: 'probably', percentage: null, atLeast: false, energyWh: null });

  // A floor has no high end, so it never claims to be less.
  assert.strictEqual(savingClaim(at('always', 150, 400, { multiAgent: true }), at('adaptive', 150, 400, { reasoningEffort: 'max' })), null);
  // Against a floor, a model can be certainly less.
  assert.strictEqual(savingClaim(plain, at('always', 150, 400, { multiAgent: true })).atLeast, true);
});

test('totals that include an estimate are a range; one floor makes them a floor', () => {
  const ref = at('gpt-4o');
  const est = at('adaptive');
  // Measured only: no range, the same shape as before.
  assert.strictEqual(engine.aggregate([ref, ref]).range, undefined);

  const totals = engine.aggregate([ref, est]);
  assert.strictEqual(totals.energyWh, ref.energy.wh + est.energy.wh);
  assert.ok(Math.abs(totals.range.lowWh - (ref.energy.wh + est.energy.range.lowWh)) < 1e-12);
  assert.ok(Math.abs(totals.range.highWh - (ref.energy.wh + est.energy.range.highWh)) < 1e-12);
  assert.ok(Math.abs(totals.range.highMl - (ref.water.ml + est.water.range.highMl)) < 1e-9);
  assert.ok(Math.abs(totals.range.lowG - (ref.carbon.gCO2e + est.carbon.range.lowG)) < 1e-9);

  // Stored history records carry lowWh/highWh and sum the same way.
  const record = (i) => ({
    energyWh: i.energy.wh, waterMl: i.water.ml, carbonG: i.carbon.gCO2e,
    ...(i.energy.range ? { lowWh: i.energy.range.lowWh, highWh: i.energy.range.highWh } : {})
  });
  const fromHistory = engine.aggregate([record(ref), record(est)]);
  for (const key of Object.keys(totals.range)) {
    assert.ok(Math.abs(fromHistory.range[key] - totals.range[key]) < 1e-9, key);
  }

  const withFloor = engine.aggregate([ref, est, at('always', 150, 400, { multiAgent: true })]);
  assert.strictEqual(withFloor.range.highWh, null);
  assert.strictEqual(withFloor.range.highMl, null);
  assert.strictEqual(withFloor.range.highG, null);
  const summary = conv.forTotals(withFloor, 'this week');
  assert.match(summary.energy.primary, /^at least /);
  assert.match(summary.sentence, /3 queries this week used the energy of at least /);

  const ranged = conv.forTotals(totals, 'today');
  assert.strictEqual(ranged.energy.secondary, conv.energyRange(totals.range.lowWh, totals.range.highWh).secondary);
});
