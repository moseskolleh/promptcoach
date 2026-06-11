# EcoPrompt Coach — Web App (v2)

The standalone, responsive coach: analyze a prompt, see its energy, water,
and carbon cost in everyday units, compare models, browse the model
explorer, and keep a local prompt library. Static site — no build step, no
backend, no tracking; everything runs in the browser.

## Run locally

```bash
# from the repo root (any static server works)
npx serve apps/web
# or
python3 -m http.server -d apps/web 8000
```

Then open the printed URL. Opening `index.html` via `file://` won't work —
the app fetches its data files (`vendor/data/*.json`), which browsers block
from the filesystem.

## Deploy

Any static host. Examples:

- **GitHub Pages**: point Pages at the repo and serve `apps/web` (or copy
  the directory contents to a `gh-pages` branch root).
- **Vercel / Netlify**: project root `apps/web`, no build command, output
  directory `.`.

## Sections

Hero (live computed example facts) · Coach · Compare · Model explorer ·
Library (localStorage, JSON import/export) · Methodology digest · Footer.

## Updating the engine or data

`vendor/` is a synced copy of `packages/core` — never edit it directly:

```bash
npm test                      # from repo root
node scripts/sync-core.js     # refreshes vendor/ in web app and extension
```
