// The presentation layer (PLAN.md Step 13): one palette, one rounding rule,
// one request builder and one set of tip actions for every surface.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = require('../src/index');
const { BUNDLE, targets } = require('../../../scripts/sync-core.js');

const { engine, converters } = core.createDefaultEngine();
const PROMPT = 'Could you please write a detailed essay on the history of the Roman empire? Thank you so much!';

test('one rounding rule: three significant figures, at most three decimals', () => {
  const cases = [
    [0.0523, '0.052'], [0.9996, '1.00'], [1.234, '1.23'], [9.996, '10.0'],
    [16.66, '16.7'], [99.96, '100'], [123.4, '123'], [0, '0.000']
  ];
  for (const [value, text] of cases) assert.strictEqual(core.figure(value), text, `figure(${value})`);
  assert.strictEqual(core.formatWh(999.4), '999 Wh');
  assert.strictEqual(core.formatWh(999.6), '1.00 kWh');
  assert.strictEqual(core.formatWh(1234), '1.23 kWh');
  assert.strictEqual(core.formatMl(0.42), '0.420 mL');
  assert.strictEqual(core.formatMl(1500), '1.50 L');
  assert.strictEqual(core.formatG(0.2314), '0.231 g CO₂e');
  assert.strictEqual(core.formatG(1234), '1.23 kg CO₂e');
  assert.strictEqual(core.formatCif(0.3528), '353 g CO₂e/kWh');
  assert.strictEqual(core.formatCount(12400.4), '12,400');
});

test('relatable figures carry the same technical numbers as the formatters', () => {
  for (const v of [0.0004, 0.052, 0.9, 1.5, 42, 420, 999.7, 4200]) {
    assert.strictEqual(converters.energy(v).secondary, core.formatWh(v), `energy ${v}`);
    assert.strictEqual(converters.water(v).secondary, core.formatMl(v), `water ${v}`);
    assert.strictEqual(converters.carbon(v).secondary, core.formatG(v), `carbon ${v}`);
  }
  assert.strictEqual(converters.energyRange(0.52, 16.7).secondary, '0.520–16.7 Wh');
  assert.strictEqual(converters.energyRange(0.52, null).secondary, '≥ 0.520 Wh');
});

test('the palette covers exactly the grade bands, and a range is a gradient', () => {
  assert.deepStrictEqual(Object.keys(core.GRADE_COLORS).sort(), core.GRADE_BANDS.map((b) => b.grade).sort());
  assert.deepStrictEqual(Object.keys(core.GRADE_DOTS).sort(), Object.keys(core.GRADE_COLORS).sort());
  assert.strictEqual(core.gradeColor('A'), '#10B981');
  assert.strictEqual(core.gradeColor('Z'), null);
  assert.strictEqual(core.gradeDot(null), '⚪');
  assert.strictEqual(core.gradeBackground(null), null);
  assert.strictEqual(core.gradeBackground({ gradeLow: 'B', gradeHigh: 'B' }), core.GRADE_COLORS.B);
  assert.strictEqual(core.gradeBackground({ gradeLow: 'C', gradeHigh: null }), core.GRADE_COLORS.C);
  assert.strictEqual(
    core.gradeBackground({ gradeLow: 'B', gradeHigh: 'E' }),
    `linear-gradient(135deg, ${core.GRADE_COLORS.B}, ${core.GRADE_COLORS.E})`
  );
});

test('an estimate has one chip text: its method and the note', () => {
  for (const m of engine.listModels()) {
    const d = core.describeImpact(core.quickImpact(engine, m.id));
    assert.strictEqual(d.chipText, d.estimated ? `${d.methodChip} · ${d.note}` : null, m.id);
  }
});

test('impactRequest: the default region, a missing effort and embodied mean the engine defaults', () => {
  const req = core.impactRequest({ modelId: 'claude-opus-5-5', inTokens: 120, outTokens: 400, region: 'default', effort: '' });
  assert.deepStrictEqual(req, {
    modelId: 'claude-opus-5-5',
    inputTokens: 120,
    outputTokens: 400,
    options: {
      taskMultiplier: 1,
      reasoningEffort: undefined,
      thinkingOn: false,
      multiAgent: false,
      regionKey: undefined,
      includeEmbodied: true
    }
  });
  const bare = engine.estimateImpact({ modelId: 'claude-opus-5-5', inputTokens: 120, outputTokens: 400 });
  assert.deepStrictEqual(engine.estimateImpact(req), bare);
  // Every input reaches the engine.
  const full = core.impactRequest({
    modelId: 'gpt-6-astra', inTokens: 50, outTokens: 900, taskMultiplier: 1.4,
    effort: 'high', thinkingOn: true, multiAgent: true, region: 'eu-france', embodied: false
  });
  assert.deepStrictEqual(full.options, {
    taskMultiplier: 1.4,
    reasoningEffort: 'high',
    thinkingOn: true,
    multiAgent: true,
    regionKey: 'eu-france',
    includeEmbodied: false
  });
  assert.strictEqual(core.impactOptions({ taskMultiplier: 'x' }).taskMultiplier, 1);
});

test('quick grades are each model at the quick query, with the surface inputs', () => {
  const models = engine.listModels();
  const grades = core.quickGrades(engine, models, { effort: 'low' });
  assert.deepStrictEqual(Object.keys(grades), models.map((m) => m.id));
  for (const m of models) {
    const impact = engine.estimateImpact({
      modelId: m.id, inputTokens: 100, outputTokens: 300, options: { reasoningEffort: 'low' }
    });
    assert.deepStrictEqual(grades[m.id], core.describeImpact(impact), m.id);
  }
  assert.strictEqual(core.quickGrades(engine, [{ id: 'no-such-model' }])['no-such-model'], null);
});

test('tip actions: trim, an output budget, and a greener model the ranges support', () => {
  const analysis = core.analyzePrompt(PROMPT);
  const ctx = {
    engine,
    modelId: 'claude-opus-5-5',
    inTokens: analysis.tokens,
    outTokens: analysis.outputEstimate.estimated,
    taskMultiplier: analysis.energyMultiplier
  };
  const byKind = Object.fromEntries(analysis.tips.map((t) => [t.kind, core.tipAction(t, ctx)]));

  assert.strictEqual(byKind.polite_words.kind, 'text');
  assert.strictEqual(byKind.polite_words.apply(PROMPT), core.generateOptimizedPrompt(PROMPT));

  assert.strictEqual(byKind.output_budget.kind, 'text');
  assert.strictEqual(byKind.output_budget.apply('Explain tides'), 'Explain tides. Answer in ≤100 words.');
  assert.strictEqual(core.withWordBudget('Explain tides? '), 'Explain tides? Answer in ≤100 words.');
  assert.strictEqual(core.withWordBudget(''), 'Answer in ≤100 words.');

  const sw = byKind.model;
  assert.strictEqual(sw.kind, 'model');
  assert.notStrictEqual(sw.model.sizeClass, 'Nano');
  assert.notStrictEqual(sw.model.id, ctx.modelId);
  assert.strictEqual(sw.claim.claim, 'percent');
  assert.ok(sw.claim.percentage >= core.SWITCH_MIN_PERCENT);
  assert.match(sw.label, new RegExp(`^🔁 Switch to ${sw.model.name} \\((at least \\d+% less|−\\d+%)\\)$`));
  assert.strictEqual(sw.toast, `🔁 Switched to ${sw.model.name} — ${core.savingPhrase(sw.claim)} on this prompt`);

  // The greenest model is offered nothing; advice-only tips have no action.
  const best = core.greenerModel(engine, ctx).model.id;
  assert.strictEqual(core.tipAction({ kind: 'model' }, { ...ctx, modelId: best }), null);
  assert.strictEqual(core.tipAction({ kind: 'model' }), null);
  assert.strictEqual(core.tipAction({ kind: 'something_else' }, ctx), null);
});

test('saving phrases and the change note', () => {
  assert.strictEqual(core.savingPercent({ percentage: 57, atLeast: false }), '57%');
  assert.strictEqual(core.savingPhrase({ percentage: 54, atLeast: true }), 'at least 54% less energy');
  const long = core.analyzePrompt(PROMPT);
  const short = core.analyzePrompt(core.generateOptimizedPrompt(PROMPT));
  const price = (a) => engine.estimateImpact(core.impactRequest({
    modelId: 'claude-haiku-5-5', inTokens: a.tokens, outTokens: 300, taskMultiplier: a.energyMultiplier
  }));
  const before = price(long);
  const after = price(short);
  assert.ok(after.energy.wh < before.energy.wh);
  const pct = Math.round((1 - after.energy.wh / before.energy.wh) * 100);
  assert.ok(core.changeNote(before, after).startsWith(pct > 0 ? ` — ${pct}% less energy` : ''));
  assert.strictEqual(core.changeNote(after, before), '');
  assert.strictEqual(core.changeNote(null, after), '');
});

test('the bundle carries the presentation layer, and its figures work without require', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(targets[0], BUNDLE), 'utf8'), context);
  const Core = context.EcoPromptCore;
  const { converters: conv } = Core.createBundledEngine();
  assert.strictEqual(Core.gradeColor('E'), core.GRADE_COLORS.E);
  assert.strictEqual(conv.energy(16.66).secondary, '16.7 Wh');
  assert.strictEqual(conv.energyRange(0.52, null).secondary, '≥ 0.520 Wh');
  const tip = Core.tipAction({ kind: 'polite_words' }, null);
  assert.strictEqual(tip.apply(PROMPT), core.generateOptimizedPrompt(PROMPT));
});
