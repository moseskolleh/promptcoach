# EcoPrompt Coach — Chrome Extension (v2)

Live environmental feedback for AI chat, in everyday units.

- **On-page pill** on ChatGPT, Claude, Gemini, Copilot, Mistral, DeepSeek,
  Perplexity, Poe, and Grok: an eco-grade letter (A–E) plus a relatable
  energy line ("3% of a phone charge") for the prompt you're drafting,
  updating as you type. Click it for the full card: energy, water, carbon,
  courtesy-trim savings, and the top coaching tips.
- **Popup** with three tabs: **Coach** (analyze any prompt, copy a trimmed
  version), **Compare** (up to 4 models side by side with a "switch and
  save" banner), and **Impact** (your personal dashboard: today / week /
  all-time totals, 7-day chart, grade streak).
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
| `vendor/` | synced copy of `packages/core` (engine + data) — **do not edit here** |
| `assets/` | icons |

## Updating the engine or data

Edit `packages/core` at the repo root, run its tests, then re-sync:

```bash
npm test                      # from repo root
node scripts/sync-core.js     # refreshes vendor/ in extension and web app
```
