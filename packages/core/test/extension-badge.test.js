// EcoPrompt Coach — the extension badge resets at midnight (PLAN.md Step 10).
// node --test
'use strict';

process.env.TZ = 'Europe/Amsterdam';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const extDir = path.join(__dirname, '..', '..', '..', 'apps', 'extension');

/** Run background.js in a worker-like context with a recording chrome stub. */
function startWorker(now, history) {
  const calls = { alarms: [], badgeText: [] };
  const listeners = {};
  const on = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const context = {
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [context.now])); }
      static now() { return context.now; }
    },
    now,
    chrome: {
      alarms: { create: (name, info) => calls.alarms.push({ name, ...info }), onAlarm: on('alarm') },
      action: {
        setBadgeText: ({ text }) => calls.badgeText.push(text),
        setBadgeBackgroundColor() {},
        setBadgeTextColor() {}
      },
      storage: { local: { get: (key, cb) => cb({ eco_history: history }) }, onChanged: on('changed') },
      runtime: { onInstalled: on('installed'), onStartup: on('startup') }
    }
  };
  context.globalThis = context;
  context.importScripts = (...files) => {
    for (const f of files) vm.runInContext(fs.readFileSync(path.join(extDir, f), 'utf8'), context, { filename: f });
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(extDir, 'background.js'), 'utf8'), context, { filename: 'background.js' });
  return { calls, listeners, context };
}

test('the badge clears at local midnight even when nothing is recorded', () => {
  const evening = new Date(2026, 9, 24, 22, 15).getTime();
  const { calls, listeners, context } = startWorker(evening, [
    { ts: new Date(2026, 9, 24, 9).getTime(), energyWh: 0.3 },
    { ts: new Date(2026, 9, 24, 21).getTime(), energyWh: 0.5 }
  ]);
  assert.deepStrictEqual(calls.badgeText, ['2']);
  // One alarm, just after the coming local midnight.
  assert.strictEqual(calls.alarms.length, 1);
  assert.strictEqual(calls.alarms[0].name, 'midnight');
  assert.strictEqual(calls.alarms[0].when, new Date(2026, 9, 25).getTime() + 1000);

  // It fires: the new day has no queries, so the badge empties, and the next
  // alarm lands on the next midnight, the end of a 25-hour day.
  context.now = calls.alarms[0].when;
  listeners.alarm({ name: 'midnight' });
  assert.deepStrictEqual(calls.badgeText, ['2', '']);
  assert.strictEqual(calls.alarms[1].when, new Date(2026, 9, 26).getTime() + 1000);
  assert.strictEqual(calls.alarms[1].when - calls.alarms[0].when, 25 * 3600 * 1000);

  // Someone else's alarm is not ours.
  listeners.alarm({ name: 'other' });
  assert.strictEqual(calls.alarms.length, 2);
});
