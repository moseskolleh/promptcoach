// EcoPrompt Coach — background service worker.
// The single writer of query history (PLAN.md Step 11): content scripts send
// each query here, and one queue stores it, so tabs can't clobber each
// other. It also keeps the action badge in sync with today's usage: badge
// text is the number of queries recorded today, badge color the grade color
// of the day's average energy per query.

'use strict';

// vendor/core.bundle.js attaches the engine to globalThis.EcoPromptCore, so
// the badge uses the exact same grade bands and colours as the popup and the
// pill — it can never drift when they change in core.
//
// This worker and the imported scripts share ONE global scope, so nothing
// here may redeclare a top-level name from them. A previous
// `const { GRADE_BANDS } = …` collided with core's own GRADE_BANDS, threw
// "Identifier has already been declared" during importScripts, and aborted
// the worker on every startup — the badge never rendered.
importScripts('vendor/core.bundle.js', 'shared/defaults.js', 'shared/days.js', 'shared/history.js');
const Core = globalThis.EcoPromptCore;
const Days = globalThis.EcoPromptDays;
const History = globalThis.EcoPromptHistory;

const store = History.chromeStore(chrome.storage.local);
const writer = History.createWriter(store);

function gradeForWh(wh) {
  return Core.GRADE_BANDS.find((b) => wh <= b.maxWh).grade;
}

/** The badge from the daily totals: today's count, colored by its average. */
function renderBadge(agg) {
  const today = agg && agg[History.dateOf(Date.now())];
  if (!today || !today.queries) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const grade = gradeForWh(today.energyWh / today.queries);
  chrome.action.setBadgeText({ text: String(today.queries) });
  chrome.action.setBadgeBackgroundColor({ color: Core.gradeColor(grade) });
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
  }
}

function updateBadge() {
  chrome.storage.local.get(History.AGG_KEY, (data) => {
    renderBadge(data && data[History.AGG_KEY]);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  // The change already carries the new totals.
  if (area === 'local' && changes[History.AGG_KEY]) {
    renderBadge(changes[History.AGG_KEY].newValue);
  }
});

// Re-scoring needs the engine, built on first use from the bundle's data.
let bundledEngine = null;
function loadEngine() {
  if (!bundledEngine) bundledEngine = Core.createBundledEngine().engine;
  return bundledEngine;
}

// Content scripts record; only the extension's own pages (no tab) may
// re-score or clear.
const HANDLERS = {
  'eco:record': (msg, sender) => (sender.tab ? writer.record(msg.entry, sender.url) : Promise.reject(new Error('not from a page'))),
  'eco:rescore': async (msg, sender) => {
    if (sender.tab) throw new Error('not from the extension');
    return writer.rescore(loadEngine());
  },
  'eco:clear': (msg, sender) => (sender.tab ? Promise.reject(new Error('not from the extension')) : writer.clear())
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = msg && typeof msg.type === 'string' && Object.prototype.hasOwnProperty.call(HANDLERS, msg.type)
    ? HANDLERS[msg.type]
    : null;
  if (!handler) return false;
  handler(msg, sender || {}).then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
  );
  return true; // the response comes asynchronously
});

/** Rows older than the retention setting go; their days' totals stay. */
function pruneHistory() {
  chrome.storage.sync.get('eco_settings', (data) => {
    const settings = { ...globalThis.EcoPromptDefaults, ...((data && data.eco_settings) || {}) };
    writer.prune(Number(settings.historyRetentionDays) || 0);
  });
}

// The badge counts today's queries, so it must reset at local midnight even
// when nothing is recorded that day (PLAN.md Step 10). An alarm survives the
// worker being shut down between events; one created again replaces it.
function scheduleMidnightRefresh() {
  chrome.alarms.create('midnight', { when: Days.nextMidnight(Date.now()) + 1000 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'midnight') return;
  updateBadge();
  pruneHistory();
  scheduleMidnightRefresh();
});

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
// Pre-v2 history moves into day keys once; later starts find nothing to do.
writer.migrateLegacy().then(updateBadge, updateBadge);
pruneHistory();
scheduleMidnightRefresh();
