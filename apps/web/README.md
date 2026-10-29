# EcoPrompt Coach — Web App (v2)

The standalone, responsive coach: analyze a prompt, see its energy, water,
and carbon cost in everyday units, compare models, browse the model
explorer, and keep a local prompt library. Static site — no build step, no
backend, no tracking; everything runs in the browser.

**Live:** <https://moseskolleh.github.io/promptcoach/> (redeployed on every
push to `main` by `.github/workflows/deploy-pages.yml`).

## Run locally

```bash
# from the repo root (any static server works)
npx serve apps/web
# or
python3 -m http.server -d apps/web 8000
```

Then open the printed URL. Opening `index.html` straight from disk
(`file://`) works too: the core bundle carries the data, so nothing is
fetched.

## Deploy

Any static host. Examples:

- **GitHub Pages**: point Pages at the repo and serve `apps/web` (or copy
  the directory contents to a `gh-pages` branch root).
- **Vercel / Netlify**: project root `apps/web`, no build command, output
  directory `.`.

## Sections

Hero (live computed example facts) · Coach · Compare · Model explorer ·
Library (localStorage, JSON import/export) · Methodology digest · Footer.

Coach tips are **one-click actionable**: "Trim it for me", "Add ≤100 words",
and "Switch to <greenest capable model>" apply the fix, report the measured
energy delta (with Undo), and update the grade live. Example-prompt chips
seed the textarea, **🔗 Copy link** produces a `#share?…` URL that reopens
with the same prompt and settings, a sticky mini-grade follows you while
scrolling, and the model explorer has search/provider/type filters plus
per-card add-to-compare.

## Updating the engine or data

`vendor/core.bundle.js` is generated from `packages/core` (the engine, its
data and the precomputed coefficients) — never edit it directly:

```bash
npm test                      # from repo root
node scripts/sync-core.js     # rebuilds the bundle in the web app and extension
```
