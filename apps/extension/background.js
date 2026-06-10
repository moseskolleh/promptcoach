// EcoPrompt Coach — background service worker.
// Keeps the action badge in sync with today's usage: badge text is the
// number of queries recorded today, badge color the grade color of the
// day's average energy per query.

'use strict';

const GRADE_COLORS = {
  A: '#10B981',
  B: '#84CC16',
  C: '#F59E0B',
  D: '#F97316',
  E: '#EF4444'
};

// Same bands as packages/core GRADE_BANDS — kept inline because service
// workers can't share the vendored window-global modules.
function gradeForWh(wh) {
  if (wh <= 0.4) return 'A';
  if (wh <= 1.2) return 'B';
  if (wh <= 3.5) return 'C';
  if (wh <= 10) return 'D';
  return 'E';
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function updateBadge() {
  chrome.storage.local.get('eco_history', (data) => {
    const history = Array.isArray(data && data.eco_history) ? data.eco_history : [];
    const since = startOfToday();
    const today = history.filter((e) => e && e.ts >= since);

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
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.eco_history) updateBadge();
});

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
updateBadge();
