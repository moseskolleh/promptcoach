// EcoPrompt Coach Core — engine tests (node --test)
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const core = require('../src/index');
const { engine, converters } = core.createDefaultEngine();

test('coefficient fit reproduces the GPT-4o benchmark points', () => {
  const model = engine.getModel('gpt-4o');
  const { eIn, eOut, eFixed } = model.coefficients;
  // All coefficients must be physically sensible (non-negative).
  assert.ok(eIn >= 0 && eOut >= 0 && eFixed >= 0);
  // Output tokens must dominate input tokens (decode is sequential).
  assert.ok(eOut > eIn * 10, 'decode coefficient should dominate prefill');
  // The fitted curve must reproduce the measured bench points (exact solve).
  for (const b of model.bench) {
    const predicted = eFixed + eIn * b.input_tokens + eOut * b.output_tokens;
    const err = Math.abs(predicted - b.energy_wh_mean) / b.energy_wh_mean;
    assert.ok(err < 0.05, `bench point off by ${(err * 100).toFixed(1)}%`);
  }
});

test('all models fit with non-negative, monotonic coefficients', () => {
  for (const { id } of engine.listModels()) {
    const m = engine.getModel(id);
    const c = m.coefficients;
    assert.ok(c.eIn >= 0 && c.eOut >= 0 && c.eFixed >= 0, `${id} has negative coefficient`);
    // More tokens must never reduce energy.
    const small = engine.estimateImpact({ modelId: id, inputTokens: 100, outputTokens: 100 });
    const large = engine.estimateImpact({ modelId: id, inputTokens: 1000, outputTokens: 1000 });
    assert.ok(large.energy.wh >= small.energy.wh, `${id} energy not monotonic`);
  }
});

test('impact math: energy, water, carbon are consistent', () => {
  const impact = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 100, outputTokens: 300 });
  // Short GPT-4o query should be near the measured 0.42 Wh.
  assert.ok(impact.energy.wh > 0.3 && impact.energy.wh < 0.6, `got ${impact.energy.wh} Wh`);
  // Water = E/PUE * WUEsite + E * WUEsource
  const kwh = impact.energy.kwh;
  const expectedWaterL = (kwh / 1.12) * 0.3 + kwh * 2.18;
  assert.ok(Math.abs(impact.water.l - expectedWaterL) < 1e-9);
  // Carbon = E * CIF * embodied (1.15)
  const expectedCarbonKg = kwh * 0.3528 * 1.15;
  assert.ok(Math.abs(impact.carbon.kgCO2e - expectedCarbonKg) < 1e-9);
  // Breakdown sums to total
  const b = impact.energy.breakdown;
  assert.ok(Math.abs(b.fixedWh + b.inputWh + b.outputWh - impact.energy.wh) < 1e-9);
});

test('region override changes carbon only', () => {
  const base = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 500, outputTokens: 500 });
  const nordic = engine.estimateImpact({
    modelId: 'gpt-4o',
    inputTokens: 500,
    outputTokens: 500,
    options: { regionKey: 'europe-north' }
  });
  assert.strictEqual(nordic.energy.wh, base.energy.wh);
  assert.strictEqual(nordic.water.ml, base.water.ml);
  assert.ok(nordic.carbon.gCO2e < base.carbon.gCO2e / 5);
  assert.strictEqual(nordic.factors.cifSource, 'region:europe-north');
});

test('reasoning effort scales decode energy for reasoning models only', () => {
  const std = engine.estimateImpact({ modelId: 'deepseek-r1', inputTokens: 100, outputTokens: 300 });
  const high = engine.estimateImpact({
    modelId: 'deepseek-r1', inputTokens: 100, outputTokens: 300,
    options: { reasoningEffort: 'high' }
  });
  assert.ok(high.energy.wh > std.energy.wh * 1.5);

  const nonReasoning = engine.estimateImpact({
    modelId: 'gpt-4o', inputTokens: 100, outputTokens: 300,
    options: { reasoningEffort: 'high' }
  });
  const nonReasoningStd = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 100, outputTokens: 300 });
  assert.strictEqual(nonReasoning.energy.wh, nonReasoningStd.energy.wh);
});

test('grades: efficient small model beats reasoning giant', () => {
  const flash = engine.estimateImpact({ modelId: 'gemini-2.0-flash', inputTokens: 100, outputTokens: 300 });
  const r1 = engine.estimateImpact({ modelId: 'deepseek-r1', inputTokens: 100, outputTokens: 300 });
  assert.strictEqual(flash.grade.grade, 'A');
  assert.strictEqual(r1.grade.grade, 'E');
  assert.ok(flash.grade.score > r1.grade.score);
});

test('compareModels sorts by energy and computes savings', () => {
  const cmp = engine.compareModels({
    modelIds: ['gpt-4o', 'gemini-2.0-flash', 'deepseek-r1'],
    inputTokens: 100,
    outputTokens: 300
  });
  assert.strictEqual(cmp.recommendation, 'gemini-2.0-flash');
  assert.strictEqual(cmp.worst.model.id, 'deepseek-r1');
  assert.ok(cmp.potentialSavings.percentage > 90);
});

test('converters produce relatable primary text and technical secondary', () => {
  const impact = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 100, outputTokens: 300 });
  const eq = converters.forImpact(impact);
  for (const dim of ['energy', 'water', 'carbon']) {
    assert.ok(eq[dim].primary.length > 5, `${dim} primary missing`);
    assert.ok(/Wh|mL|L|CO/.test(eq[dim].secondary), `${dim} secondary missing unit`);
    // The relatable line must not lead with raw watt-hours.
    assert.ok(!/^[\d.]+ ?k?Wh/.test(eq[dim].primary), `${dim} primary is not relatable: ${eq[dim].primary}`);
  }
});

test('aggregate + forTotals builds a readable weekly sentence', () => {
  const impacts = Array.from({ length: 25 }, () =>
    engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 200, outputTokens: 400 })
  );
  const totals = engine.aggregate(impacts);
  assert.strictEqual(totals.queries, 25);
  const summary = converters.forTotals(totals, 'this week');
  assert.match(summary.sentence, /25 queries this week/);
  assert.match(summary.sentence, /energy of/);
});

test('analyzer: courtesy trimming and token estimation', () => {
  const text = 'Hi! Could you please summarize this report for me? Thanks in advance for your help!';
  const analysis = core.analyzePrompt(text);
  assert.ok(analysis.tokens > 0);
  assert.strictEqual(analysis.taskTypeRaw, 'TEXT_SUMMARIZATION');
  assert.ok(analysis.politeWords.totalTokensSaved >= 4);
  const optimized = core.generateOptimizedPrompt(text);
  assert.ok(!/please|thanks|could you/i.test(optimized), `not trimmed: ${optimized}`);
  assert.ok(/summarize this report/i.test(optimized));
});

test('analyzer: zero-AI alternatives detected', () => {
  const special = core.detectSpecialQueryType('What is the weather forecast for tomorrow?');
  assert.strictEqual(special.type, 'weather');
  assert.strictEqual(core.detectSpecialQueryType('Explain quantum entanglement simply'), null);
});

test('autoDetectModel maps chat hosts', () => {
  assert.strictEqual(core.autoDetectModel('chatgpt.com'), 'gpt-5');
  assert.strictEqual(core.autoDetectModel('claude.ai'), 'claude-4.5-sonnet');
  assert.strictEqual(core.autoDetectModel('gemini.google.com'), 'gemini-2.5-flash');
  assert.strictEqual(core.autoDetectModel('example.com'), null);
});

test('all auto-detect targets exist in the model catalog', () => {
  const ids = new Set(engine.listModels().map((m) => m.id));
  for (const id of ['gpt-5', 'claude-4.5-sonnet', 'gemini-2.5-flash', 'mistral-large', 'deepseek-v3', 'gpt-4o-mini', 'grok-3']) {
    assert.ok(ids.has(id), `missing model: ${id}`);
  }
});
