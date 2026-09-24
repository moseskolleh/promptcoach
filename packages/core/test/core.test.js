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

test('analyzer: explicit output budget lowers the estimate and flips the tip', () => {
  const budgeted = core.analyzePrompt(
    'Explain how photosynthesis works. Answer in 50 words or less, bullet points only.'
  );
  const free = core.analyzePrompt('Explain how photosynthesis works.');
  assert.ok(budgeted.outputBudget, 'budget not detected');
  assert.strictEqual(budgeted.outputBudget.kind, 'words');
  // 50 words ≈ 67 tokens — far below the unconstrained estimate.
  assert.ok(budgeted.outputEstimate.estimated < free.outputEstimate.estimated * 0.5);
  // Following the coach's advice replaces the nag with an acknowledgment.
  assert.ok(budgeted.tips.some((t) => t.kind === 'output_budget_ok'));
  assert.ok(!budgeted.tips.some((t) => t.kind === 'output_budget'));
  assert.ok(free.tips.some((t) => t.kind === 'output_budget'));
  assert.strictEqual(free.outputBudget, null);
});

test('analyzer: output budget forms — sentences, yes/no, soft brevity', () => {
  const sentence = core.detectOutputBudget('Describe quantum computing in one sentence');
  assert.strictEqual(sentence.kind, 'sentence');
  assert.ok(sentence.capTokens <= 30);
  assert.strictEqual(core.detectOutputBudget('Is Rust memory safe? Just yes or no').kind, 'yes_no');
  const soft = core.detectOutputBudget('Summarize the main plot points briefly');
  assert.strictEqual(soft.kind, 'style');
  assert.ok(soft.factor < 1);
  assert.strictEqual(core.detectOutputBudget('Write an essay about the history of Rome'), null);
  // Budget phrases inside quoted payload don't count.
  assert.strictEqual(core.detectOutputBudget('Translate "answer in 50 words" into German'), null);
});

test('optimizer preserves quoted text and code blocks', () => {
  const quoted = core.generateOptimizedPrompt(
    'Could you translate "thank you so much for your help" into Japanese, please?'
  );
  assert.ok(quoted.includes('"thank you so much for your help"'), quoted);
  assert.ok(!/^could you/i.test(quoted));
  assert.ok(!/please/i.test(quoted.replace(/"[^"]*"/g, '')));

  const code = core.generateOptimizedPrompt(
    'Please fix this: ```js\nconsole.log("please wait");\n``` thanks!'
  );
  assert.ok(code.includes('console.log("please wait");'), code);

  const single = core.generateOptimizedPrompt("Define the word 'please' and explain its etymology");
  assert.ok(single.includes("'please'"), single);

  // Courtesy words inside quotes aren't counted as trimmable either.
  assert.strictEqual(core.detectPoliteWords('Translate "thank you so much" into French').totalTokensSaved, 0);
});

test('zero-AI tip suppressed when the user clearly wants generated content', () => {
  const poem = core.analyzePrompt('Write a poem about the weather in Paris');
  assert.ok(!poem.tips.some((t) => t.kind === 'special_query'), 'poem should not trigger weather-app tip');
  const weather = core.analyzePrompt('What is the weather forecast for tomorrow?');
  assert.ok(weather.tips.some((t) => t.kind === 'special_query'));
});

test('analyzer: zero-AI alternatives detected', () => {
  const special = core.detectSpecialQueryType('What is the weather forecast for tomorrow?');
  assert.strictEqual(special.type, 'weather');
  assert.strictEqual(core.detectSpecialQueryType('Explain quantum entanglement simply'), null);
});

test('autoDetectModel maps chat hosts', () => {
  assert.strictEqual(core.autoDetectModel('chatgpt.com'), 'gpt-5');
  assert.strictEqual(core.autoDetectModel('claude.ai'), 'claude-sonnet-5');
  assert.strictEqual(core.autoDetectModel('gemini.google.com'), 'gemini-2.5-flash');
  assert.strictEqual(core.autoDetectModel('example.com'), null);
});

test('vendored copies in the apps match core exactly (run scripts/sync-core.js)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const coreSrc = path.join(__dirname, '..', 'src');
  const apps = ['extension', 'web'];
  const scripts = fs.readdirSync(coreSrc).filter((f) => f.endsWith('.js') && f !== 'index.js');
  const dataFiles = fs.readdirSync(path.join(coreSrc, 'data')).filter((f) => f.endsWith('.json'));
  for (const app of apps) {
    const vendor = path.join(__dirname, '..', '..', '..', 'apps', app, 'vendor');
    for (const f of scripts) {
      assert.strictEqual(
        fs.readFileSync(path.join(vendor, f), 'utf8'),
        fs.readFileSync(path.join(coreSrc, f), 'utf8'),
        `apps/${app}/vendor/${f} is stale — run node scripts/sync-core.js`
      );
    }
    for (const f of dataFiles) {
      assert.strictEqual(
        fs.readFileSync(path.join(vendor, 'data', f), 'utf8'),
        fs.readFileSync(path.join(coreSrc, 'data', f), 'utf8'),
        `apps/${app}/vendor/data/${f} is stale — run node scripts/sync-core.js`
      );
    }
  }
});

test('all auto-detect targets exist in the model catalog', () => {
  const ids = new Set(engine.listModels().map((m) => m.id));
  for (const id of ['gpt-5', 'claude-4.5-sonnet', 'gemini-2.5-flash', 'mistral-large', 'deepseek-v3', 'gpt-4o-mini', 'grok-3']) {
    assert.ok(ids.has(id), `missing model: ${id}`);
  }
});

test('every model reproduces its own benchmark points (non-negative least squares)', () => {
  for (const { id } of engine.listModels()) {
    const m = engine.getModel(id);
    const { eIn, eOut, eFixed } = m.coefficients;
    for (const b of m.bench) {
      const predicted = eFixed + eIn * b.input_tokens + eOut * b.output_tokens;
      const err = Math.abs(predicted - b.energy_wh_mean) / b.energy_wh_mean;
      assert.ok(err < 0.05, `${id} ${b.input_tokens}/${b.output_tokens}: fit off by ${(err * 100).toFixed(1)}%`);
    }
  }
});

test('relatable labels never show fractional sub-unit counts', () => {
  const awkward = /^0(?:\.\d+)?\s|\b0\.\d+ /;
  for (const { id } of engine.listModels()) {
    for (const [inputTokens, outputTokens] of [[100, 300], [1000, 1000], [10000, 1500]]) {
      const rel = converters.forImpact(engine.estimateImpact({ modelId: id, inputTokens, outputTokens }));
      for (const dim of ['energy', 'water', 'carbon']) {
        assert.ok(!awkward.test(rel[dim].primary), `${id} ${dim}: ${rel[dim].primary}`);
      }
    }
  }
  for (const v of [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000]) {
    for (const fn of ['energy', 'water', 'carbon']) {
      assert.ok(!awkward.test(converters[fn](v).primary), `${fn}(${v}): ${converters[fn](v).primary}`);
    }
  }
  assert.strictEqual(converters.water(0.02).primary, 'less than a drop of water');
});

test('extrapolation is flagged per axis and the confidence band widens', () => {
  const inRange = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 100, outputTokens: 300 });
  const longOut = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 0, outputTokens: 8000 });
  const longIn = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 11000, outputTokens: 500 });
  assert.strictEqual(inRange.energy.extrapolated, false);
  assert.strictEqual(longOut.energy.extrapolated, true);
  assert.strictEqual(longIn.energy.extrapolated, true);
  const band = (i) => (i.energy.confidence.maxWh - i.energy.wh) / i.energy.wh;
  assert.ok(Math.abs(band(longOut) - 2 * band(inRange)) < 1e-9);
});

test('compareModels never rounds a real saving up to 100%, and [] means no models', () => {
  const all = engine.compareModels({ inputTokens: 100, outputTokens: 300 });
  assert.ok(all.potentialSavings.percentage <= 99);
  assert.ok(all.potentialSavings.ratio > 0.99);
  assert.strictEqual(engine.compareModels({ modelIds: [], inputTokens: 100, outputTokens: 300 }).results.length, 0);
  assert.strictEqual(engine.compareModels({ modelIds: ['gpt-4o', 'gpt-4o'], inputTokens: 100, outputTokens: 300 }).results.length, 1);
});

test('engine inputs are coerced safely', () => {
  const inf = engine.estimateImpact({ modelId: 'o4-mini', inputTokens: Infinity, outputTokens: 1 });
  assert.ok(Number.isFinite(inf.energy.wh));
  assert.strictEqual(engine.gradeFor(NaN).grade, 'A');
  assert.strictEqual(engine.gradeFor('abc').grade, 'A');
  const zero = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 100, outputTokens: 300, options: { taskMultiplier: 0 } });
  const neg = engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: 100, outputTokens: 300, options: { taskMultiplier: -2 } });
  assert.strictEqual(zero.factors.taskMultiplier, 1);
  assert.strictEqual(neg.factors.taskMultiplier, 1);
  const ultra = engine.estimateImpact({ modelId: 'deepseek-r1', inputTokens: 100, outputTokens: 300, options: { reasoningEffort: 'ultra' } });
  assert.strictEqual(ultra.factors.reasoningEffort, 'standard');
  const high = engine.estimateImpact({ modelId: 'deepseek-r1', inputTokens: 100, outputTokens: 300, options: { reasoningEffort: 'high' } });
  assert.ok(high.energy.perTokenOutMwh > ultra.energy.perTokenOutMwh * 2);
  assert.deepStrictEqual(engine.aggregate(null), { queries: 0, energyWh: 0, waterMl: 0, carbonG: 0 });
  const mixed = engine.aggregate([{ energy: {}, water: {}, carbon: {} }, { energy: { wh: '2' } }, null, { energyWh: 1, waterMl: 2, carbonG: 3 }]);
  assert.deepStrictEqual(mixed, { queries: 3, energyWh: 3, waterMl: 2, carbonG: 3 });
});

test('a model whose host has no grid entry is rejected at construction', () => {
  const models = { models: [{ model_id: 'x', name: 'X', provider: 'P', host: 'Nowhere Cloud', performance: {
    short: { input_tokens: 100, output_tokens: 300, energy_wh_mean: 1 },
    medium: { input_tokens: 1000, output_tokens: 1000, energy_wh_mean: 2 },
    long: { input_tokens: 10000, output_tokens: 1500, energy_wh_mean: 3 } } }] };
  assert.throws(() => new core.ImpactEngine({ models, grids: core.data.grids }), /nowhere_cloud/);
});

test('autoDetectModel matches domains and subdomains, never substrings', () => {
  assert.strictEqual(core.autoDetectModel('www.perplexity.ai'), 'gpt-4o-mini');
  assert.strictEqual(core.autoDetectModel('CHATGPT.COM'), 'gpt-5');
  assert.strictEqual(core.autoDetectModel('notclaude.ai'), null);
  assert.strictEqual(core.autoDetectModel('claude.ai.evil.example'), null);
  assert.strictEqual(core.autoDetectModel(undefined), null);
});

test('detectModelFromLabels maps model-picker text to catalog ids per provider', () => {
  const d = (host, labels, opts) => (core.detectModelFromLabels(host, labels, opts) || {}).modelId || null;
  // OpenAI
  assert.strictEqual(d('chatgpt.com', ['ChatGPT 5 Thinking']), 'gpt-5-thinking');
  assert.strictEqual(d('chatgpt.com', ['Model selector, current model is GPT-5']), 'gpt-5');
  assert.strictEqual(d('chatgpt.com', ['ChatGPT 5']), 'gpt-5');
  assert.strictEqual(d('chatgpt.com', ['GPT-4o mini']), 'gpt-4o-mini');
  assert.strictEqual(d('chatgpt.com', ['GPT-4o']), 'gpt-4o');
  assert.strictEqual(d('chatgpt.com', ['o4-mini']), 'o4-mini');
  assert.strictEqual(d('chatgpt.com', ['o3']), 'o3');
  assert.strictEqual(d('chatgpt.com', ['Think longer']), 'gpt-5-thinking');
  // Anthropic
  assert.strictEqual(d('claude.ai', ['Sonnet 4.5']), 'claude-4.5-sonnet');
  assert.strictEqual(d('claude.ai', ['Haiku 4.5']), 'claude-4.5-haiku');
  assert.strictEqual(d('claude.ai', ['Claude 3.7 Sonnet']), 'claude-3.7-sonnet');
  assert.strictEqual(d('claude.ai', ['Opus 4.1']), null, 'models outside the catalog are not guessed');
  // Fail closed on newer generations. Each of these previously resolved to an
  // older, cheaper or non-reasoning sibling, so detection error only ever ran
  // in the direction of understating the footprint.
  assert.strictEqual(d('claude.ai', ['Sonnet 5']), 'claude-sonnet-5', 'Sonnet 5 resolves to its own entry, not Sonnet 4.5');
  assert.strictEqual(d('claude.ai', ['Opus 5.5']), null, 'Opus has no catalog entry at any version');
  assert.strictEqual(d('claude.ai', ['Sonnet']), null, 'an unversioned label names no specific model');
  assert.strictEqual(d('chatgpt.com', ['GPT-5.1']), null, 'an unknown GPT-5 minor version is not GPT-5');
  assert.strictEqual(d('chatgpt.com', ['Auto']), null, 'a router mode picks a model we cannot observe');
  assert.strictEqual(d('gemini.google.com', ['Gemini 3 Pro']), null, 'Gemini 3 is not Gemini 2.5');
  assert.strictEqual(
    d('gemini.google.com', ['Gemini 3 Deep Think']), null,
    'a heavy-reasoning selection must not resolve to a non-reasoning entry'
  );
  assert.strictEqual(d('grok.com', ['Grok 4 Heavy']), null, 'Grok 4 is not Grok 3');
  assert.strictEqual(d('chat.deepseek.com', ['V4']), null, 'DeepSeek V4 is not V3');
  // Copilot has its own family: ChatGPT's "Deep Research" rule must not leak
  // onto it and report a reasoning model for Copilot's non-reasoning default.
  assert.strictEqual(core.familyForHost('copilot.microsoft.com'), 'microsoft');
  assert.strictEqual(d('copilot.microsoft.com', ['Deep Research']), null);
  // Hosts that route per query cannot have their served model read off-page.
  assert.ok(core.isRoutedHost('perplexity.ai') && core.isRoutedHost('poe.com'));
  assert.ok(!core.isRoutedHost('chatgpt.com'));
  // Versioned labels the catalog does carry still resolve.
  assert.strictEqual(d('gemini.google.com', ['2.5 Pro']), 'gemini-2.5-pro', 'a decimal is not a bare generation');
  assert.strictEqual(d('gemini.google.com', ['2.5 Flash']), 'gemini-2.5-flash');
  // Google
  assert.strictEqual(d('gemini.google.com', ['2.5 Flash']), 'gemini-2.5-flash');
  assert.strictEqual(d('gemini.google.com', ['2.5 Pro']), 'gemini-2.5-pro');
  assert.strictEqual(d('gemini.google.com', ['2.0 Flash']), 'gemini-2.0-flash');
  // DeepSeek: the DeepThink toggle only counts when it is on.
  assert.strictEqual(d('chat.deepseek.com', [{ text: 'DeepThink (R1)', active: false }]), null);
  assert.strictEqual(d('chat.deepseek.com', [{ text: 'DeepThink (R1)', active: true }]), 'deepseek-r1');
  // Unknown host: nothing unless a family is given (demo pages do this).
  assert.strictEqual(d('localhost', ['ChatGPT 5 Thinking']), null);
  assert.strictEqual(d('localhost', ['ChatGPT 5 Thinking'], { family: 'openai' }), 'gpt-5-thinking');
  // Noise is ignored: long strings, empty strings, wrong family.
  assert.strictEqual(d('chatgpt.com', ['', 'x'.repeat(200) + ' Thinking']), null);
  assert.strictEqual(d('claude.ai', ['ChatGPT 5 Thinking']), null);
  // Every id the detector can return exists in the catalog.
  const ids = new Set(engine.listModels().map((m) => m.id));
  for (const [host, labels] of [
    ['chatgpt.com', ['o4-mini', 'o3', 'Thinking', '4.1 nano', '4o mini', '4o', 'GPT-5']],
    // 'Sonnet' alone is deliberately absent: an unversioned label no longer
    // resolves, so the caller falls back to a documented host default.
    ['claude.ai', ['Haiku', '3.7', 'Sonnet 4.5']],
    ['gemini.google.com', ['2.0 Flash', 'Flash', 'Pro']],
    ['chat.mistral.ai', ['Small', 'Large']],
    ['chat.deepseek.com', [{ text: 'DeepThink', active: true }, 'V3']],
    ['grok.com', ['Grok 3']]
  ]) {
    for (const label of labels) {
      const id = d(host, [label]);
      assert.ok(id && ids.has(id), `${host} "${typeof label === 'string' ? label : label.text}" -> ${id}`);
    }
  }
});

test('the input term is clamped beyond its fitted range, and says so', () => {
  const model = engine.getModel('claude-4.5-sonnet');
  const cap = model.benchMaxInput * core.INPUT_FIT_EXTRAPOLATION_LIMIT;

  // Inside the fitted range nothing is clamped and the grade is definite.
  const near = engine.estimateImpact({ modelId: 'claude-4.5-sonnet', inputTokens: 10000, outputTokens: 500 });
  assert.strictEqual(near.energy.clamped, null);
  assert.strictEqual(near.grade.provisional, undefined);

  // Past the cap the input term stops growing, so two very different context
  // lengths agree — the estimate becomes a floor rather than a fiction.
  const at200k = engine.estimateImpact({ modelId: 'claude-4.5-sonnet', inputTokens: 200000, outputTokens: 500 });
  const at1m = engine.estimateImpact({ modelId: 'claude-4.5-sonnet', inputTokens: 1000000, outputTokens: 500 });
  assert.ok(at200k.energy.clamped, 'a 200k-token prompt is beyond the fitted range');
  assert.strictEqual(at200k.energy.clamped.term, 'input');
  assert.strictEqual(at200k.energy.clamped.atTokens, cap);
  assert.strictEqual(at200k.energy.wh, at1m.energy.wh, 'input term is held flat past the cap');
  assert.strictEqual(at200k.grade.provisional, true, 'a floor gets a provisional grade');

  // Unclamped, the fit put ~96% of a 200k prompt's energy in the input term
  // while this catalog cites Adamska et al. for output-dominance. The clamp
  // keeps the reported figure anchored to what was actually measured.
  const { eIn, eOut, eFixed } = model.coefficients;
  const unclamped = eFixed + eIn * 200000 + eOut * 500;
  assert.ok(unclamped > 25, 'unclamped extrapolation really is this large');
  assert.ok(at200k.energy.wh < unclamped / 3, 'the clamp materially reduces the invented portion');

  // Tokens are still reported honestly even though they are not all billed.
  assert.strictEqual(at200k.tokens.input, 200000);
  assert.strictEqual(at200k.energy.clamped.requestedTokens, 200000);

  // Every model has a non-zero input coefficient — the header comment used to
  // claim the fit recovers e_in ~ 0, which is false for all of them.
  for (const m of engine.listModels()) {
    assert.ok(engine.getModel(m.id).coefficients.eIn > 0, `${m.id} has a non-zero e_in`);
  }
});
