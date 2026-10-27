// EcoPrompt Coach — the extension badge resets at midnight (PLAN.md Step 10).
// node --test
'use strict';

process.env.TZ = 'Europe/Amsterdam';

const { test } = require('node:test');
const assert = require('node:assert');

const { startWorker } = require('./helpers/extension-worker');

test('the badge clears at local midnight even when nothing is recorded', async () => {
  const evening = new Date(2026, 9, 24, 22, 15).getTime();
  const { calls, listeners, context, settle } = startWorker({
    now: evening,
    local: { 'agg:daily': { '2026-10-24': { queries: 2, energyWh: 0.8, waterMl: 3, carbonG: 0.2 } } }
  });
  await settle();
  assert.strictEqual(calls.badgeText[calls.badgeText.length - 1], '2');
  // One alarm, just after the coming local midnight.
  assert.strictEqual(calls.alarms.length, 1);
  assert.strictEqual(calls.alarms[0].name, 'midnight');
  assert.strictEqual(calls.alarms[0].when, new Date(2026, 9, 25).getTime() + 1000);

  // It fires: the new day has no queries, so the badge empties, and the next
  // alarm lands on the next midnight, the end of a 25-hour day.
  context.now = calls.alarms[0].when;
  listeners.alarm({ name: 'midnight' });
  await settle();
  assert.strictEqual(calls.badgeText[calls.badgeText.length - 1], '');
  assert.strictEqual(calls.alarms[1].when, new Date(2026, 9, 26).getTime() + 1000);
  assert.strictEqual(calls.alarms[1].when - calls.alarms[0].when, 25 * 3600 * 1000);

  // Someone else's alarm is not ours.
  listeners.alarm({ name: 'other' });
  assert.strictEqual(calls.alarms.length, 2);
});
