// EcoPrompt Coach — cheap ways to watch a busy page (PLAN.md Step 14).
// The content script shares a page with a chat app that streams replies and
// scrolls on every token, so it waits for idle time, reads only what it
// needs, and lets the browser say when the composer moved instead of asking
// for layout on every scroll.
'use strict';

(function (root) {
  const defaultTimers = () => ({
    setTimeout: root.setTimeout.bind(root),
    clearTimeout: root.clearTimeout.bind(root),
    requestIdleCallback: typeof root.requestIdleCallback === 'function' ? root.requestIdleCallback.bind(root) : null,
    cancelIdleCallback: typeof root.cancelIdleCallback === 'function' ? root.cancelIdleCallback.bind(root) : null,
    now: () => Date.now()
  });

  /**
   * fn, `delay` ms after the last call, in idle time; but never later than
   * `maxWait` ms after the first call of a burst, so a page that never goes
   * quiet (a streaming reply) can't put it off forever. A trailing debounce
   * alone would. The idle wait gives up after `idleTimeout` ms.
   *
   * Returns schedule(), with .cancel() and .flush() (run now if pending).
   */
  function idleDebounce(fn, { delay, maxWait, idleTimeout = 500, timers = defaultTimers() }) {
    let first = null; // when the pending burst began
    let timer = null;
    let idle = null;

    function clear() {
      if (timer !== null) timers.clearTimeout(timer);
      if (idle !== null && timers.cancelIdleCallback) timers.cancelIdleCallback(idle);
      timer = null;
      idle = null;
    }

    function run() {
      clear();
      first = null;
      fn();
    }

    function whenIdle() {
      timer = null;
      if (timers.requestIdleCallback) idle = timers.requestIdleCallback(run, { timeout: idleTimeout });
      else run();
    }

    function schedule() {
      const now = timers.now();
      if (first === null) first = now;
      if (idle !== null) return; // already waiting for idle time
      if (timer !== null) timers.clearTimeout(timer);
      const wait = Math.max(0, Math.min(delay, first + maxWait - now));
      timer = timers.setTimeout(whenIdle, wait);
    }

    schedule.cancel = () => {
      clear();
      first = null;
    };
    schedule.flush = () => {
      if (first !== null) run();
    };
    return schedule;
  }

  /**
   * el's text when it has at most `max` characters, else null, reading no
   * more than max + 1 of them: a large subtree is never serialized only to be
   * thrown away (PLAN.md Step 14).
   */
  function boundedText(el, max) {
    let text = '';
    let node = el.firstChild;
    while (node) {
      if (node.nodeType === 3 || node.nodeType === 4) {
        text += node.nodeValue;
        if (text.length > max) return null;
      }
      if (node.firstChild) {
        node = node.firstChild;
        continue;
      }
      while (node && node !== el && !node.nextSibling) node = node.parentNode;
      node = node && node !== el ? node.nextSibling : null;
    }
    return text;
  }

  /**
   * Calls onMove whenever el moves or resizes, without reading layout on
   * scroll: an IntersectionObserver whose root box is shrunk to el's own
   * rectangle fires as soon as el leaves it, and is then re-armed at the new
   * place. A ResizeObserver covers size changes. Returns stop().
   */
  function watchMove(el, onMove, env = root) {
    const IO = env.IntersectionObserver;
    const RO = env.ResizeObserver;
    let io = null;
    let ro = null;
    let retry = null;
    let stopped = false;

    function arm(skipCall) {
      if (io) io.disconnect();
      if (retry !== null) env.clearTimeout(retry);
      io = null;
      retry = null;
      if (stopped || !el.isConnected) return;
      if (!skipCall) onMove();
      const doc = el.ownerDocument.documentElement;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // Inset the viewport to el's box; while el stays put it fills it.
      const top = Math.floor(r.top);
      const left = Math.floor(r.left);
      const right = Math.floor(doc.clientWidth - r.right);
      const bottom = Math.floor(doc.clientHeight - r.bottom);
      const margin = `${-top}px ${-right}px ${-bottom}px ${-left}px`;
      // Only the part of el on screen can fill the box: expect that much.
      const visible = Math.max(0, Math.min(r.right, doc.clientWidth) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(r.bottom, doc.clientHeight) - Math.max(r.top, 0));
      const expected = Math.min(1, visible / (r.width * r.height));
      if (!(expected > 0)) {
        // Off screen: nothing to inset to, so look again in a while.
        retry = env.setTimeout(() => arm(false), 1000);
        return;
      }
      const threshold = Math.max(0.01, Math.min(1, expected - 0.005));
      let firstCall = true;
      try {
        io = new IO((entries) => {
          const ratio = entries[entries.length - 1].intersectionRatio;
          if (firstCall) {
            firstCall = false;
            if (ratio >= threshold) return;
          }
          arm(false);
        }, { rootMargin: margin, threshold });
        io.observe(el);
      } catch (err) {
        io = null; // a rootMargin the browser won't take: resize events still come
      }
    }

    if (IO) arm(true);
    if (RO) {
      ro = new RO(() => arm(false));
      ro.observe(el);
    }
    return function stop() {
      stopped = true;
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      if (retry !== null) env.clearTimeout(retry);
      io = ro = retry = null;
    };
  }

  root.EcoPromptWatch = Object.freeze({ idleDebounce, boundedText, watchMove });
})(typeof globalThis !== 'undefined' ? globalThis : this);
