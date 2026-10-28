// Runs the extension's background.js in a worker-like vm context with a
// recording chrome stub. Storage is asynchronous and, when asked, takes a
// random number of event-loop turns per call, so concurrent writers really
// interleave.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const extDir = path.join(__dirname, '..', '..', '..', '..', 'apps', 'extension');

function fakeArea(data, interleave) {
  const turns = () => new Promise((resolve) => {
    let n = interleave ? Math.floor(Math.random() * 4) : 0;
    const hop = () => (n-- > 0 ? setImmediate(hop) : resolve());
    hop();
  });
  const copy = (v) => (v === undefined ? v : structuredClone(v));
  const pick = (keys) => {
    if (keys === null || keys === undefined) return copy(data);
    const list = typeof keys === 'string' ? [keys] : keys;
    const out = {};
    for (const k of list) if (k in data) out[k] = copy(data[k]);
    return out;
  };
  return {
    data,
    get(keys, cb) {
      const p = turns().then(() => pick(keys));
      if (cb) p.then(cb);
      return p;
    },
    async set(items, cb) {
      await turns();
      Object.assign(data, copy(items));
      if (cb) cb();
    },
    async remove(keys, cb) {
      await turns();
      for (const k of typeof keys === 'string' ? [keys] : keys) delete data[k];
      if (cb) cb();
    }
  };
}

/**
 * @param {Object} opts
 * @param {number} opts.now           the clock, settable later via context.now
 * @param {Object} [opts.local]       initial chrome.storage.local
 * @param {Object} [opts.sync]        initial chrome.storage.sync
 * @param {boolean} [opts.interleave] random event-loop turns per storage call
 * @param {Function} [opts.fetch]     for the worker's catalog fetches
 */
function startWorker({ now, local = {}, sync = {}, interleave = false, fetch } = {}) {
  const calls = { alarms: [], badgeText: [] };
  const listeners = {};
  const on = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const localArea = fakeArea(local, interleave);
  const context = {
    now,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [context.now])); }
      static now() { return context.now; }
    },
    crypto: globalThis.crypto,
    TextEncoder,
    URL,
    setTimeout,
    fetch: fetch || (() => Promise.reject(new Error('no fetch in this test'))),
    chrome: {
      alarms: { create: (name, info) => calls.alarms.push({ name, ...info }), onAlarm: on('alarm') },
      action: {
        setBadgeText: ({ text }) => calls.badgeText.push(text),
        setBadgeBackgroundColor() {},
        setBadgeTextColor() {}
      },
      storage: { local: localArea, sync: fakeArea(sync, false), onChanged: on('changed') },
      runtime: {
        getURL: (p) => `chrome-extension://test/${p}`,
        onInstalled: on('installed'),
        onStartup: on('startup'),
        onMessage: on('message')
      }
    }
  };
  context.globalThis = context;
  context.importScripts = (...files) => {
    for (const f of files) vm.runInContext(fs.readFileSync(path.join(extDir, f), 'utf8'), context, { filename: f });
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(extDir, 'background.js'), 'utf8'), context, { filename: 'background.js' });

  /** Deliver a runtime message as Chrome would, serialized both ways; resolves with the response. */
  const send = (msg, sender) => new Promise((resolve) => {
    const reply = (res) => resolve(res === undefined ? res : JSON.parse(JSON.stringify(res)));
    const async = listeners.message(JSON.parse(JSON.stringify(msg)), sender, reply);
    if (!async) resolve(undefined);
  });
  // Lets queued storage work finish.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  return { calls, listeners, context, local: localArea.data, send, settle };
}

module.exports = { startWorker, extDir };
