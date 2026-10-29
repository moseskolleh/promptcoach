// EcoPrompt Coach — site adapters (PLAN.md Step 15): every supported host
// has one, each is well formed, the built file is current, and a send is
// recorded only once it happened. node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Sync = require('../../../scripts/sync-sites.js');
require('../../../apps/extension/shared/sites.js');
const Sites = globalThis.EcoPromptSites;

const extDir = path.join(__dirname, '..', '..', '..', 'apps', 'extension');
const adapters = Sync.readAdapters();

const hostsOf = (manifestFile) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, manifestFile), 'utf8'));
  return manifest.content_scripts[0].matches.map((m) => new URL(m.replace('*', 'x')).hostname);
};

test('every host the content script runs on has exactly one adapter', () => {
  for (const file of ['manifest.json', 'manifest.dev.json']) {
    for (const host of hostsOf(file)) {
      const claiming = adapters.filter((a) => a.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
      assert.strictEqual(claiming.length, 1, `${file}: ${host} has ${claiming.length} adapters`);
      assert.strictEqual(Sites.forHost(host, adapters), claiming[0]);
    }
  }
  assert.strictEqual(Sites.forHost('example.com', adapters), null);
  assert.strictEqual(Sites.forHost('CHATGPT.COM', adapters).site, 'ChatGPT');
});

test('the built adapters.js is current', () => {
  assert.strictEqual(fs.readFileSync(Sync.OUTPUT, 'utf8'), Sync.buildAdapters(adapters),
    'run: node scripts/sync-sites.js');
});

test('an adapter is unverified until someone checks it on the site', () => {
  for (const a of adapters) {
    assert.deepStrictEqual(Sync.adapterProblems(a), [], a.site);
    if (a.lastVerified === null) assert.match(a.notes, /not yet checked/, `${a.site} says it is unverified`);
  }
});

test('adapter checks catch the mistakes an edit makes', () => {
  const good = adapters.find((a) => a.site === 'ChatGPT');
  const problems = (change) => Sync.adapterProblems({ ...good, ...change });
  assert.deepStrictEqual(problems({}), []);
  assert.match(problems({ composer: null }).join(), /composer must be a CSS selector/);
  assert.match(problems({ sendButton: "button[data-testid='send-button'" }).join(), /not a well-formed selector/);
  assert.match(problems({ picker: 'a, , b' }).join(), /not a well-formed selector/);
  assert.match(problems({ insertStrategy: 'typeIt' }).join(), /insertStrategy/);
  assert.match(problems({ lastVerified: '2999-01-01' }).join(), /in the future/);
  assert.match(problems({ lastVerified: 'last week' }).join(), /YYYY-MM-DD/);
  assert.match(problems({ hosts: ['ChatGPT.com'] }).join(), /lower-case/);
  assert.match(problems({ stopbutton: 'x' }).join(), /unknown key "stopbutton"/);
  const { notes, ...noNotes } = good;
  assert.match(Sync.adapterProblems(noNotes).join(), /missing "notes"/);
});

/** A button as the content script sees one. */
function button(attrs = {}, matching = null) {
  return {
    type: attrs.type || 'button',
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    matches: (selector) => selector === matching
  };
}

test('send buttons: the adapter’s, or labelled send — never "Send feedback"', () => {
  const chatgpt = Sites.forHost('chatgpt.com', adapters);
  assert.ok(Sites.isSendButton(button({}, chatgpt.sendButton), chatgpt));
  assert.ok(Sites.isSendButton(button({ 'aria-label': 'Send message' }), null));
  assert.ok(Sites.isSendButton(button({ 'data-testid': 'send-button' }), null));
  assert.ok(Sites.isSendButton(button({ type: 'submit' }), null));
  for (const label of ['Send feedback', 'Share', 'Send by email', 'Regenerate', 'Report message']) {
    assert.ok(!Sites.isSendButton(button({ 'aria-label': label }), null), label);
  }
  assert.ok(!Sites.isSendButton(null, chatgpt));
  // A malformed selector matches nothing instead of throwing.
  const thrower = { type: 'button', getAttribute: () => null, matches: () => { throw new Error('bad selector'); } };
  assert.ok(!Sites.isSendButton(thrower, { sendButton: 'button[' }));
});

/** Fake timers on a clock the test moves by hand. */
function clock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    api: {
      now: () => now,
      setTimeout: (fn, ms) => { timers.set(++seq, { fn, at: now + ms }); return seq; },
      clearTimeout: (id) => timers.delete(id)
    },
    advance(ms) {
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
  };
}

/** A page: a draft and a count of user turns the test changes. */
function page({ turns = 0, trusted = true, countable = true } = {}) {
  const c = clock();
  const state = { draft: 'Name three planets.', turns, confirmed: [], dropped: [] };
  const confirmer = Sites.createSendConfirmer({
    draftEmpty: () => !state.draft,
    userTurns: () => (countable ? state.turns : null),
    trusted,
    onConfirm: (s) => state.confirmed.push(s),
    onDrop: (reason, s, t) => state.dropped.push({ reason, turns: t }),
    timers: c.api
  });
  return { c, state, confirmer };
}

test('a send is recorded once the composer clears and a user turn appears', () => {
  const { c, state, confirmer } = page({ turns: 2 });
  assert.ok(confirmer.candidate('send-1'));
  c.advance(50);
  assert.deepStrictEqual(state.confirmed, [], 'not before the page acts');
  state.draft = '';
  state.turns = 3;
  c.advance(200);
  assert.deepStrictEqual(state.confirmed, ['send-1']);
  assert.ok(!confirmer.isPending());
});

test('slash menus, blocked sends and "Send feedback" record nothing', () => {
  // Enter picked a command: the composer keeps text.
  let p = page({ turns: 2 });
  p.confirmer.candidate('slash');
  p.state.draft = 'Summarize the following text:';
  p.c.advance(5000);
  assert.deepStrictEqual(p.state.confirmed, []);
  assert.deepStrictEqual(p.state.dropped, [{ reason: 'draft-kept', turns: 2 }]);

  // A command that empties the composer: no new turn, so no send.
  p = page({ turns: 2 });
  p.confirmer.candidate('image-mode');
  p.state.draft = '';
  p.c.advance(5000);
  assert.deepStrictEqual(p.state.confirmed, []);
  assert.deepStrictEqual(p.state.dropped, [{ reason: 'no-new-turn', turns: 2 }]);

  // The page refused the send while a reply streamed: nothing changes.
  p = page({ turns: 4 });
  p.confirmer.candidate('blocked');
  p.c.advance(5000);
  assert.deepStrictEqual(p.state.confirmed, []);
});

test('an unverified turn selector can’t veto every send', () => {
  // It never matched on this page: the cleared composer is enough.
  let p = page({ turns: 0, trusted: false });
  p.confirmer.candidate('first');
  p.state.draft = '';
  p.c.advance(200);
  assert.deepStrictEqual(p.state.confirmed, ['first']);

  // Once it has matched, it counts.
  p = page({ turns: 3, trusted: false });
  p.confirmer.candidate('later');
  p.state.draft = '';
  p.c.advance(5000);
  assert.deepStrictEqual(p.state.confirmed, []);

  // A site whose turns can't be counted at all.
  p = page({ countable: false });
  p.confirmer.candidate('uncounted');
  p.state.draft = '';
  p.c.advance(200);
  assert.deepStrictEqual(p.state.confirmed, ['uncounted']);

  // A verified one counts from zero: the first send of a new chat.
  p = page({ turns: 0, trusted: true });
  p.confirmer.candidate('new-chat');
  p.state.draft = '';
  p.c.advance(100);
  assert.deepStrictEqual(p.state.confirmed, []);
  p.state.turns = 1;
  p.c.advance(200);
  assert.deepStrictEqual(p.state.confirmed, ['new-chat']);
});

test('Enter and a click on one send count once; a later try replaces a stuck one', () => {
  const { c, state, confirmer } = page({ turns: 1 });
  assert.ok(confirmer.candidate('enter'));
  assert.ok(!confirmer.candidate('click'), 'the same send');
  c.advance(1500);
  // The page refused it; the user tries again once the reply ends.
  state.draft = 'Name three planets, briefly.';
  assert.ok(confirmer.candidate('retry'));
  state.draft = '';
  state.turns = 2;
  c.advance(200);
  assert.deepStrictEqual(state.confirmed, ['retry']);
  c.advance(10000);
  assert.deepStrictEqual(state.dropped, [], 'the replaced one is not reported');
});

test('the popup line for each status', () => {
  const adapter = { site: 'ChatGPT', lastVerified: null };
  const line = (status) => Sites.statusText(status, 'chatgpt.com');
  assert.deepStrictEqual(line({ adapter, via: 'adapter', paused: false, turnsMissing: 0 }), {
    state: 'attached', text: 'Attached on chatgpt.com', detail: 'Using the ChatGPT adapter (not verified yet).'
  });
  assert.strictEqual(line({ adapter: { ...adapter, lastVerified: '2026-10-29' }, via: 'adapter', turnsMissing: 1 }).detail,
    'Using the ChatGPT adapter (verified 2026-10-29). 1 send not counted: its message selector found no turns.');
  const fallback = line({ adapter, via: 'generic', paused: false });
  assert.strictEqual(fallback.state, 'fallback');
  assert.strictEqual(fallback.text, 'Not attached on chatgpt.com');
  assert.match(fallback.detail, /^The ChatGPT adapter \(not verified yet\) found no chat box/);
  assert.strictEqual(line({ adapter, via: null }).state, 'none');
  assert.strictEqual(line({ adapter: null, via: 'generic' }).detail, 'No adapter for this site, so EcoPrompt is using a generic guess.');
  assert.strictEqual(line({ adapter, via: 'adapter', paused: true }).state, 'paused');
  assert.deepStrictEqual(Sites.statusText(null, 'www.perplexity.ai'), {
    state: 'unknown', text: 'Not attached on perplexity.ai', detail: 'Reload the page to start EcoPrompt here.'
  });
});
