// EcoPrompt Coach — the extension's calendar days (PLAN.md Step 10).
// node --test
'use strict';

// A zone with daylight saving, set before any date is made.
process.env.TZ = 'Europe/Amsterdam';

const { test } = require('node:test');
const assert = require('node:assert');

require('../../../apps/extension/shared/days.js');
const Days = globalThis.EcoPromptDays;
const HOUR = 3600 * 1000;

function assertCalendarWeek(now) {
  const week = Days.lastDays(now, 7);
  assert.strictEqual(week.length, 7);
  for (const [i, day] of week.entries()) {
    const start = new Date(day.start);
    assert.deepStrictEqual([start.getHours(), start.getMinutes()], [0, 0], `day ${i} starts at midnight`);
    assert.strictEqual(day.end, Days.nextMidnight(day.start));
    if (i > 0) assert.strictEqual(day.start, week[i - 1].end, `day ${i} follows day ${i - 1}`);
  }
  assert.strictEqual(week[6].start, Days.startOfDay(now));
  assert.ok(now >= week[6].start && now < week[6].end);
  return week;
}

test('a week across the end of summer time has a 25-hour day, and every edge at midnight', () => {
  // Summer time ended on Sunday 2026-10-25 in Amsterdam.
  const now = new Date(2026, 9, 26, 12).getTime();
  const week = assertCalendarWeek(now);
  const lengths = week.map((d) => (d.end - d.start) / HOUR);
  assert.deepStrictEqual(lengths, [24, 24, 24, 24, 24, 25, 24]);
  // What the 24-hour offsets did: the edges before the change fell at 01:00.
  assert.strictEqual(new Date(week[6].start - 6 * 24 * HOUR).getHours(), 1);
});

test('a week across the start of summer time has a 23-hour day', () => {
  // Summer time started on Sunday 2026-03-29.
  const week = assertCalendarWeek(new Date(2026, 2, 31, 8).getTime());
  assert.deepStrictEqual(week.map((d) => (d.end - d.start) / HOUR), [24, 24, 24, 24, 23, 24, 24]);
  // There the offsets fell at 23:00 the evening before.
  assert.strictEqual(new Date(week[6].start - 6 * 24 * HOUR).getHours(), 23);
});

test('the next midnight is the start of tomorrow, even late on a long day', () => {
  const late = new Date(2026, 9, 25, 23, 59).getTime();
  assert.strictEqual(Days.nextMidnight(late), new Date(2026, 9, 26).getTime());
  assert.strictEqual(Days.startOfDay(late), new Date(2026, 9, 25).getTime());
  // A plain week far from any change: 24-hour days.
  assert.ok(assertCalendarWeek(new Date(2026, 5, 10, 9).getTime()).every((d) => d.end - d.start === 24 * HOUR));
});
