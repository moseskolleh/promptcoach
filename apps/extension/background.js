// EcoPrompt Coach — background service worker.
// Keeps the action badge in sync with today's usage: badge text is the
// number of queries recorded today, badge color the grade color of the
// day's average energy per query.

'use strict';

// vendor/calculator.js attaches the engine to globalThis.EcoPromptCore, so
// the badge uses the exact same grade bands as the popup and the pill — it
// can never drift when the bands are recalibrated in core.
importScripts('vendor/calculator.js');
const { GRADE_BANDS } = globalThis.EcoPromptCore;

const GRADE_COLORS = {
  A: '#10B981',
  B: '#84CC16',
  C: '#F59E0B',
  D: '#F97316',
  E: '#EF4444'
};

function gradeForWh(wh) {
  return GRADE_BANDS.find((b) => wh <= b.maxWh).grade;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function renderBadge(history) {
  const entries = Array.isArray(history) ? history : [];
  const since = startOfToday();
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

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
updateBadge();
