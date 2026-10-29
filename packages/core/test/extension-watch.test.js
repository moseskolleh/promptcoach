// EcoPrompt Coach — the content script's cheap watching (PLAN.md Step 14):
// idle scheduling with a max wait, and bounded text reads. node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

require('../../../apps/extension/shared/watch.js');
const Watch = globalThis.EcoPromptWatch;

/** Fake timers and idle callbacks on a clock the test moves by hand. */
function fakeClock({ idle = true } = {}) {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const idles = new Map();
  const api = {
    now: () => now,
    setTimeout: (fn, ms) => { timers.set(++seq, { fn, at: now + ms }); return seq; },
    clearTimeout: (id) => timers.delete(id),
    requestIdleCallback: idle ? (fn) => { idles.set(++seq, fn); return seq; } : null,
    cancelIdleCallback: idle ? (id) => idles.delete(id) : null
  };
  /** Move time on, firing due timers; idle callbacks run when the page goes idle. */
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  }
  function goIdle() {
    const pending = [...idles.values()];
    idles.clear();
    for (const fn of pending) fn();
  }
  return { api, advance, goIdle, pendingIdle: () => idles.size };
}

test('idle debounce: runs once, after the page settles, in idle time', () => {
  const clock = fakeClock();
  let runs = 0;
  const schedule = Watch.idleDebounce(() => runs++, { delay: 500, maxWait: 2000, timers: clock.api });
  for (let i = 0; i < 4; i++) {
    schedule();
    clock.advance(100);
  }
  assert.strictEqual(runs, 0);
  clock.advance(500);
  assert.strictEqual(clock.pendingIdle(), 1, 'waits for idle time');
  assert.strictEqual(runs, 0);
  clock.goIdle();
  assert.strictEqual(runs, 1);
  clock.advance(5000);
  clock.goIdle();
  assert.strictEqual(runs, 1, 'nothing more without another call');
});

test('idle debounce: a page that never settles still gets a run every maxWait', () => {
  const clock = fakeClock({ idle: false });
  const at = [];
  const schedule = Watch.idleDebounce(() => at.push(clock.api.now()), { delay: 500, maxWait: 2000, timers: clock.api });
  // A streaming reply: a mutation every 50 ms for 7 s. A trailing debounce
  // would not run once in that time.
  for (let t = 0; t < 7000; t += 50) {
    schedule();
    clock.advance(50);
  }
  assert.deepStrictEqual(at, [2000, 4000, 6000]);
});

test('idle debounce: calls while waiting for idle time join that run; cancel and flush', () => {
  const clock = fakeClock();
  let runs = 0;
  const schedule = Watch.idleDebounce(() => runs++, { delay: 300, maxWait: 1000, timers: clock.api });
  schedule();
  clock.advance(300);
  schedule();
  schedule();
  clock.goIdle();
  assert.strictEqual(runs, 1);

  schedule();
  schedule.cancel();
  clock.advance(2000);
  clock.goIdle();
  assert.strictEqual(runs, 1, 'cancelled');

  schedule.flush();
  assert.strictEqual(runs, 1, 'flush runs only a pending call');
  schedule();
  schedule.flush();
  assert.strictEqual(runs, 2, 'flush runs it now');
  clock.advance(2000);
  clock.goIdle();
  assert.strictEqual(runs, 2, 'and leaves nothing behind');
});

/** A minimal DOM: elements with children and text nodes, linked as the DOM links them. */
function tree(spec, parent = null) {
  if (typeof spec === 'string') return { nodeType: 3, nodeValue: spec, firstChild: null, nextSibling: null, parentNode: parent };
  const el = { nodeType: 1, firstChild: null, nextSibling: null, parentNode: parent };
  let prev = null;
  for (const child of spec) {
    const node = tree(child, el);
    if (prev) prev.nextSibling = node;
    else el.firstChild = node;
    prev = node;
  }
  return el;
}

test('bounded text: short labels read whole, long subtrees given up on early', () => {
  assert.strictEqual(Watch.boundedText(tree(['GPT-6 ', ['Sol'], [' · ', ['Extra High']]]), 80), 'GPT-6 Sol · Extra High');
  assert.strictEqual(Watch.boundedText(tree([]), 80), '');
  assert.strictEqual(Watch.boundedText(tree(['x'.repeat(80)]), 80), 'x'.repeat(80));
  assert.strictEqual(Watch.boundedText(tree(['x'.repeat(81)]), 80), null);

  // A transcript-sized subtree: the read stops at the first text past the limit.
  let read = 0;
  const big = tree(Array.from({ length: 5000 }, () => [['a long paragraph of reply text']]));
  const count = (node) => {
    if (node.nodeType === 3) {
      const value = node.nodeValue;
      Object.defineProperty(node, 'nodeValue', { get: () => { read++; return value; } });
    }
    for (let c = node.firstChild; c; c = c.nextSibling) count(c);
  };
  count(big);
  assert.strictEqual(Watch.boundedText(big, 80), null);
  assert.ok(read <= 4, `read ${read} text nodes`);
});
