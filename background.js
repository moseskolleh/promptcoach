// EcoPrompt Coach - Background Service Worker
// Handles background tasks and extension lifecycle.
//
// MV3 service workers can be suspended at any time after ~30 seconds of
// inactivity. That means setTimeout callbacks longer than a few seconds may
// never run. For deferred work we use chrome.alarms, which survives
// suspension. For best-effort work we just rely on the popup clearing UI
// state next time it opens.

const HISTORY_KEY = 'ecoprompt_history';
const COUNTER_KEY = 'queriesAnalyzed';
const HISTORY_MAX_ENTRIES = 1000;
const BADGE_CLEAR_ALARM = 'ecoprompt-clear-badge';

// ========================================
// LIFECYCLE
// ========================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('EcoPrompt Coach installed successfully');
    chrome.storage.local.set({
      defaultModel: 'gpt-5',
      trackingEnabled: true,
      [COUNTER_KEY]: 0
    });
  } else if (details.reason === 'update') {
    console.log('EcoPrompt Coach updated');
  }
});

// ========================================
// HISTORY WRITE
// ========================================
//
// Called from content scripts (which can't reliably hold long-lived state
// of their own). We append to chrome.storage.local and trim to the most
// recent HISTORY_MAX_ENTRIES so storage doesn't grow unbounded.
//
// Caller passes a fully-formed entry; we don't recompute impact here so the
// service worker can stay cold-startup-fast.

function recordHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return Promise.resolve(false);
  return new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_KEY, COUNTER_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.error('EcoPrompt: history read failed', chrome.runtime.lastError);
        resolve(false);
        return;
      }
      const history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
      history.push({
        timestamp: entry.timestamp || Date.now(),
        date: entry.date || new Date().toISOString(),
        model: String(entry.model || 'unknown'),
        platform: String(entry.platform || ''),
        tokens: Number(entry.tokens) || 0,
        energy: Number(entry.energy) || 0,
        water: Number(entry.water) || 0,
        carbon: Number(entry.carbon) || 0,
        promptPreview: String(entry.promptPreview || '').slice(0, 80),
        source: String(entry.source || 'content_script')
      });
      if (history.length > HISTORY_MAX_ENTRIES) {
        history.splice(0, history.length - HISTORY_MAX_ENTRIES);
      }
      const counter = (Number(result[COUNTER_KEY]) || 0) + 1;
      chrome.storage.local.set(
        { [HISTORY_KEY]: history, [COUNTER_KEY]: counter },
        () => resolve(!chrome.runtime.lastError)
      );
    });
  });
}

// ========================================
// MESSAGE HANDLER
// ========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  if (request.action === 'getStats') {
    chrome.storage.local.get([COUNTER_KEY], (result) => {
      sendResponse({ queriesAnalyzed: Number(result[COUNTER_KEY]) || 0 });
    });
    return true;
  }

  if (request.action === 'recordHistory') {
    recordHistoryEntry(request.entry).then((ok) => sendResponse({ success: ok }));
    return true;
  }

  if (request.action === 'openPopup') {
    if (request.analysis) {
      chrome.storage.local.set({ currentAnalysis: request.analysis });
    }
    // We can't programmatically open the popup in MV3, so we draw attention
    // with a badge. The badge is cleared when the popup opens (see popup.js)
    // and we set a backstop alarm so it can't get stuck even if the user
    // never opens the popup.
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    chrome.alarms.create(BADGE_CLEAR_ALARM, { delayInMinutes: 1 });
    sendResponse({ success: true });
    return false;
  }

  if (request.action === 'clearBadge') {
    chrome.action.setBadgeText({ text: '' });
    chrome.alarms.clear(BADGE_CLEAR_ALARM);
    sendResponse({ success: true });
    return false;
  }

  return false;
});

// ========================================
// ALARM HANDLER
// ========================================

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BADGE_CLEAR_ALARM) {
    chrome.action.setBadgeText({ text: '' });
  }
});
