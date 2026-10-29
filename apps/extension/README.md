# EcoPrompt Coach — Chrome Extension (v2)

Live environmental feedback for AI chat, in everyday units.

- **On-page pill** on ChatGPT, Claude, Gemini, Copilot, Mistral, DeepSeek,
  Perplexity, Poe, Grok and Meta AI: an eco-grade letter (A–E) plus a relatable
  energy line ("3% of a phone charge") for the prompt you're drafting,
  updating as you type. Click it for the full card: energy, water, carbon,
  courtesy-trim savings, and the top coaching tips.
- **Model detection.** The pill reads the page's model and mode pickers
  ("Opus 5.5", ChatGPT's "Extra High", Grok's "Heavy") and estimates for
  the model and effort you actually selected — the card says "(detected on
  page)" when it did. If the picker can't be read, the site's default model
  is assumed and the card says so. A model newer than the catalog is never
  read as an older one, and a site whose models aren't in the catalog yet
  (DeepSeek, Perplexity) shows no estimate rather than another lab's.
- **Popup** with three tabs: **Coach** (analyze any prompt, copy a trimmed
  version), **Compare** (up to 4 models side by side with a "switch and
  save" banner), and **Impact** (your personal dashboard: today / week /
  all-time totals, 7-day chart, grade streak, CSV/JSON export of every
  recorded query).
- **Badge** shows today's query count, colored by your day's average grade.
- **Settings** (options page): default model, electricity region (affects
  carbon), reasoning-effort assumption, pill on/off, embodied-carbon toggle.

Everything runs locally; prompts never leave your machine.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this `apps/extension` directory
4. Open chatgpt.com (or any supported site) and start typing

## File map

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest |
| `content.js` / `content.css` | on-page pill + detail card, send detection, history recording |
| `popup.html/css/js` | Coach / Compare / Impact tabs |
| `background.js` | service worker: history's only writer, and the badge |
| `settings.html/css/js` | options page |
| `shared/defaults.js` | user-setting defaults shared by all surfaces |
| `shared/days.js` | calendar days for history buckets and the badge |
| `shared/history.js` | history v2: row shape, day keys, daily totals, the single writer, re-scoring |
| `shared/watch.js` | cheap page watching for the content script: idle scheduling with a max wait, bounded text reads, a move watcher |
| `sites/<host>.json` | one adapter per supported site: where its composer, send button, turns and picker are, and when that was last checked |
| `sites/adapters.js` | generated from `sites/*.json` by `scripts/sync-sites.js` — **do not edit here** |
| `shared/sites.js` | adapter lookup, send-button test, send confirmation, the popup's Attached / Not attached line |
| `vendor/core.bundle.js` | generated from `packages/core`: engine, data and precomputed coefficients — **do not edit here** |
| `assets/` | icons |

## Updating the engine or data

Edit `packages/core` at the repo root, run its tests, then re-sync:

```bash
npm test                      # from repo root
node scripts/sync-core.js     # rebuilds vendor/core.bundle.js in extension and web app
```

## Updating a site adapter

When a chat site changes its page, edit its `sites/<host>.json`, check it on
the live site, set `lastVerified` to that day, then rebuild:

```bash
node scripts/sync-sites.js    # checks every adapter, rebuilds sites/adapters.js
npm test                      # fails if adapters.js is stale or an adapter is malformed
```

Each adapter holds:
- `composer`, `sendButton`, `stopButton`, `userMessage`, `assistantMessage`,
  `picker` and `effortToggle`, as CSS selectors (null where unknown);
- `insertStrategy`: `value`, `insertText` or `paste`, for Step 23's Apply;
- `lastVerified`: null until someone has checked it on the site.

A selector that matches nothing is never fatal. The generic heuristic takes
over and the popup says **Not attached**, naming the adapter. Only the demo
adapter is verified so far: the real sites' selectors are written from what
is publicly known of their pages and wait for a check on the live sites.

## Release vs dev manifest

`manifest.json` is the **release** manifest and deliberately contains no
`localhost`, `127.0.0.1` or `github.io` host matches. Dev-only host permissions
in a published build are a standard "permission not necessary for the stated
purpose" rejection trigger on the Chrome Web Store, and they widen the
extension's reach past what its description claims.

`manifest.dev.json` is the same manifest plus those three hosts, so the
[demo playground](../demo/) and a local `npx serve` still work while developing.
To use it, copy it over `manifest.json` in a scratch copy of this directory
before Load unpacked — never commit that swap.

`manifest.json` also declares `browser_specific_settings.gecko`
`data_collection_permissions: {required: ["none"]}`. That is required for new
addons.mozilla.org submissions, and for this extension it is simply true: every
calculation runs locally and no prompt text leaves the device.
