// EcoPrompt Coach — site adapters at run time (PLAN.md Step 15).
// Each supported site has a declarative adapter in sites/*.json (built into
// sites/adapters.js): where its composer, send button, turns and picker are.
// This file finds a page's adapter, decides whether a click or Enter may be
// a send, confirms that a send happened before it is recorded, and words
// the popup's Attached / Not attached line.
'use strict';

(function (root) {
  const hostMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);

  /** The adapter for a hostname, or null. */
  function forHost(hostname, adapters = root.EcoPromptSiteAdapters || []) {
    const host = String(hostname || '').toLowerCase();
    return adapters.find((a) => a.hosts.some((h) => hostMatches(host, h))) || null;
  }

  /** querySelectorAll that a malformed selector can't break: it matches nothing. */
  function queryAll(scope, selector) {
    if (!selector || !scope) return [];
    try {
      return Array.from(scope.querySelectorAll(selector));
    } catch (err) {
      return [];
    }
  }

  function matches(el, selector) {
    if (!selector || !el || typeof el.matches !== 'function') return false;
    try {
      return el.matches(selector);
    } catch (err) {
      return false;
    }
  }

  // Labelled "send" or "submit", but sends nothing to the model.
  const NOT_A_SEND = /feedback|report|share|invite|e-?mail|retry|regenerate|resend|edit/i;

  /**
   * Whether a clicked button may be the send button: the adapter's, else one
   * labelled send or submit that isn't "Send feedback", "Share" or the like.
   * Only a candidate: the send is confirmed before it is recorded.
   */
  function isSendButton(button, adapter) {
    if (!button || typeof button.getAttribute !== 'function') return false;
    if (adapter && matches(button, adapter.sendButton)) return true;
    const label = [
      button.getAttribute('aria-label'),
      button.getAttribute('data-testid'),
      button.getAttribute('title'),
      button.type === 'submit' ? 'submit' : ''
    ].filter(Boolean).join(' ').toLowerCase();
    return /send|submit/.test(label) && !NOT_A_SEND.test(label);
  }

  const defaultTimers = () => ({
    setTimeout: root.setTimeout.bind(root),
    clearTimeout: root.clearTimeout.bind(root),
    now: () => Date.now()
  });

  /**
   * A send is recorded only once it happened: the composer was cleared and,
   * where the page's user turns can be counted, a new one appeared. Enter in
   * a slash menu, a send the page blocked while a reply streams, and a "Send
   * feedback" button do neither.
   *
   * A verified adapter's turn count is trusted from zero. An unverified one
   * counts only once it has matched something on the page, so a wrong guess
   * can't stop every send from being recorded.
   *
   * @param {() => boolean} o.draftEmpty  whether the composer is empty now
   * @param {() => number|null} o.userTurns  user turns on the page; null when they can't be counted
   * @param {boolean} o.trusted  the turn selector is verified
   * @param {(snapshot: any) => void} o.onConfirm
   * @param {(reason: string, snapshot: any, turns: number|null) => void} [o.onDrop]
   *        'draft-kept': the composer still holds text; 'no-new-turn': it
   *        was cleared but no user turn appeared
   */
  function createSendConfirmer({ draftEmpty, userTurns, trusted = false, onConfirm, onDrop = () => {}, windowMs = 4000, pollMs = 100, timers = defaultTimers() }) {
    let pending = null;

    function check() {
      if (!pending) return;
      pending.timer = null;
      const turns = userTurns();
      const counted = pending.turns !== null && turns !== null && (trusted || pending.turns > 0 || turns > 0);
      const cleared = draftEmpty();
      if (cleared && (!counted || turns > pending.turns)) {
        const { snapshot } = pending;
        pending = null;
        onConfirm(snapshot);
        return;
      }
      if (timers.now() >= pending.until) {
        const { snapshot } = pending;
        pending = null;
        onDrop(cleared ? 'no-new-turn' : 'draft-kept', snapshot, turns);
        return;
      }
      pending.timer = timers.setTimeout(check, pollMs);
    }

    return {
      /**
       * A possible send. Within a second of the last one it is the same send
       * (Enter and a click both fired) and is ignored: false. Later, it
       * replaces a candidate still waiting, whose send never happened.
       */
      candidate(snapshot) {
        const now = timers.now();
        if (pending && now - pending.at < 1000) return false;
        if (pending && pending.timer !== null) timers.clearTimeout(pending.timer);
        pending = { snapshot, turns: userTurns(), at: now, until: now + windowMs, timer: null };
        pending.timer = timers.setTimeout(check, 0);
        return true;
      },
      isPending: () => pending !== null,
      cancel() {
        if (pending && pending.timer !== null) timers.clearTimeout(pending.timer);
        pending = null;
      }
    };
  }

  /**
   * The popup's line for the content script's status, or for no reply.
   * @returns {{state: 'attached'|'fallback'|'none'|'paused'|'unknown', text: string, detail: string}}
   */
  function statusText(status, hostname) {
    const host = String(hostname || (status && status.host) || '').replace(/^www\./, '');
    if (!status) {
      return { state: 'unknown', text: `Not attached on ${host}`, detail: 'Reload the page to start EcoPrompt here.' };
    }
    if (status.paused) return { state: 'paused', text: `Paused on ${host}`, detail: '' };
    const a = status.adapter;
    const adapterName = a
      ? `the ${a.site} adapter (${a.lastVerified ? `verified ${a.lastVerified}` : 'not verified yet'})`
      : null;
    if (status.via === 'adapter') {
      const missing = status.turnsMissing > 0
        ? ` ${status.turnsMissing} send${status.turnsMissing === 1 ? '' : 's'} not counted: its message selector found no turns.`
        : '';
      return { state: 'attached', text: `Attached on ${host}`, detail: `Using ${adapterName}.${missing}` };
    }
    if (status.via === 'generic') {
      return {
        state: 'fallback',
        text: `Not attached on ${host}`,
        detail: a
          ? `${adapterName.replace(/^the/, 'The')} found no chat box, so EcoPrompt is using a generic guess.`
          : 'No adapter for this site, so EcoPrompt is using a generic guess.'
      };
    }
    return {
      state: 'none',
      text: `Not attached on ${host}`,
      detail: a ? `Neither ${adapterName} nor a generic guess found a chat box.` : 'No chat box found.'
    };
  }

  root.EcoPromptSites = Object.freeze({ forHost, queryAll, matches, isSendButton, createSendConfirmer, statusText });
})(typeof globalThis !== 'undefined' ? globalThis : this);
