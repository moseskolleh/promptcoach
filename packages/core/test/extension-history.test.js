// EcoPrompt Coach — history v2: inputs not just results, one writer
// (PLAN.md Step 11). node --test
'use strict';

process.env.TZ = 'Europe/Amsterdam';

const { test } = require('node:test');
const assert = require('node:assert');

const core = require('../src/index'); // sets globalThis.EcoPromptCore for the extension's scripts
require('../../../apps/extension/shared/history.js');
const History = globalThis.EcoPromptHistory;
const modelsData = require('../src/data/models.json');
const { startWorker } = require('./helpers/extension-worker');

const { engine } = core.createDefaultEngine();
const DAY = 24 * 3600 * 1000;
const START = new Date(2026, 6, 1, 9).getTime();

// A few different sends, priced the way the content script prices them.
const SENDS = [
  { modelId: 'gpt-6-luna', taskType: 'QUESTION_ANSWERING', inTokens: 40, outTokensEst: 200, effort: 'standard', flags: {} },
  { modelId: 'claude-sonnet-5-5', taskType: 'CODE_GENERATION', inTokens: 900, outTokensEst: 700, effort: 'high', flags: {} },
  { modelId: 'gpt-6-sol', taskType: 'GENERAL', inTokens: 120, outTokensEst: 400, effort: 'xhigh', flags: { thinkingOn: true } },
  { modelId: 'grok-4.7', taskType: 'AGENTIC_TASK', inTokens: 300, outTokensEst: 900, effort: 'high', flags: { multiAgent: true } },
  { modelId: 'gemini-3.5-flash-lite', taskType: 'TEXT_SUMMARIZATION', inTokens: 2500, outTokensEst: 300, effort: null, flags: {} }
].map((s) => ({ host: 'chatgpt.com', modelSource: 'picker', region: 'default', embodied: true, ...s }));

function entryAt(i, ts) {
  const inputs = { ...SENDS[i % SENDS.length], ts };
  return History.makeEntry(inputs, engine.estimateImpact(History.requestFor(inputs)));
}

const dayKeys = (local) => Object.keys(local).filter((k) => k.startsWith(History.DAY_PREFIX));
const rowsIn = (local) => dayKeys(local).flatMap((k) => local[k]);

test('without one writer, tabs overwrite each other (the stand-in really interleaves)', async () => {
  const { local, context } = startWorker({ now: START });
  const area = context.chrome.storage.local;
  local.list = [];
  // Three tabs read, then each writes back its own copy plus one.
  await Promise.all([1, 2, 3].map(async (tab) => {
    const got = await area.get(['list']);
    await area.set({ list: [...got.list, tab] });
  }));
  assert.strictEqual(local.list.length, 1, 'two of three sends were lost');
});

test('10,000 sends from 3 tabs lose nothing', async () => {
  const w = startWorker({ now: START, interleave: true });
  await w.settle();
  const tabs = [1, 2, 3].map((id) => ({ tab: { id }, url: `https://chatgpt.com/c/conversation-${id}?model=x#top` }));
  const N = 10000;
  const entries = [];
  const sends = [];
  for (let i = 0; i < N; i++) {
    // Thirteen minutes apart: about 90 days, with daylight saving's end in it.
    const e = entryAt(i, START + i * 13 * 60 * 1000);
    entries.push(e);
    sends.push(w.send({ type: 'eco:record', entry: e }, tabs[i % 3]));
  }
  const answers = await Promise.all(sends);
  assert.ok(answers.every((a) => a && a.ok), JSON.stringify(answers.find((a) => !a || !a.ok)));

  const rows = rowsIn(w.local);
  assert.strictEqual(rows.length, N);
  const agg = w.local[History.AGG_KEY];
  const totals = core.aggregateImpacts(Object.values(agg));
  assert.strictEqual(totals.queries, N);
  const expected = core.aggregateImpacts(entries);
  assert.ok(Math.abs(totals.energyWh - expected.energyWh) < 1e-6 * expected.energyWh);
  assert.ok(Math.abs(totals.range.lowWh - expected.range.lowWh) < 1e-6 * expected.range.lowWh);
  assert.strictEqual(totals.range.highWh, null, 'a multi-agent send makes it a floor');
  // Each day's total is its own rows' total.
  for (const key of dayKeys(w.local)) {
    assert.strictEqual(agg[key.slice(2)].queries, w.local[key].length, key);
    for (const row of w.local[key]) assert.strictEqual(History.dateOf(row.ts), key.slice(2));
  }
  // One conversation key per tab's conversation; the query and fragment don't count.
  const keys = new Set(rows.map((r) => r.convKey));
  assert.strictEqual(keys.size, 3);
  for (const k of keys) assert.match(k, /^[0-9a-f]{16}$/);
});

test('rows keep inputs and figures, never text or addresses', async () => {
  const w = startWorker({ now: START });
  await w.settle();
  const entry = { ...entryAt(0, START), prompt: 'my secret prompt', text: 'my secret prompt' };
  const answer = await w.send({ type: 'eco:record', entry }, { tab: { id: 1 }, url: 'https://chatgpt.com/c/abc123' });
  assert.ok(answer.ok);
  const stored = JSON.stringify(w.local);
  assert.ok(!stored.includes('secret'), 'text was stored');
  assert.ok(!stored.includes('abc123') && !stored.includes('chatgpt.com/c'), 'the address was stored');
  const [row] = rowsIn(w.local);
  assert.deepStrictEqual(Object.keys(row).sort(), [
    'carbonG', 'convKey', 'effort', 'embodied', 'energyWh', 'flags', 'grade', 'host', 'inTokens', 'modelId',
    'modelSource', 'outTokensEst', 'outTokensObs', 'region', 'taskType', 'ts', 'v', 'waterMl'
  ].concat(row.lowWh === undefined ? [] : ['highWh', 'lowWh']).sort());
  // Something that isn't a row is refused, and only pages record.
  assert.strictEqual((await w.send({ type: 'eco:record', entry: { v: 2, ts: START } }, { tab: { id: 1 }, url: 'https://chatgpt.com/' })).ok, false);
  assert.strictEqual((await w.send({ type: 'eco:record', entry: entryAt(1, START) }, {})).ok, false);
  // Pages can't clear or re-score.
  assert.strictEqual((await w.send({ type: 'eco:clear' }, { tab: { id: 1 } })).ok, false);
  assert.strictEqual((await w.send({ type: 'eco:rescore' }, { tab: { id: 1 } })).ok, false);
  assert.strictEqual(rowsIn(w.local).length, 1);
  // Unknown messages are left for others.
  assert.strictEqual(await w.send({ type: 'something-else' }, {}), undefined);
});

function catalogFetch(data) {
  return (url) => {
    const name = url.split('/').pop().replace('.json', '');
    const body = name === 'models' ? data : core.data[name];
    return Promise.resolve({ json: () => Promise.resolve(JSON.parse(JSON.stringify(body))) });
  };
}

test('re-scoring after a catalog edit changes the totals; the same catalog changes nothing', async () => {
  const local = {
    eco_history: [
      { ts: START - 3 * DAY, host: 'chatgpt.com', modelId: 'gpt-4o', energyWh: 0.42, waterMl: 1.6, carbonG: 0.17, grade: 'B' },
      { ts: START - 3 * DAY + 60000, host: 'claude.ai', modelId: 'claude-4.5-sonnet', energyWh: 1.1, waterMl: 3.2, carbonG: 0.4, grade: 'C' }
    ]
  };
  const w = startWorker({ now: START, local, fetch: catalogFetch(modelsData) });
  await w.settle();
  for (let i = 0; i < 20; i++) {
    assert.ok((await w.send({ type: 'eco:record', entry: entryAt(i, START + i * DAY / 4) }, { tab: { id: 1 }, url: 'https://chatgpt.com/' })).ok);
  }
  const before = core.aggregateImpacts(Object.values(local[History.AGG_KEY]));
  assert.strictEqual(before.queries, 22);

  const same = await w.send({ type: 'eco:rescore' }, {});
  assert.deepStrictEqual(same, { ok: true, result: { rescored: 20, kept: 2, daysWithoutRows: 0 } });
  const unchanged = core.aggregateImpacts(Object.values(local[History.AGG_KEY]));
  assert.ok(Math.abs(unchanged.energyWh - before.energyWh) < 1e-9 * before.energyWh, 'the same catalog moved the totals');

  // A catalog edit: GPT-6 Luna moves from the small tier to the frontier one.
  const edited = JSON.parse(JSON.stringify(modelsData));
  edited.models.find((m) => m.model_id === 'gpt-6-luna').estimate.tier = 'frontier';
  const w2 = startWorker({ now: START, local, fetch: catalogFetch(edited) });
  await w2.settle();
  const legacyBefore = rowsIn(local).filter((r) => r.v === 1).map((r) => r.energyWh);
  const answer = await w2.send({ type: 'eco:rescore' }, {});
  assert.deepStrictEqual(answer.result, { rescored: 20, kept: 2, daysWithoutRows: 0 });
  const after = core.aggregateImpacts(Object.values(local[History.AGG_KEY]));
  assert.strictEqual(after.queries, 22);
  assert.ok(after.energyWh > before.energyWh * 1.01, `${after.energyWh} vs ${before.energyWh}`);
  // The pre-v2 rows have no inputs: their figures stand.
  assert.deepStrictEqual(rowsIn(local).filter((r) => r.v === 1).map((r) => r.energyWh), legacyBefore);
});

test('pre-v2 history moves into day keys once', async () => {
  const legacy = [
    { ts: START, host: 'chatgpt.com', modelId: 'gpt-4o', energyWh: 0.4, waterMl: 1, carbonG: 0.1, grade: 'B' },
    { ts: START + 60000, host: 'grok.com', modelId: 'grok-4.7', energyWh: 9.4, waterMl: 30, carbonG: 4, grade: 'D', lowWh: 9.4, highWh: null },
    { ts: START + DAY, modelId: 'o3', energyWh: 14, waterMl: 50, carbonG: 6, grade: 'E' },
    { junk: true }
  ];
  const local = { eco_history: legacy };
  const w = startWorker({ now: START + 2 * DAY, local });
  await w.settle();
  assert.ok(!('eco_history' in local));
  assert.strictEqual(local['hist:legacyMigrated'], true);
  assert.deepStrictEqual(dayKeys(local).sort(), ['h:2026-07-01', 'h:2026-07-02']);
  assert.ok(rowsIn(local).every((r) => r.v === 1));
  const totals = core.aggregateImpacts(Object.values(local[History.AGG_KEY]));
  assert.strictEqual(totals.queries, 3);
  assert.strictEqual(totals.range.highWh, null);
  // A later start, or a crash after the rows were written but before the old
  // key went, adds nothing twice.
  local.eco_history = legacy;
  startWorker({ now: START + 2 * DAY, local });
  await w.settle();
  assert.ok(!('eco_history' in local));
  assert.strictEqual(rowsIn(local).length, 3);
});

test('retention drops old rows and keeps every day\'s totals', async () => {
  const local = {};
  const now = START + 60 * DAY;
  const w = startWorker({ now: START, local });
  await w.settle();
  for (let d = 0; d <= 60; d += 10) {
    await w.send({ type: 'eco:record', entry: entryAt(d, START + d * DAY) }, { tab: { id: 1 }, url: 'https://chatgpt.com/' });
  }
  const aggBefore = JSON.stringify(local[History.AGG_KEY]);
  // The worker reads the setting at start and at midnight.
  startWorker({ now, local, sync: { eco_settings: { historyRetentionDays: 30 } } });
  await w.settle();
  assert.deepStrictEqual(dayKeys(local).map((k) => k.slice(2)).sort(), ['2026-08-10', '2026-08-20', '2026-08-30']);
  assert.strictEqual(JSON.stringify(local[History.AGG_KEY]), aggBefore);
  // Re-scoring leaves the dropped days' totals as they were.
  const w3 = startWorker({ now, local, fetch: catalogFetch(modelsData) });
  await w3.settle();
  const answer = await w3.send({ type: 'eco:rescore' }, {});
  assert.deepStrictEqual(answer.result, { rescored: 3, kept: 0, daysWithoutRows: 4 });
  assert.strictEqual(core.aggregateImpacts(Object.values(local[History.AGG_KEY])).queries, 7);
});

test('clearing removes rows and totals', async () => {
  const w = startWorker({ now: START });
  await w.settle();
  await w.send({ type: 'eco:record', entry: entryAt(0, START) }, { tab: { id: 1 }, url: 'https://chatgpt.com/' });
  assert.ok((await w.send({ type: 'eco:clear' }, {})).ok);
  assert.deepStrictEqual(dayKeys(w.local), []);
  assert.ok(!(History.AGG_KEY in w.local));
});

test('the content script and re-scoring price a send the same way', () => {
  for (let i = 0; i < SENDS.length; i++) {
    const entry = entryAt(i, START);
    const again = History.rescoreRow(entry, engine);
    for (const k of Object.keys(again)) assert.strictEqual(again[k], entry[k], `${SENDS[i].modelId} ${k}`);
  }
  assert.strictEqual(History.rescoreRow({ v: 1, energyWh: 1 }, engine), null);
  assert.strictEqual(History.conversationUrl('https://claude.ai/chat/abc?x=1#y'), 'https://claude.ai/chat/abc');
  assert.strictEqual(History.conversationUrl('not a url'), null);
});
