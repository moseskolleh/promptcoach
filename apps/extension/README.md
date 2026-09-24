# EcoPrompt Coach — Chrome Extension (v2)

Live environmental feedback for AI chat, in everyday units.

- **On-page pill** on ChatGPT, Claude, Gemini, Copilot, Mistral, DeepSeek,
  Perplexity, Poe, and Grok: an eco-grade letter (A–E) plus a relatable
  energy line ("3% of a phone charge") for the prompt you're drafting,
  updating as you type. Click it for the full card: energy, water, carbon,
  courtesy-trim savings, and the top coaching tips.
- **Model detection.** The pill reads the page's model switcher ("ChatGPT 5
  Thinking", "2.5 Pro", an active DeepThink toggle) and estimates for the
  model you actually selected — the card says "(detected on page)" when it
  did. If the switcher can't be read, the site's default model is assumed.
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
| `background.js` | badge service worker |
| `settings.html/css/js` | options page |
| `shared/defaults.js` | user-setting defaults shared by all three surfaces |
| `vendor/` | synced copy of `packages/core` (engine + data) — **do not edit here** |
| `assets/` | icons |

## Updating the engine or data

Edit `packages/core` at the repo root, run its tests, then re-sync:

```bash
npm test                      # from repo root
node scripts/sync-core.js     # refreshes vendor/ in extension and web app
```

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
