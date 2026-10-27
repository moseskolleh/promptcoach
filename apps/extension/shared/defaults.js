// EcoPrompt Coach — user-setting defaults.
// Single source of truth shared by the content script, the popup and the
// options page (each used to carry its own copy, which could drift).
// Loaded after vendor/calculator.js: the default model is core's.
'use strict';

(function (root) {
  const Core = root.EcoPromptCore;

  root.EcoPromptDefaults = Object.freeze({
    // The one default model every surface starts from (PLAN.md Step 7).
    defaultModel: Core.DEFAULT_MODEL_ID,
    regionKey: 'default',
    reasoningEffort: 'standard',
    showPill: true,
    includeEmbodied: true,
    // History (PLAN.md Step 11): record sends at all, sites paused
    // entirely, and how many days of individual rows to keep (0: all).
    // Daily totals are always kept.
    recordHistory: true,
    pausedSites: Object.freeze([]),
    historyRetentionDays: 0
  });

  // Where a moved default model is noted until the popup or the options
  // page has said so once.
  const NOTICE_KEY = 'eco_notice_model';
  // The notice this page's own resolve() made, so showing it doesn't race
  // the storage write.
  let madeHere = null;

  root.EcoPromptSettings = Object.freeze({
    NOTICE_KEY,

    /**
     * Saved settings over the defaults. A saved default model that is no
     * longer current follows its superseded_by chain to a current one, or
     * takes the default when its line ended (PLAN.md Step 7). The move is
     * written back, with a notice for the popup or options page to show.
     */
    resolve(saved, engine) {
      const stored = saved && typeof saved === 'object' ? saved : {};
      const settings = { ...root.EcoPromptDefaults, ...stored };
      const move = engine.migrateModelId(stored.defaultModel);
      if (!move.changed) return settings;
      settings.defaultModel = move.modelId;
      const from = engine.getModel(move.from);
      madeHere = {
        from: from ? from.name : move.from,
        to: engine.getModel(move.modelId).name,
        via: move.via
      };
      try {
        chrome.storage.sync.set({ eco_settings: { ...stored, defaultModel: move.modelId } });
        chrome.storage.local.set({ [NOTICE_KEY]: madeHere });
      } catch (err) {
        /* storage unavailable: the move still applies in memory */
      }
      return settings;
    },

    /** The sentence for a notice resolve() left, or null. */
    noticeText(notice) {
      if (!notice || typeof notice.from !== 'string' || typeof notice.to !== 'string') return null;
      return notice.via === 'successor'
        ? `Your default model was updated from ${notice.from} to ${notice.to}, its current successor.`
        : `Your default model, ${notice.from}, has no current successor, so it is now ${notice.to}.`;
    },

    /** True when EcoPrompt is paused on this host, or on a domain above it. */
    isSitePaused(settings, host) {
      const sites = Array.isArray(settings && settings.pausedSites) ? settings.pausedSites : [];
      const h = String(host || '').toLowerCase();
      return sites.some((s) => typeof s === 'string' && s && (h === s || h.endsWith(`.${s}`)));
    },

    /** Show a pending notice once in the given element, then clear it. */
    showNotice(el) {
      const show = (notice) => {
        const text = this.noticeText(notice);
        if (!text) return;
        el.textContent = text;
        el.hidden = false;
        chrome.storage.local.remove(NOTICE_KEY);
      };
      if (madeHere) show(madeHere);
      else chrome.storage.local.get(NOTICE_KEY, (data) => show(data && data[NOTICE_KEY]));
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
