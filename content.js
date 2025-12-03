// EcoPrompt Coach - Content Script
// Runs on web pages to detect AI interfaces (future feature)

// This content script is currently minimal
// Future features could include:
// - Detecting ChatGPT, Claude, Gemini interfaces
// - Automatically analyzing prompts before submission
// - Injecting environmental impact badges into AI interfaces

console.log('EcoPrompt Coach content script loaded');

// Example: Detect if we're on an AI platform
function detectAIPlatform() {
  const hostname = window.location.hostname;

  if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
    return 'ChatGPT';
  } else if (hostname.includes('claude.ai') || hostname.includes('anthropic.com')) {
    return 'Claude';
  } else if (hostname.includes('gemini.google.com')) {
    return 'Gemini';
  }

  return null;
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'detectPlatform') {
    const platform = detectAIPlatform();
    sendResponse({ platform });
  }
});

// Future: Monitor AI query submissions
// This would require platform-specific DOM monitoring
