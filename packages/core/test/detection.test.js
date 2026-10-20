// EcoPrompt Coach Core — detection for 2026 pickers (PLAN.md Step 6).
// node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const core = require('../src/index');

const { engine } = core.createDefaultEngine();
const catalogIds = engine.listModels({ includeReference: true }).map((m) => m.id);
const currentIds = new Set(engine.listModels().map((m) => m.id));

const detect = (host, labels, opts = {}) => core.detectModelFromLabels(host, labels, { modelIds: catalogIds, ...opts });
const shape = (r) => (r ? { modelId: r.modelId, effort: r.effort, multiAgent: r.multiAgent } : null);

test('every site default is a current model, a declared gap, or a router', () => {
  const expected = {
    'chatgpt.com': 'gpt-6-sol',
    'claude.ai': 'claude-sonnet-5-5',
    'gemini.google.com': 'gemini-3.8-flash',
    'copilot.microsoft.com': 'gpt-6-sol',
    'chat.mistral.ai': 'mistral-medium-3.5',
    'grok.com': 'grok-4.7',
    'www.meta.ai': 'muse-spark-1.3',
    'poe.com': 'claude-sonnet-5-5'
  };
  for (const [host, id] of Object.entries(expected)) {
    assert.strictEqual(core.autoDetectModel(host), id, host);
    // A current model, or GPT-6 Sol: ChatGPT still serves it while the API
    // has moved on (a reference entry that keeps its estimate).
    assert.ok(currentIds.has(id) || id === 'gpt-6-sol', `${host} default ${id} is not current`);
    assert.ok(engine.getModel(id), id);
  }
  // DeepSeek's current models are not in the catalog: a known site with no
  // default, never another lab's model.
  assert.deepStrictEqual(core.hostDefault('chat.deepseek.com'), { modelId: null, known: true, routed: false, family: 'deepseek' });
  // Perplexity routes to its own Sonar model, which has no entry.
  assert.deepStrictEqual(core.hostDefault('www.perplexity.ai'), { modelId: null, known: true, routed: true, family: null });
  for (const host of ['perplexity.ai', 'poe.com', 'copilot.microsoft.com', 'gemini.google.com']) {
    assert.ok(core.isRoutedHost(host), host);
  }
  assert.ok(!core.isRoutedHost('chatgpt.com'));
  assert.deepStrictEqual(core.hostDefault('example.com'), { modelId: null, known: false, routed: false, family: null });
});

test('site matching takes domains and subdomains, never substrings', () => {
  assert.strictEqual(core.autoDetectModel('CHATGPT.COM'), 'gpt-6-sol');
  assert.strictEqual(core.autoDetectModel('www.meta.ai'), 'muse-spark-1.3');
  assert.strictEqual(core.autoDetectModel('notclaude.ai'), null);
  assert.strictEqual(core.autoDetectModel('claude.ai.evil.example'), null);
  assert.strictEqual(core.autoDetectModel('metameta.ai'), null);
  assert.strictEqual(core.autoDetectModel(undefined), null);
  assert.strictEqual(core.familyForHost('meta.ai'), 'meta');
});

test('the 23 picker labels of finding 2 resolve correctly', () => {
  const cases = [
    // Six used to resolve silently to an older, cheaper sibling.
    ['claude.ai', 'Sonnet 5.5', { modelId: 'claude-sonnet-5-5', effort: null, multiAgent: false }],
    ['claude.ai', 'Haiku 5.5', { modelId: 'claude-haiku-5-5', effort: null, multiAgent: false }],
    ['gemini.google.com', '3.8 Flash', { modelId: 'gemini-3.8-flash', effort: null, multiAgent: false }],
    ['gemini.google.com', '3.5 Flash-Lite', { modelId: 'gemini-3.5-flash-lite', effort: null, multiAgent: false }],
    // Gemini 3.1 Pro is still a preview id, not in the catalog: nothing, so
    // the caller shows the site default, never 2.5 Pro.
    ['gemini.google.com', '3.1 Pro', null],
    ['chat.mistral.ai', 'Medium 3.5', { modelId: 'mistral-medium-3.5', effort: null, multiAgent: false }],
    // Four used to fail closed to a 2025 default.
    ['chatgpt.com', 'GPT-6', { modelId: 'gpt-6-sol', effort: null, multiAgent: false }],
    ['claude.ai', 'Opus 5.5', { modelId: 'claude-opus-5-5', effort: null, multiAgent: false }],
    ['claude.ai', 'Fable 5.1', { modelId: 'claude-fable-5-1', effort: null, multiAgent: false }],
    ['gemini.google.com', 'Auto', null],
    // Twelve matched nothing.
    ['chatgpt.com', 'Instant', { modelId: 'gpt-6-sol', effort: 'none', multiAgent: false }],
    ['chatgpt.com', 'Medium', { modelId: 'gpt-6-sol', effort: 'standard', multiAgent: false }],
    ['chatgpt.com', 'High', { modelId: 'gpt-6-sol', effort: 'high', multiAgent: false }],
    ['chatgpt.com', 'Extra High', { modelId: 'gpt-6-sol', effort: 'xhigh', multiAgent: false }],
    ['chatgpt.com', 'Pro', { modelId: 'gpt-6-astra', effort: null, multiAgent: false }],
    // An effort with no model of its own: the caller pairs it with Sonnet 5.5.
    ['claude.ai', 'Extra high', { modelId: null, effort: 'xhigh', multiAgent: false }],
    ['gemini.google.com', '4 Argon', { modelId: 'gemini-4-argon', effort: null, multiAgent: false }],
    ['grok.com', 'Fast', { modelId: 'grok-4.7', effort: 'low', multiAgent: false }],
    ['grok.com', 'Expert', { modelId: 'grok-4.7', effort: 'high', multiAgent: false }],
    ['grok.com', 'Heavy', { modelId: 'grok-4.7', effort: 'high', multiAgent: true }],
    // DeepSeek's modes name V4 models the catalog does not carry yet.
    ['chat.deepseek.com', 'Instant', { modelId: null, effort: 'none', multiAgent: false }],
    ['chat.deepseek.com', 'Expert', { modelId: null, effort: 'high', multiAgent: false }],
    // One site was not supported.
    ['www.meta.ai', 'Thinking', { modelId: 'muse-spark-1.3', effort: 'standard', multiAgent: false }]
  ];
  assert.strictEqual(cases.length, 23);
  for (const [host, label, want] of cases) {
    assert.deepStrictEqual(shape(detect(host, [label])), want, `${host} "${label}"`);
  }
  // Model and mode together, as a switcher shows them.
  assert.deepStrictEqual(shape(detect('chatgpt.com', ['GPT-6', 'Extra High'])), { modelId: 'gpt-6-sol', effort: 'xhigh', multiAgent: false });
  assert.deepStrictEqual(shape(detect('claude.ai', ['Opus 5.5', 'Max'])), { modelId: 'claude-opus-5-5', effort: 'max', multiAgent: false });
  assert.deepStrictEqual(shape(detect('chatgpt.com', ['GPT-6 Pro'])), { modelId: 'gpt-6-astra', effort: null, multiAgent: false });
  assert.deepStrictEqual(shape(detect('www.meta.ai', ['Contemplating'])), { modelId: 'muse-spark-1.3', effort: 'standard', multiAgent: true });
});

// How each line's version reads, written here independently of the engine,
// so the test checks the catalog-driven rule rather than copying it.
const LINES = [
  { host: 'chatgpt.com', label: (v) => `GPT-${v}`, id: /^gpt-(\d+(?:\.\d+)?)(?=-|$)/ },
  { host: 'claude.ai', label: (v) => `Claude ${v}`, id: /^claude-(?:opus|sonnet|haiku|fable)-(\d+(?:-\d+)?)$/ },
  { host: 'claude.ai', label: (v) => `Opus ${v}`, id: /^claude-opus-(\d+(?:-\d+)?)$/ },
  { host: 'claude.ai', label: (v) => `Sonnet ${v}`, id: /^claude-sonnet-(\d+(?:-\d+)?)$/ },
  { host: 'claude.ai', label: (v) => `Haiku ${v}`, id: /^claude-haiku-(\d+(?:-\d+)?)$/ },
  { host: 'claude.ai', label: (v) => `Fable ${v}`, id: /^claude-fable-(\d+(?:-\d+)?)$/ },
  { host: 'gemini.google.com', label: (v) => `Gemini ${v}`, id: /^gemini-(\d+(?:\.\d+)?)(?=-)/ },
  { host: 'grok.com', label: (v) => `Grok ${v}`, id: /^grok-(\d+(?:\.\d+)?)$/ },
  { host: 'chat.deepseek.com', label: (v) => `DeepSeek V${v}`, id: /^deepseek-v(\d+(?:\.\d+)?)$/ },
  { host: 'www.meta.ai', label: (v) => `Muse ${v}`, id: /^muse-spark-(\d+(?:\.\d+)?)$/ },
  { host: 'chat.mistral.ai', label: (v) => `Medium ${v}`, id: /^mistral-medium-(\d+(?:\.\d+)?)$/ },
  { host: 'chat.mistral.ai', label: (v) => `Small ${v}`, id: /^mistral-small-(\d+(?:\.\d+)?)$/ }
];

function newestIn(re) {
  let best = null;
  for (const id of catalogIds) {
    const m = re.exec(id);
    if (!m) continue;
    const v = m[1].replace('-', '.').split('.').map(Number);
    if (!best || v[0] > best[0] || (v[0] === best[0] && (v[1] || 0) > (best[1] || 0))) best = v;
  }
  return best;
}

test('for every family, the next version after the catalog\'s newest fails closed', () => {
  for (const line of LINES) {
    const [major, minor = 0] = newestIn(line.id);
    for (const next of [`${major}.${minor + 1}`, `${major + 1}`]) {
      const r = detect(line.host, [line.label(next)]);
      assert.ok(r && r.unknownGeneration && r.modelId === null, `${line.host} "${line.label(next)}" should fail closed`);
    }
  }
  // A version inside the catalog never fails closed.
  assert.strictEqual(detect('claude.ai', ['Opus 5.5']).unknownGeneration, undefined);
  // A later generation blocks a mode too: GPT-7 at Extra High is not GPT-6 Sol.
  assert.strictEqual(detect('chatgpt.com', ['GPT-7', 'Extra High']).modelId, null);
  // The newest version comes from the catalog given: once a refresh adds
  // GPT-6.2, a "GPT-6.2" label stops failing closed (and, with no pattern
  // for it yet, names nothing rather than an older sibling).
  assert.strictEqual(core.detectModelFromLabels('chatgpt.com', ['GPT-6.2'], { modelIds: [...catalogIds, 'gpt-6.2-sol'] }), null);
});

test('no bare catch-all absorbs a new generation', () => {
  for (const [host, label] of [
    ['claude.ai', 'Sonnet'], ['claude.ai', 'Haiku'], ['claude.ai', 'Opus 5'],
    ['gemini.google.com', 'Flash'], ['gemini.google.com', 'Pro'], ['gemini.google.com', 'Gemini 3 Pro'],
    ['chat.mistral.ai', 'Large'], ['chat.mistral.ai', 'Medium'], ['chat.mistral.ai', 'Large 4'],
    ['chatgpt.com', 'Thinking'], ['chatgpt.com', '5'], ['chatgpt.com', 'Auto'], ['grok.com', 'Grok'], ['chat.deepseek.com', 'V4.1']
  ]) {
    const r = detect(host, [label]);
    assert.ok(r === null || r.modelId === null, `${host} "${label}" -> ${r && r.modelId}`);
  }
  // A bare mode word only counts on its own family's site.
  assert.strictEqual(detect('claude.ai', ['Pro']), null);
  assert.strictEqual(detect('gemini.google.com', ['Extra High']), null);
});

test('2025 labels still resolve to their reference entries', () => {
  for (const [host, label, id] of [
    ['chatgpt.com', 'GPT-4o', 'gpt-4o'], ['chatgpt.com', 'GPT-4o mini', 'gpt-4o-mini'], ['chatgpt.com', 'o3', 'o3'],
    ['chatgpt.com', 'o4-mini', 'o4-mini'], ['chatgpt.com', 'ChatGPT 5 Thinking', 'gpt-5-thinking'], ['chatgpt.com', 'GPT-5', 'gpt-5'],
    ['claude.ai', 'Sonnet 5', 'claude-sonnet-5'], ['claude.ai', 'Sonnet 4.5', 'claude-4.5-sonnet'], ['claude.ai', 'Claude 3.7 Sonnet', 'claude-3.7-sonnet'],
    ['gemini.google.com', '2.5 Pro', 'gemini-2.5-pro'], ['gemini.google.com', '2.0 Flash', 'gemini-2.0-flash'],
    ['chat.mistral.ai', 'Large 2', 'mistral-large'], ['grok.com', 'Grok 3', 'grok-3'], ['chat.deepseek.com', 'V3', 'deepseek-v3']
  ]) {
    assert.strictEqual(detect(host, [label]).modelId, id, `${host} "${label}"`);
  }
  // R1 only when its toggle is on.
  assert.strictEqual(detect('chat.deepseek.com', [{ text: 'DeepThink (R1)', active: false }]), null);
  assert.strictEqual(detect('chat.deepseek.com', [{ text: 'DeepThink (R1)', active: true }]).modelId, 'deepseek-r1');
});

test('every id detection can return exists, and noise is ignored', () => {
  const all = new Set(catalogIds);
  for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.mistral.ai', 'chat.deepseek.com', 'grok.com', 'www.meta.ai']) {
    for (const label of ['GPT-6', 'GPT-6.1', 'Astra', 'Luna', 'Pro', 'Instant', 'Extra High', 'Fable 5.1', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5',
      'Argon', '3.8 Flash', '3.5 Flash-Lite', 'Medium 3.5', 'Small 4', 'Grok 4.7', 'Fast', 'Heavy', 'Muse Spark', 'Thinking']) {
      const r = detect(host, [label]);
      if (r && r.modelId) assert.ok(all.has(r.modelId), `${host} "${label}" -> ${r.modelId}`);
    }
  }
  // Copilot has a family of its own, with nothing to match.
  assert.strictEqual(core.familyForHost('copilot.microsoft.com'), 'microsoft');
  assert.strictEqual(detect('copilot.microsoft.com', ['Deep Research']), null);
  // An unknown site needs a family (demo pages give one).
  assert.strictEqual(detect('localhost', ['GPT-6']), null);
  assert.strictEqual(detect('localhost', ['GPT-6'], { family: 'openai' }).modelId, 'gpt-6-sol');
  // Long strings, empty strings, another family's labels.
  assert.strictEqual(detect('chatgpt.com', ['', 'x'.repeat(200) + ' GPT-6']), null);
  assert.strictEqual(detect('claude.ai', ['GPT-6']), null);
  assert.strictEqual(detect('chatgpt.com', 'GPT-6'), null);
  assert.strictEqual(core.detectModelFromLabels('constructor', ['GPT-6'], { family: 'constructor' }), null);
});
