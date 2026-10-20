// EcoPrompt Coach — user-setting defaults.
// Single source of truth shared by the content script, the popup and the
// options page (each used to carry its own copy, which could drift).
'use strict';

(function (root) {
  root.EcoPromptDefaults = Object.freeze({
    defaultModel: 'gpt-6.1-sol',
    regionKey: 'default',
    reasoningEffort: 'standard',
    showPill: true,
    includeEmbodied: true
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
