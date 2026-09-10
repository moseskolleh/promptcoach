# EcoPrompt Coach — Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      packages/core                          │
│  calculator.js   per-token energy fit, water, carbon,       │
│                  grades, comparison, aggregation            │
│  analyzer.js     tokens, task detection, courtesy trimming, │
│                  zero-AI alternatives, coaching tips        │
│  conversions.js  relatable everyday equivalents             │
│  data/           models.json · grids.json · equivalents.json│
│  test/           node --test (engine + analyzer)            │
└──────────────┬───────────────┬───────────────┬──────────────┘
               │ vendored copy │ vendored copy │ npm workspace
               ▼               ▼               ▼
      apps/extension       apps/web        apps/mobile
      Chrome MV3           static SPA      Expo RN (skeleton)
      popup + content      no build step   shares core directly
      script + badge
```

## Design decisions

1. **One engine, three surfaces.** All numbers come from `packages/core`.
   The extension and web app receive byte-identical vendored copies via
   `node scripts/sync-core.js` (committed, so both work out of the box with
   no build step); the future mobile app imports the package directly
   through the npm workspace.

2. **No build toolchain.** Core modules are plain scripts that attach to
   `window.EcoPromptCore` in browsers and export CommonJS in Node. This
   keeps the extension reviewable (Chrome Web Store likes that), makes the
   web app deployable to any static host, and keeps contributor friction
   near zero. Hand-written typings (`packages/core/src/index.d.ts`) let
   TypeScript consumers — the mobile app, or anyone embedding the engine —
   use it without a build step on our side.

   The browser apps have no unit tests of their own, so
   `scripts/check-apps.js` (part of `npm test` and the CI workflow) parses
   every script and JSON file, checks that the extension manifest and every
   HTML page reference files that exist, and cross-checks every element id a
   page's script looks up against the ids the page defines — the class of
   bug plain scripts wired to HTML actually ship.

3. **Data as citable benchmark points, math in code.** `models.json` stores
   the three published benchmark measurements per model — numbers you can
   trace to a paper — and the engine fits per-token coefficients at load
   time. Updating to a new paper revision means editing JSON, not code.

4. **Boundaries are explicit.** Water includes off-site generation water;
   carbon is location-based plus a 15% embodied uplift; every model is
   labeled measured/extrapolated/anchored; uncertainty bands widen on
   extrapolation. See METHODOLOGY.md §8.

5. **Privacy by default.** Everything runs client-side. Prompts never leave
   the device; history and the prompt library live in
   `chrome.storage.local` / `localStorage` / AsyncStorage. This is a
   feature for the enterprise story, not just a shortcut.

## Data flow (extension)

1. `content.js` watches the chat input on supported sites, estimates tokens
   as you type, detects the model from the page's model switcher (labels are
   mapped to catalog ids by `detectModelFromLabels` in core; the hostname
   default is the fallback), and renders the eco-grade pill.
2. On send, it appends `{ts, host, modelId, energyWh, waterMl, carbonG,
   grade}` to `eco_history` (capped at 5000 entries).
3. `background.js` updates the action badge from today's history.
4. `popup.js` reads the same history for the Impact tab (with CSV/JSON
   export) and runs the full coach/compare flows on demand.

## Startup roadmap (product view)

| Phase | Surface | Monetization hypothesis |
|---|---|---|
| Now | Extension + web (free) | Distribution + data on what people optimize |
| Next | Org dashboard: team aggregates, goals, Slack/Teams weekly recaps | Per-seat B2B — sustainability reporting (CSRD) tailwind |
| Then | API + SSO + per-tenant grid factors, verified provider integrations | Enterprise tier |
| Later | Mobile app (skeleton ready), procurement-grade model eco-labels | Marketplace/labeling partnerships |

The defensible asset is the **methodology + trust**: boundary-honest,
citable, continuously updated numbers in relatable language — while
provider-published figures stay scoped to flatter their own stacks.
