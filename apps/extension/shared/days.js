// EcoPrompt Coach — calendar days for history buckets and the badge.
// A day runs from local midnight to the next local midnight, built from
// calendar dates (new Date(y, m, d - i)), never from 24-hour offsets: across
// a daylight-saving change a day lasts 23 or 25 hours, and a millisecond
// offset would put its edge at 23:00 or 01:00 (PLAN.md Step 10).
'use strict';

(function (root) {
  const midnight = (ts, dayOffset) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset).getTime();
  };

  root.EcoPromptDays = Object.freeze({
    /** The local midnight that starts the day holding ts. */
    startOfDay: (ts) => midnight(ts, 0),

    /** The local midnight that ends the day holding ts. */
    nextMidnight: (ts) => midnight(ts, 1),

    /** The `count` calendar days ending with the one holding `now`, oldest first. */
    lastDays(now, count) {
      const days = [];
      for (let i = count - 1; i >= 0; i--) days.push({ start: midnight(now, -i), end: midnight(now, 1 - i) });
      return days;
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
