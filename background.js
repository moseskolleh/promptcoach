// EcoPrompt Coach - Background Service Worker
// Handles background tasks and extension lifecycle

// Extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('EcoPrompt Coach installed successfully');

    // Set default values
    chrome.storage.local.set({
      defaultModel: 'gpt-4o',
      trackingEnabled: true,
      queriesAnalyzed: 0
    });
  } else if (details.reason === 'update') {
    console.log('EcoPrompt Coach updated');
  }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'calculateImpact') {
    // Handle impact calculation requests
    sendResponse({ success: true });
  } else if (request.action === 'getStats') {
    // Return usage statistics
    chrome.storage.local.get(['queriesAnalyzed'], (result) => {
      sendResponse({ queriesAnalyzed: result.queriesAnalyzed || 0 });
    });
    return true; // Keep message channel open for async response
  }
});

// Optional: Track queries analyzed
function incrementQueryCount() {
  chrome.storage.local.get(['queriesAnalyzed'], (result) => {
    const count = (result.queriesAnalyzed || 0) + 1;
    chrome.storage.local.set({ queriesAnalyzed: count });
  });
}
