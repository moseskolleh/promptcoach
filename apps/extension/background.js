// EcoPrompt Coach — background service worker.
// Keeps the action badge in sync with today's usage: badge text is the
// number of queries recorded today, badge color the grade color of the
// day's average energy per query.

'use strict';

// vendor/calculator.js attaches the engine to globalThis.EcoPromptCore, so
// the badge uses the exact same grade bands as the popup and the pill — it
// can never drift when the bands are recalibrated in core.
//
// This worker and the imported script share ONE global scope, so nothing
// here may redeclare a top-level name from calculator.js. A previous
// `const { GRADE_BANDS } = …` collided with core's own GRADE_BANDS, threw
// "Identifier has already been declared" during importScripts, and aborted
// the worker on every startup — the badge never rendered.
importScripts('vendor/calculator.js', 'shared/days.js');
const Core = globalThis.EcoPromptCore;
const Days = globalThis.EcoPromptDays;

const GRADE_COLORS = {
  A: '#10B981',
  B: '#84CC16',
  C: '#F59E0B',
  D: '#F97316',
  E: '#EF4444'
};

function gradeForWh(wh) {
  return Core.GRADE_BANDS.find((b) => wh <= b.maxWh).grade;
}

function renderBadge(history) {
  const entries = Array.isArray(history) ? history : [];
  const since = Days.startOfDay(Date.now());
  const today = entries.filter((e) => e && e.ts >= since);

  if (today.length === 0) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  const avgWh =
    today.reduce((sum, e) => sum + (Number(e.energyWh) || 0), 0) / today.length;
  const grade = gradeForWh(avgWh);

  chrome.action.setBadgeText({ text: String(today.length) });
  chrome.action.setBadgeBackgroundColor({ color: GRADE_COLORS[grade] });
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
  }
}

function updateBadge() {
  chrome.storage.local.get('eco_history', (data) => {
    renderBadge(data && data.eco_history);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  // The change event already carries the new history — no need to re-read
  // the (up to 5000-entry) array from storage.
  if (area === 'local' && changes.eco_history) {
    renderBadge(changes.eco_history.newValue);
  }
});

// The badge counts today's queries, so it must reset at local midnight even
// when nothing is recorded that day (PLAN.md Step 10). An alarm survives the
// worker being shut down between events; one created again replaces it.
function scheduleMidnightRefresh() {
  chrome.alarms.create('midnight', { when: Days.nextMidnight(Date.now()) + 1000 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'midnight') return;
  updateBadge();
  scheduleMidnightRefresh();
});

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
updateBadge();
scheduleMidnightRefresh();
