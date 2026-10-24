// EcoPrompt Coach Core — nothing breaks for existing users (PLAN.md Step 7).
// node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const core = require('../src/index');
const fixture = require('./fixtures/v1-user-data.json');

const { engine } = core.createDefaultEngine();
const current = (id) => engine.getModel(id) && engine.getModel(id).status === 'current';

// The extension's own settings helper, run against a stand-in for
// chrome.storage, so the test covers the code the extension ships.
function loadExtensionSettings() {
  const writes = { sync: [], local: [] };
  globalThis.chrome = {
    storage: {
      sync: { set: (v) => writes.sync.push(v) },
      local: { set: (v) => writes.local.push(v), get: (k, cb) => cb({}), remove() {} }
    }
  };
  delete require.cache[require.resolve('../../../apps/extension/shared/defaults.js')];
  require('../../../apps/extension/shared/defaults.js');
  return { Settings: globalThis.EcoPromptSettings, Defaults: globalThis.EcoPromptDefaults, writes };
}

test('every model id any release has shipped still resolves and estimates', () => {
  assert.ok(fixture.everShipped.length >= 46);
  for (const id of fixture.everShipped) {
    assert.ok(engine.getModel(id), `${id} no longer resolves`);
    assert.ok(engine.estimateImpact({ modelId: id, inputTokens: 150, outputTokens: 400 }), id);
    assert.ok(current(engine.migrateModelId(id).modelId), `${id} does not migrate to a current model`);
  }
});

test('the default model is defined once, in core, and every surface reads it', () => {
  const { Defaults } = loadExtensionSettings();
  assert.strictEqual(Defaults.defaultModel, core.DEFAULT_MODEL_ID);
  assert.ok(current(core.DEFAULT_MODEL_ID));
});

test('saved extension settings move to a current model once, and say so', () => {
  const { Settings, Defaults, writes } = loadExtensionSettings();
  const expected = {
    'gpt-4o': ['gpt-6.1-sol', 'successor'],
    'claude-4.5-sonnet': ['claude-sonnet-5-5', 'successor'],
    'gpt-6-sol': ['gpt-6.1-sol', 'successor'],
    'deepseek-v3': [core.DEFAULT_MODEL_ID, 'default']
  };
  for (const saved of fixture.extensionSettings) {
    writes.sync.length = 0;
    writes.local.length = 0;
    const settings = Settings.resolve(saved, engine);
    assert.ok(current(settings.defaultModel), JSON.stringify(saved));
    // Every other saved choice is kept, and the defaults fill the gaps.
    for (const [k, v] of Object.entries(saved)) if (k !== 'defaultModel') assert.strictEqual(settings[k], v, k);
    for (const k of Object.keys(Defaults)) assert.ok(k in settings, k);
    const move = expected[saved.defaultModel];
    if (!move) {
      // Current or nothing saved: nothing is written, nothing to say.
      assert.deepStrictEqual(writes, { sync: [], local: [] }, JSON.stringify(saved));
      continue;
    }
    assert.strictEqual(settings.defaultModel, move[0]);
    assert.deepStrictEqual(writes.sync, [{ eco_settings: { ...saved, defaultModel: move[0] } }]);
    const notice = writes.local[0][Settings.NOTICE_KEY];
    assert.strictEqual(notice.via, move[1]);
    assert.strictEqual(notice.from, engine.getModel(saved.defaultModel).name);
    const text = Settings.noticeText(notice);
    assert.ok(text.includes(notice.from) && text.includes(engine.getModel(move[0]).name), text);
  }
  assert.strictEqual(Settings.noticeText({ from: 'GPT-4o', to: 'GPT-6.1 Sol', via: 'successor' }),
    'Your default model was updated from GPT-4o to GPT-6.1 Sol, its current successor.');
  assert.strictEqual(Settings.noticeText(null), null);
  // Settings saved after the move resolve without moving again.
  const once = Settings.resolve({ defaultModel: 'gpt-4o' }, engine);
  writes.sync.length = 0;
  Settings.resolve({ defaultModel: once.defaultModel }, engine);
  assert.deepStrictEqual(writes.sync, []);
});

test('saved mobile settings move the same way', () => {
  for (const saved of fixture.mobileSettings) {
    const move = engine.migrateModelId(saved.defaultModelId);
    assert.ok(move.changed && current(move.modelId), saved.defaultModelId);
  }
  assert.strictEqual(engine.migrateModelId('gpt-5').modelId, 'gpt-6.1-sol');
  // Llama 3.2 1B's line ended: the default model.
  assert.strictEqual(engine.migrateModelId('llama-3.2-1b').modelId, core.DEFAULT_MODEL_ID);
});

test('history keeps its stored figures, and every entry names its model', () => {
  const totals = engine.aggregate(fixture.history);
  assert.strictEqual(totals.queries, fixture.history.length);
  const stored = fixture.history.reduce((sum, h) => sum + h.energyWh, 0);
  assert.ok(Math.abs(totals.energyWh - stored) < 1e-9, 'totals re-scored the stored figures');
  // One entry is a floor, so the total is one too.
  assert.strictEqual(totals.range.highWh, null);
  for (const h of fixture.history) {
    const model = engine.getModel(h.modelId);
    assert.ok(model && model.name, `${h.modelId}: unknown model`);
    // Its own model, not a successor, can still re-estimate it.
    assert.strictEqual(engine.estimateImpact({ modelId: h.modelId, inputTokens: 150, outputTokens: 400 }).model.id, h.modelId);
  }
});

test('a share link with an old id opens that model, and knows its successor', () => {
  for (const hash of fixture.shareLinks) {
    const params = new URLSearchParams(hash.slice('#share?'.length));
    const id = params.get('m');
    const model = engine.getModel(id);
    assert.ok(model, `${hash}: unknown model`);
    // The shared number reproduces: the link's own model estimates it.
    const impact = engine.estimateImpact({ modelId: id, inputTokens: 5, outputTokens: 300 });
    assert.strictEqual(impact.model.id, id);
    const successor = engine.currentSuccessor(id);
    if (model.status === 'current') assert.strictEqual(successor, id);
    else assert.ok(successor === null || current(successor), `${id} -> ${successor}`);
  }
  assert.strictEqual(engine.currentSuccessor('gpt-4o'), 'gpt-6.1-sol');
  assert.strictEqual(engine.currentSuccessor('deepseek-v3'), null);
});

test('library entries name their own model', () => {
  for (const it of fixture.library) {
    const model = engine.getModel(it.modelId);
    assert.ok(model && model.name, `${it.modelId}: unknown model`);
  }
});
