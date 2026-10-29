# EcoPrompt Coach — Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      packages/core                          │
│  calculator.js   per-token energy fit, water, carbon,       │
│                  grades, comparison, aggregation            │
│  analyzer.js     tokens, task detection, courtesy trimming, │
│                  zero-AI alternatives, coaching tips        │
│  conversions.js  relatable everyday equivalents             │
│  present.js      grade palette, figures, labels, requests,  │
│                  quick grades, coach tip actions            │
│  data/           models.json · grids.json · equivalents.json│
│                  precomputed.json (generated coefficients)  │
│  test/           node --test (engine + analyzer)            │
└──────────────┬───────────────┬───────────────┬──────────────┘
               │ core bundle   │ core bundle   │ npm workspace
               ▼               ▼               ▼
      apps/extension       apps/web        apps/mobile
      Chrome MV3           static SPA      Expo RN (skeleton)
      popup + content      no build step   shares core directly
      script + badge
```

## Design decisions

1. **One engine, three surfaces.** All numbers come from `packages/core`.
   `node scripts/sync-core.js` builds one `vendor/core.bundle.js` for the
   extension and the web app: the core's scripts, its data inlined, and each
   model's coefficients precomputed (`data/precomputed.json`). It is
   committed, so both work out of the box with no build step, and no surface
   fetches data or fits a model at start-up (PLAN.md Step 13). The mobile
   app imports the package directly through the npm workspace, and
   `createDefaultEngine` starts from the same precomputed coefficients. CI
   fails when the bundle or the coefficients are stale.

   What the surfaces show is shared too: `present.js` holds the grade
   palette, the formatters and their one rounding rule, an estimate's
   labels, the `estimateImpact` request built from a surface's inputs,
   quick per-model grades and the coach's tip actions. `check-apps` refuses
   an app that maps grades to colours or rounds with `toFixed()` itself,
   and holds the CSS `--grade-a…e` properties equal to core's palette.

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
   It also checks that every model id hard-coded in an app or in the core
   exists in the catalog. `scripts/check-catalog.js` gates the catalog itself:
   release dates, per-fact sources, the citation deny-list and
   `superseded_by` chains (PLAN.md Step 9, docs/CATALOG-REFRESH.md).

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
2. On send, it messages `background.js` with a v2 history row: the send's
   inputs (model, effort, task type, token counts, region) and the figures
   they gave, never its text (`shared/history.js`).
3. `background.js` is history's only writer. One queue appends each row to
   that day's key (`h:2026-10-27`) and updates the day's totals in
   `agg:daily`, so tabs can't overwrite each other's sends. It updates the
   badge from today's totals, drops rows past the retention setting (totals
   stay), and re-scores stored rows with the current catalog on request.
4. `popup.js` reads `agg:daily` alone for the Impact tab, reads the rows only
   to export them (CSV/JSON), and runs the full coach/compare flows on
   demand.

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
