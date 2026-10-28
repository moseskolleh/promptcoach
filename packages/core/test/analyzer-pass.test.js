// EcoPrompt Coach Core — one analysis pass (PLAN.md Step 12).
// node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const a = require('../src/analyzer');

const PARAGRAPH = 'The team said "thank you so much" at the kickoff, and the spec lives at example.com/docs/v2.1.0 ' +
  '(see config.json). Revenue grew 3.14% in Q3, i.e. faster than expected. ' +
  '```js\nconst x = await fetch("https://api.example.com/v1");\n``` Please note the risks below.\n';

/** An 86k-character paste between a request and a budget. */
function longPrompt(head = 'Hi! Could you please summarize the following report?\n', tail = '\nAnswer in 3 bullet points. Thanks in advance!') {
  let middle = '';
  while (middle.length < 86000) middle += PARAGRAPH;
  return head + middle.slice(0, 86000) + tail;
}

test('an analysis finds the protected spans once', () => {
  for (const text of ['Translate "thank you so much" into Japanese, please.', longPrompt()]) {
    const before = a.ANALYZER_STATS.spanScans;
    a.analyzePrompt(text);
    assert.strictEqual(a.ANALYZER_STATS.spanScans - before, 1, `${text.length} chars`);
  }
});

test('the detectors take a context in place of the text, with the same answers', () => {
  const prompts = [
    'Summarize this essay in two sentences.',
    'Hi! Could you please write a poem about the sea? Thanks in advance for your help!',
    'Is TypeScript a superset of JavaScript? Answer yes or no.',
    'What\'s the weather in Paris tomorrow?',
    'Translate "thank you so much" into Japanese, please.',
    'Calculate a 15% tip on €84.50'
  ];
  for (const text of prompts) {
    const ctx = a.createPromptContext(text);
    assert.strictEqual(ctx.windowed, false);
    assert.strictEqual(ctx.tokens, a.estimateTokens(text));
    assert.strictEqual(ctx.masked, a.maskProtectedSpans(text));
    assert.deepStrictEqual(a.detectTaskType(ctx), a.detectTaskType(text), text);
    assert.deepStrictEqual(a.detectPoliteWords(ctx), a.detectPoliteWords(text), text);
    assert.deepStrictEqual(a.detectOutputBudget(ctx), a.detectOutputBudget(text), text);
    assert.deepStrictEqual(a.detectSpecialQueryType(ctx), a.detectSpecialQueryType(text), text);
    assert.strictEqual(a.generateOptimizedPrompt(ctx), a.generateOptimizedPrompt(text), text);
  }
});

test('a long prompt is read at its edges and counted in full', () => {
  const text = longPrompt();
  const ctx = a.createPromptContext(text);
  assert.strictEqual(ctx.windowed, true);
  assert.ok(ctx.scanned.length <= 12002);
  assert.strictEqual(ctx.tokens, a.estimateTokens(text));
  const analysis = a.analyzePrompt(text);
  // The verb at the start and the budget at the end are both found.
  assert.strictEqual(analysis.taskTypeRaw, 'TEXT_SUMMARIZATION');
  assert.ok(analysis.outputBudget && analysis.outputBudget.kind === 'bullets', JSON.stringify(analysis.outputBudget));
  assert.strictEqual(analysis.tokens, a.estimateTokens(text));
  // Courtesy at the edges counts; the middle of the paste doesn't.
  const please = analysis.politeWords.found.find((f) => f.phrase === 'please');
  const inFull = (text.match(/\bplease\b/gi) || []).length;
  assert.ok(please.count > 0 && please.count < inFull / 5, `${please.count} of ${inFull}`);
  assert.ok(analysis.politeWords.totalTokensSaved > 0 && analysis.politeWords.totalTokensSaved < analysis.tokens);
  // The trimmed prompt is still all of it, with its payload intact.
  const trimmed = a.generateOptimizedPrompt(text);
  assert.ok(trimmed.length > 80000, String(trimmed.length));
  assert.ok(trimmed.includes('"thank you so much"'));
  assert.ok(!/^Hi!/.test(trimmed) && !/Thanks in advance!$/.test(trimmed));
  assert.strictEqual(a.generateOptimizedPrompt(ctx), trimmed);
});

test('an 86k-character prompt analyzes within budget', () => {
  const text = longPrompt();
  a.analyzePrompt(text); // warm up
  const runs = [];
  for (let i = 0; i < 15; i++) {
    const t0 = process.hrtime.bigint();
    a.analyzePrompt(text);
    runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  runs.sort((x, y) => x - y);
  const median = runs[7];
  // The target is 8 ms (it was 25.8 ms); CI machines vary, so the gate is generous.
  assert.ok(median < 40, `median ${median.toFixed(2)} ms`);
});

test('analyzer.js is text: no literal NUL bytes', () => {
  const bytes = fs.readFileSync(path.join(__dirname, '..', 'src', 'analyzer.js'));
  assert.strictEqual(bytes.indexOf(0), -1);
});
