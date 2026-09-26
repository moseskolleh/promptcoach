# EcoPrompt Coach — Build Plan v3

**From estimator to closed-loop coach.** A step-by-step plan: new features,
improvements and efficiencies, in the order to build them.

[`ROADMAP.md`](ROADMAP.md) is still the checklist for hygiene, distribution
and governance: licensing in `Context/`, privacy policy, store listing,
governance files. This plan covers **what to build next**. Where a step
overlaps with ROADMAP.md, it points there instead of repeating it.

Every figure about this codebase below was produced by running the engine or
measuring the code on 2026-09-25. None of them comes from reading docs alone.

---

## The idea

Every tool in this category, including this one today, is a *pre-send
estimator*. It guesses what a prompt will cost and hopes you care. It never
learns what actually happened. It can't do anything about it for you. And
it shows a single confident number even when it is extrapolating.

This plan turns EcoPrompt Coach into a **closed-loop coach**, built on three
moves that no one in the category combines:

| Move | Today | After this plan |
|---|---|---|
| **Measure, don't guess** | Output length is always a task-type guess. Each turn is scored as if it were the first message. | The coach watches the answer arrive. It counts real output tokens, tracks the whole conversation, and calibrates its guesses to *you*. The text never leaves the device. |
| **Act, don't advise** | In the extension, tips are text and "Trim" copies to the clipboard. | One click rewrites the prompt in the chat box. A budget dial caps answers. Simple arithmetic is answered in the pill at 0 Wh. |
| **Prove, don't assert** | Uncertainty and provenance live in the docs. | Every figure shows a range and a "why this number?" chain down to citations with verification status. Unknown models get an honest *floor*, never a sibling's number. |

A fourth move, **reach**, comes cheaply because the engine is zero-dependency
and already shared: npm + CLI, an SDK wrapper that uses *exact* token counts,
an MCP server so AI agents can check their own footprint, an installable PWA
with an Android share target, embeddable eco-labels, and a team dashboard
**with no server at all**.

---

## What the code told us

These findings define Stage 0 and justify Stage 1. Each one was confirmed
against the code at the line cited, and every figure comes from running the
engine.

**1. The biggest driver is never observed.** Response length drives energy
(r ≈ 0.9, METHODOLOGY §7). But every recorded footprint uses the task-type
guess in `analyzer.js:700-719`. Nothing watches the assistant's reply.

**2. Every turn is scored as if it were the first.** The extension counts only
the current draft as input (`content.js:408-432`). Resent conversation history
is ignored. With the engine's own fit and no provider caching:

| Turn in one chat (150 in + 400 out per turn) | gpt-5 per-turn energy | Grade | Share from input |
|---|---|---|---|
| 1 | 0.68 Wh | B | 2% |
| 20 | 1.83 Wh | C | 64% |
| 60 | 4.24 Wh | D | 84% |

Across 60 turns the engine models **148 Wh**. The extension would record
60 × 0.68 = **41 Wh**. That is an understatement, in the same direction
RESEARCH-2026 §1.1 spent a release fixing. Provider prompt caching lowers the
true figure by an unknown amount, so Step 11 reports a range, not a point.

**3. The best lever is one sentence away, and the extension can't pull it.**
Adding "answer in ≤100 words" to a typical 150-token prompt:

| Model | As typed | With "≤100 words" | Saving |
|---|---|---|---|
| GPT-5 | 0.68 Wh (B) | 0.32 Wh (**A**) | −53% |
| Claude Sonnet 5 | 0.96 Wh (B) | 0.50 Wh (B) | −49% |
| Gemini 2.5 Flash | 0.19 Wh (A) | 0.08 Wh (A) | −56% |

The web app already has one-click Trim, "≤100 words" and model-switch
actions with Undo (`app.js:392-442`). But the extension, which is where the
prompts actually get typed, has none. Its pill card has no action button
(`content.js:282-331`), and the popup's Trim copies to the clipboard
(`popup.js:247-266`).

**4. History stores results, not inputs.** Each entry is
`{ts, host, modelId, energyWh, waterMl, carbonG, grade}`
(`content.js:417-425`). There are no token counts, so history can never be
re-scored when the catalog improves. Every send reads and rewrites the whole
array of up to 5,000 entries (`content.js:426-431`). The last write wins
across tabs, and the oldest entries are silently dropped.

**5. The analyzer's hot path repeats itself.** Each `analyzePrompt` call scans
for protected spans up to five times (`analyzer.js:254, 409, 557, 624, 651`).
Measured on Node 22:

| Prompt size | ms per `analyzePrompt` |
|---|---|
| 216 chars | 0.17 |
| 2,160 chars | 0.74 |
| 21,600 chars | 6.4 |
| 86,400 chars (a pasted report) | **25.8**, over the 16 ms frame budget, inside someone else's page |

**6. Four live bugs in the extension, all verified:**
- **Listener leak.** `keydown` is added with `capture: true`
  (`content.js:468`) but removed without it (`content.js:463`). A detached composer keeps recording
  sends, using the *current* draft.
- **Fail-closed detection is bypassed.** An unknown generation returns
  `modelId: null` from selector group 1. The loop then falls through to group
  2, where loose patterns (a bare `5` → gpt-5, `pro` → gemini-2.5-pro) can
  match unrelated labels (`content.js:128-131`).
- **Popup grades use "low" effort.** Quick grades are computed while
  `#effort-select` still reads its first option, `low` (`popup.js:615-632`,
  `popup.html:36`). So **o3 shows D (5.6 Wh) instead of E (14 Wh)** and GPT-5
  Thinking shows C instead of D. That is an understatement again.
- **Stale badge.** There is no `chrome.alarms` (`background.js:73-74`), so
  after midnight the badge shows yesterday's count until the next send. Day
  buckets also use `today0 - i*86400000` (`popup.js:451`), which misfiles
  entries across DST changes.

**7. Honesty signals are computed but never shown.** The UI never surfaces
`energy.clamped`, `grade.provisional`, the confidence band, or
`isRoutedHost()`, which is never called. For Perplexity, Poe and Copilot the
pill shows a confident grade for a model it cannot see.

**8. "One engine, the numbers always agree" is already slipping.**
- The web Compare omits the task multiplier (`app.js:819-828`); the coach and
  the popup apply it. The same prompt gets two different numbers.
- The web coach clamps the output estimate to 25–2,000 tokens (`app.js:498`),
  but the analyzer legitimately returns 8 ("answer yes or no") or 2,667
  ("in 2000 words"). Long-answer prompts are understated.
- The default model differs: `gpt-4o-mini` in the web app, `gpt-4o` in
  `shared/defaults.js`.
- Grade colors are defined in five places. Engine start-up is written four
  times. The web formatters round differently from core's `conversions.js`.
- `analyzer.js` contains five literal NUL bytes (lines 111, 657, 692), so
  `grep` and `file` treat the engine's main source file as binary.

---

## How to read the steps

Steps are numbered in build order. Each has a size:
**S** ≈ ½–1 day · **M** ≈ 2–4 days · **L** ≈ 1–2 weeks (one developer).
Each ends with **Done when**, an acceptance test you can check.

> **In parallel with Stage 0, from ROADMAP.md:** 1.2 (check what is in
> `Context/` before it stays public), 2.1 (privacy policy), 0.3 (one version
> number + CHANGELOG). These don't block the code below. But 1.2 has a clock
> on it, and 2.1 blocks the store launch in Step 32.

---

## Stage 0 — Make the base trustworthy and fast *(≈ 3 weeks)*

Everything later writes to history, reads the page, or runs on every
keystroke. Fix those three things first.

### Step 1 — Fix the verified bugs · S
Extension:
- Remove the `keydown` listener with the same `capture` flag it was added
  with.
- In `pickerModel()`, stop at the first group that reports
  `unknownGeneration`. Don't fall through.
- Compute popup quick grades *after* the effort select is restored. Give the
  `standard` option `selected`.
- Add `chrome.alarms` for a midnight badge refresh. Build day buckets from
  calendar dates (`new Date(y, m, d - i)`), not millisecond offsets.
- While no composer is attached, hide the pill. Today it shows a green "A"
  for nothing (`content.js:251`).

Web app:
- Pass the task multiplier in Compare, so both surfaces agree.
- Drop the 25–2,000 clamp on the analyzer's output estimate. Widen the slider
  instead.
- Re-render Compare when the region or effort changes. Today it only
  re-renders on token changes (`app.js:561-570`).
- Include manually set output tokens in share links, and listen for
  `hashchange`.

**Done when:** each bug has a regression test. Unit tests land now; the
DOM-level bugs get Playwright tests when Step 7's harness lands.

### Step 2 — History v2: record inputs, not just results · M
- New entry shape: `{v:2, ts, host, modelId, modelSource, effort, taskType,
  inTokens, outTokensEst, outTokensObs, convKey, flags}`. Store numbers only,
  **never text**. `convKey` is a local salted hash of the conversation URL.
- Store entries in per-day keys (`h:2026-09-25`) with a rolling `agg:daily`
  summary. A send touches one small key, not a 5,000-entry array. Totals
  survive forever; raw rows can have a retention setting.
- Route all writes through the service worker (a `runtime.sendMessage`
  queue), so there is a single writer and tabs can't clobber each other.
- Add a **Re-score history** button that recomputes energy, water and carbon
  from stored inputs with the current catalog. Migrate old `eco_history`
  entries as `v:1` (derived-only, not re-scorable).
- Add a recording on/off switch and a per-site disable. Today, hiding the
  pill still records.
- Apply the same principle to the web library. Entries currently freeze
  energy and grade at save time and omit region and effort. Store inputs,
  re-estimate against current data, and add **Open in coach**.

**Done when:** 10,000 simulated sends across 3 tabs lose nothing. Re-scoring
after a catalog edit changes totals. The Impact tab reads `agg:daily` without
scanning raw rows.

### Step 3 — One analysis pass · M
- Add a `PromptContext` built once per call: masked text, protected spans,
  token count. Pass it to `detectTaskType`, `detectPoliteWords`,
  `detectOutputBudget`, `detectSpecialQueryType` and
  `generateOptimizedPrompt`. Keep the current signatures as wrappers so the
  public API doesn't break.
- Size tiers: count tokens on the full text, but run heuristics on the first
  and last 6k characters. Budgets usually sit at the end ("…in 3 bullets"),
  task verbs at the start.
- Add a perf-budget test to `npm test` with generous CI limits.
- Replace the five literal NUL placeholder bytes with `\u0000` escapes, so
  the file is text again for `grep`, `file` and diff viewers.

**Done when:** 1 span scan per analysis instead of 5; an 86k-char prompt takes
≤ 8 ms (from 25.8); every existing analyzer test still passes unchanged.

### Step 4 — One engine bootstrap, one presentation layer · M
- **Load once.** Every tab, the popup and the settings page each fetch three
  JSON files and re-fit coefficients for all 22 models
  (`content.js:502-509`, `popup.js:601-610`, `settings.js:47-54`). The web app
  hides the whole page until its three fetches finish, and fails on
  `file://`.
  - Make `scripts/sync-core.js` also emit `vendor/core.bundle.js`: the three
    modules, the data inlined as JS, and the **pre-computed coefficients**.
  - A test asserts that the pre-computed coefficients equal a fresh fit, so
    the bundle can never drift from the data.
- **Share the presentation layer.** Add `packages/core/src/present.js` for
  logic that is now copied across surfaces:
  - the grade palette (defined 5 times)
  - formatters, with one rounding rule
  - the impact-options builder
  - quick per-model grades
  - the default model
  - the tip actions the web app already has: trim, "≤100 words" and the
    greener-model switch (`app.js:392-442`). Step 14 then reuses them in the
    extension instead of re-implementing them.
- Settings stops loading the analyzer and conversions it doesn't use.

**Done when:** zero `fetch` calls and zero fits at start-up on every surface.
No grade color or formatter is defined outside core. The sync gate in CI
covers the bundle.

### Step 5 — A lighter runtime on every page · M
Content script:
- **Observer scope.** Watch the composer region, the model picker and the
  transcript container, not `document.body` with `subtree: true`
  (`content.js:528-529`).
- **Scheduling.** Use `requestIdleCallback` with a max-wait, so a streaming
  reply can't starve the scan forever with a trailing debounce.
- **Positioning.** Use `ResizeObserver` + `IntersectionObserver` instead of a
  forced layout on every captured scroll event (`content.js:531-543`).
- **Cheap reads.** Check a node's length before serializing its
  `textContent`. Today a large matched subtree is serialized and then thrown
  away (`content.js:110`).

Web app:
- `renderTips` runs `compareModels` over every model on each debounced
  keystroke (`app.js:417-430`).
- `renderCompare` rebuilds the cards, table and SVG and re-animates the bars
  whenever mirrored token counts change (`app.js:968-994`).
- The library parses `localStorage` twice per render.
- Fix: render only what changed, and keep keyed DOM nodes instead of
  clear-and-rebuild. That also fixes the focus loss noted in Step 36.

**Done when:** a Playwright trace of a 2,000-token streamed reply on the demo
shows no long tasks over 50 ms caused by the extension, and typing in the web
coach triggers no Compare re-render unless its inputs changed.

### Step 6 — Site adapters and attach health · M
- Add `apps/extension/sites/<host>.json`, declarative per-site config:
  - `composer`
  - `sendButton`
  - `assistantMessage` (needed by Step 9)
  - `stopButton`
  - `picker`
  - `effortToggle`
  - `insertStrategy` (needed by Step 14)
  - `lastVerified`
- The current generic heuristic (`content.js:181-232`) stays as the fallback.
  Add support for `contenteditable="plaintext-only"`.
- Send detection: confirm a send happened (the composer cleared and a new
  user turn appeared) before recording. Today, Enter inside a slash-menu or
  while a reply is streaming counts as a send, and "Send feedback" buttons
  match `/send|submit/`.
- The popup shows **Attached / Not attached on this site**, with the
  adapter's `lastVerified` date.

**Done when:** every supported host has an adapter file. A deliberately broken
selector shows "Not attached" instead of silently failing. No false records
from slash-menus, "Send feedback" or blocked sends in the demo tests.

### Step 7 — A test harness that matches the product · M
- **Playwright on `apps/demo`** in CI (ROADMAP 2.6): inject the content
  script, type, send, assert the pill, the history write and the receipt
  (once Step 10 lands).
- **Analyzer property tests**, over thousands of generated prompts:
  - Idempotence: optimizing an already-optimized prompt changes nothing.
  - Protected spans (code, quotes, URLs, numbers) survive byte-for-byte.
  - Optimizing never *adds* tokens.
  - A non-empty prompt never becomes empty.
- **Golden corpus.** Promote `apps/demo/examples.js` into a labeled corpus
  (expected task type, budget, zero-AI class). CI prints precision and recall
  for each detector, and fails on regressions.
- **DOM fixtures.** Save sanitized HTML snapshots of each real site's composer
  area. Adapter tests run against them offline. A scheduled canary job
  (ROADMAP 2.5) refreshes them and opens an issue when a selector stops
  matching.

**Done when:** `npm test` runs unit + property + corpus tests, a Playwright
job is green on Node 20/22, and the canary runs weekly.

### Step 8 — Data contracts and freshness gates · S
- Add a small hand-written schema validator to `scripts/check-apps.js`
  (keeping zero dependencies) for `models.json`, `grids.json` and
  `equivalents.json`.
- Freshness gates: the catalog fails CI at 90 days old (ROADMAP 0.1). Grids
  fail at 365 days: `grids.json` still reads `last_updated: 2026-06-10`
  (ROADMAP 4.4).
- One version source, checked across `package.json`, the manifests and the
  metadata (ROADMAP 0.3).
- `check-apps` also verifies that model ids hard-coded in `app.js` exist in
  the catalog.
- `sync-core` deletes vendored files that no longer exist in core. Today a
  renamed core file leaves a stale copy that the sync test can't see.
- CI hygiene:
  - Restrict `push` to `main`. PR branches currently run the whole matrix
    twice, once for `push` and once for `pull_request`.
  - Pin actions to commit SHAs and add Dependabot (ROADMAP 6.2).

**Done when:** a malformed model entry, an out-of-date catalog, a version
mismatch, an unknown hard-coded model id or a stale vendor file each fail CI
with a clear message.

---

## Stage 1 — Close the loop: measure what actually happened *(≈ 4–5 weeks)*

This is the signature stage. After it, EcoPrompt Coach is the only tool that
can say what *your* answer actually cost, not what an average answer might.

### Step 9 — Response observer · L
- After a confirmed send, the adapter's `assistantMessage` selector finds the
  new reply node. The observer tracks its text length until it is stable: no
  mutation for 1.5 s, and the stop button is gone.
- It converts the length to tokens with `estimateTokens` (the same ±12%
  calibration as prompts). The count goes to the service worker as
  `outTokensObs`. **The text is never stored or sent anywhere.**
- Treat **Regenerate / Try again** and edited-message resends as new turns.
  They are real costs the extension misses today.
- Where a site shows reasoning time ("Thought for 34s"), record the duration
  as `thinkSeconds`. It is a signal for effort detection (Step 23), not an
  energy input yet.

**Done when:** in the demo playground, observed output tokens are within ±15%
of the mock reply's true token count, and a regenerate creates a second
entry.

### Step 10 — Receipts · M
- When the reply finishes, the pill flips to a **receipt** for a few seconds:
  > *This answer: 1,140 tokens · 1.7 Wh · C. That's 3.3× the estimate. A
  > "≤150 words" cap would have been about 0.4 Wh.*
- In the popup, the Impact tab gets **estimated vs observed**, per site and
  per task type.
- Receipts are the proof surface every later step reports into.

**Done when:** every recorded turn with an observed reply shows a receipt, and
the Impact tab separates observed from estimated energy.

### Step 11 — Conversation meter · L
- Track each conversation by `convKey`. Accumulated context is the sum of
  earlier turns' input and observed output tokens.
- New engine API:
  `estimateTurn({modelId, newInputTokens, contextTokens, outputTokens, cache})`.
  It returns a **range**:
  - Lower bound: context tokens discounted as if cached.
  - Upper bound: fully re-processed.
  - The existing input clamp still applies.
- The pill shows *"Turn 38: this message costs up to 4.3× your first one
  (less if the provider caches context)."*
- Past a threshold (context > 20k tokens, or turn cost ≥ 3× turn 1), it offers
  **Start fresh with a carry-over summary**. One click inserts "Summarize our
  conversation so far in ≤150 words so I can continue in a new chat." The
  receipt then shows the saving against continuing.
- Add METHODOLOGY §2.4 *Multi-turn context*: what is modeled, the caching
  caveat, and why it is a range.

**Done when:** a scripted 40-turn demo conversation shows turn costs rising,
the METHODOLOGY section exists, and the engine's tests cover both bounds and
the clamp.

### Step 12 — Self-calibrating output estimates · M
- For each (site family × task type), keep a robust running estimate of
  `log(observed / estimated)`: a clipped EWMA, active after 5 samples.
- Apply it to future pre-send estimates, labeled *"calibrated to your last 23
  answers"*. Add a reset button.
- Show local accuracy: median absolute error of the output estimate, before
  vs after calibration.
- The weakest input in the whole model becomes a personal measurement, and
  no data leaves the device.

**Done when:** on a synthetic history where one site answers 2× longer than
the prior, the calibrated error falls below 20% within 10 turns.

### Step 13 — Honest numbers everywhere · S
- Surface what the engine already computes:
  - `energy.clamped` becomes "at least …"
  - `grade.provisional` becomes "≥ C"
  - The confidence band is always visible.
  - Routed hosts show "router: model not visible, showing site default".
- The badge and totals prefer observed values where they exist.

**Done when:** no UI path shows a clamped or routed figure without its label.

---

## Stage 2 — Act, don't just advise *(≈ 3–4 weeks)*

Partner feedback ranked this concept #1 for one reason: it is actionable
(legacy PLAN-v1 §11). Right now the actions stop at advice.

### Step 14 — One-click Apply in the chat box · M
- The pill card gets an **Apply** button. It writes the optimized prompt
  (courtesy trimmed, plus an optional budget line) into the host's composer
  using the adapter's `insertStrategy`:
  - `<textarea>`: the native value setter + an `input` event.
  - ProseMirror/Quill `contenteditable`: select-all, then
    `insertText` or a `beforeinput` InputEvent.
- An **Undo** toast restores the original. Every Apply is logged as a
  counterfactual: the original estimate vs the applied estimate.
- The action logic comes from core's presentation layer (Step 4), which is
  the web app's existing trim, budget and model-switch actions moved there.
  Add the actions no surface has yet:
  - "halve the length" for `output_budget_long`
  - the instant answer for `special_query` (Step 16)

**Done when:** Apply + Undo round-trip exactly on all three demo pages and on
the DOM fixtures of each real site. The host's own send button still works
after Apply.

### Step 15 — Budget Dial · M
- An opt-in, per-site dial: **Off · Brief (≤100 words) · Standard (≤250) ·
  Detailed**.
- When on, the budget line is inserted into the composer *before* send, where
  the user can see and edit it. There are no hidden edits.
- It skips prompts that already carry a budget (`detectOutputBudget`), fenced
  code, and translations.
- Receipts measure its real effect: median observed output with the dial vs
  without.

**Done when:** the dial is off by default, never double-budgets, and the
Impact tab reports its measured saving from receipts.

### Step 16 — Instant zero-AI answers · M
Today, zero-AI detection tells you to open a calculator. Instead, **be** the
calculator:
- A safe expression parser (shunting-yard, **no `eval`**) handles:
  - arithmetic and percentages ("15% of 84.50")
  - unit conversion: length, mass, volume, temperature, speed, data size
- Time and date in a named city via `Intl.DateTimeFormat` with a bundled
  city → IANA timezone table.
- The answer appears in the pill: **"= 12.68 · no AI needed · 0 Wh"**.
  Weather and places stay as link-outs, because live data needs a network
  call.
- Widen detection. For example, "how many km is 26.2 miles" is currently
  missed (verified: `detectSpecialQueryType` returns null).
- Every instant answer counts as a fully avoided query in the savings ledger
  (Step 19).

**Done when:** the golden corpus's zero-AI cases are answered correctly
offline, with a fuzz test proving the parser never executes input.

### Step 17 — Set-once brevity · S
- A guided card: *"Add one line to ChatGPT Custom Instructions / Claude
  profile preferences / Gemini saved info."* It has a copy button and a link
  to each site's settings page.
- It is the single highest-leverage action in the product: one minute of
  setup that shortens **every future answer**, with no effort per prompt.
- Receipts prove it. Compare median observed output over the 10 answers
  before and the 10 after: *"Your answers got 38% shorter since you set
  this."*

**Done when:** the card appears once, after 10 observed answers, and the
before/after comparison works on synthetic data.

### Step 18 — Right-size at send time · M
- When the task is a small-model task (summarization, translation, factual
  Q&A) and the selected model is frontier or reasoning, the pill says:
  *"Gemini Flash does this for about 70% less."*
- When Thinking is on for a simple prompt: *"Thinking is on. This prompt
  probably doesn't need it (≈ 11× the energy)."*
- Once Step 24 lands, recommendations carry a quality note, so the coach
  never suggests a model that is off the quality frontier.

**Done when:** each suggestion's claimed saving equals the engine's comparison
for the same tokens, and the suggestions are silent for code and agentic
tasks.

### Step 19 — Savings ledger, goals and weekly recap · M
- Count savings **only from measured actions**: Apply, the Budget Dial, zero-AI
  answers, and brevity setup (from receipts). Never from assumed behavior.
- Report savings in everyday units: *"You've avoided 3.1 phone charges this
  month."*
- An optional weekly goal in everyday units ("≤ 2 kettles a week"), and an
  opt-in local weekly recap with `chrome.notifications`, using the existing
  `forTotals()` sentence.

**Done when:** the ledger's total reconciles exactly with the sum of logged
counterfactuals, and turning actions off stops the ledger from growing.

---

## Stage 3 — Prove, don't assert *(≈ 6 weeks)*

`docs/ARCHITECTURE.md`: *"The defensible asset is the methodology + trust."*
This stage makes that asset visible in the product, not only in the docs.

### Step 20 — Evidence ledger · M
- Add `packages/core/src/data/citations.json`. Each entry has an `id`,
  authors, url, version, `status` (`fetched` · `search-only` · `unverified` ·
  `refuted`), `boundary` and `checked_on`.
- Every numeric source field in `models.json`, `grids.json` and
  `equivalents.json` references citation ids instead of free text.
- `check-apps` fails if a shipped value rests on an `unverified` or `refuted`
  citation, or on any arXiv id in the RESEARCH-2026 §3.1 deny-list. That
  deny-list becomes code, not a paragraph.
- A **"Why this number?"** drawer (web, popup and pill card) shows the chain:
  benchmark points → fitted coefficients → infrastructure factors →
  citations, each with its verification status.

**Done when:** every number in the UI can be traced to a citation id with a
status, and adding a deny-listed id fails CI.

### Step 21 — Uncertainty engine · L
- `estimateDistribution()` runs a seeded quasi-Monte-Carlo (about 512 Halton
  points, deterministic) over:
  - benchmark std (lognormal)
  - PUE/WUE/CIF ranges from the citations
  - a **batching/utilization factor**: RESEARCH-2026 §2.4 found batch size
    moves per-request energy 12–17×, and today's bands don't span that
  - token-count error (±12% prose / ±18% code)
  - output-estimate error, from Step 12's calibration
- It returns P10/P50/P90 and a **variance attribution**: *"Most of this
  uncertainty is how busy the provider's servers were."*
- UI: ranges everywhere. When the range crosses a band, the grade becomes a
  range ("B–C").

**Done when:** P50 matches `estimateImpact` within 5% at the benchmark points,
a call takes ≤ 2 ms (results cached per model × token bucket), and the
attribution sums to 100%.

### Step 22 — Floors, not guesses, for unknown models · M
- When detection reports `unknownGeneration` (Opus 5.5, Fable 5.1, GPT-5.x,
  Gemini 3, Grok 4), show a **floor** instead of substituting the host
  default. For example: *"At least 0.96 Wh (≥ B). Opus 5.5 isn't in the
  catalog. This is Sonnet 5's figure, and Opus is larger, with thinking
  always on."*
- It reuses the "lower bound" semantics `energy.clamped` already has, keeping
  the RESEARCH-2026 §4.1 rule: no point estimate seeded from a smaller
  sibling.

**Done when:** every unknown-generation label in the detection test table
produces a floor with "≥" grading, and none produces a point estimate.

### Step 23 — Effort as a continuum · S
- Map each provider's effort vocabulary to documented effort factors. For
  example, Anthropic's Low/Medium/High/Extra high/Max (RESEARCH-2026 §2.1)
  and OpenAI's reasoning effort. Interpolate between the three measured
  tiers, and widen the bands off-tier.
- Detect the selected effort through the adapters' `effortToggle`.

**Done when:** the effort factor is monotonic across each vocabulary and each
level is covered by a test.

### Step 24 — Quality-aware right-sizing · L
- The partner concern from the original research, verbatim: *"Trade-off
  between efficiency and result quality — make it transparent"* (legacy
  PLAN-v1 §11). The product still recommends smaller models with no quality
  signal.
- Add `quality.json`: per-model quality scores from a source whose licence
  permits redistribution. Jegham et al. v6 publishes a DEA eco-efficiency
  ranking. Verify the table and its licence before importing, and ship
  nothing if either is unclear.
- The Compare tab gets an **energy × quality frontier** chart.
  Recommendations become *"the cheapest model within N points of the best
  for this task type"*, and the coach never recommends a model off the
  frontier.

**Done when:** every model recommendation in the product sits on the frontier,
and the quality source is a `fetched` citation in the Step 20 ledger.

### Step 25 — Validation study · L
ROADMAP 4.2, made concrete:
- Measure the open-weight entries (Llama 3.2 1B, Llama 3.3 70B) at the three
  benchmark shapes on a rented GPU with NVML/Zeus. Publish the raw data and
  scripts in `validation/`.
- Compare the engine's predictions. Cross-check against EcoLogits at
  `T_in ≈ 0`, where the two should converge (RESEARCH-2026 §5.5).
- Add `CITATION.cff` and a Zenodo DOI per release (ROADMAP 4.1).

**Done when:** `docs/VALIDATION.md` reports predicted vs measured with error
bars, and the release has a DOI.

### Step 26 — Research refresh with an open network · S, recurring
- RESEARCH-2026 §6: the last round failed because arXiv, ScienceDirect,
  Hugging Face and the hyperscaler domains were blocked. Widen the
  environment allowlist, then work through §5 open questions 1–4:
  - read the Joule paper and record its boundary
  - resolve the 15 unverified arXiv ids
  - read the four sustainability PDFs
  - survey the live model pickers
- Repeat quarterly, on the cadence ROADMAP 0.2 asks to be published.

**Done when:** each open question has a `fetched` citation or is recorded as a
negative result.

---

## Stage 4 — Reach: the same engine, new surfaces *(≈ 3–4 weeks)*

The engine has no dependencies, is typed and tested. Each surface below is
mostly packaging.

### Step 27 — `@ecoprompt/core` on npm, plus a CLI · M
- `exports` map with CJS and a thin ESM wrapper (no build step), and the
  existing `index.d.ts`.
- `npx ecoprompt "your prompt" --model gpt-5` prints the card; `--json` for
  scripts.

**Done when:** `npm i @ecoprompt/core` works in Node, Deno and a bundler, and
the CLI output matches the web app for the same input.

### Step 28 — SDK footprint wrapper · M
- `withFootprint(client)` wraps the OpenAI and Anthropic JS SDKs. It reads the
  **real** `usage` block (input, output, cached and reasoning tokens) from
  every response, so there is no estimation at all on the token side.
- Emits a per-call footprint and session totals. Adds a CSV analyzer for
  provider usage exports.
- Developers are where query volume is. This is also the natural bridge to
  the paid, organization-level story.

**Done when:** a recorded fixture of real SDK responses produces footprints
identical to calling `estimateImpact` with the same usage numbers.

### Step 29 — MCP server · M
- `packages/mcp` exposes `estimate_footprint`, `coach_prompt`,
  `compare_models` and `explain_number` over stdio.
- Coding agents and assistants can check the footprint of a plan before
  running it, and report what a session cost. *Agents that know their own
  footprint* is a new category.

**Done when:** every tool works in the MCP Inspector, and one documented
client config works end to end.

### Step 30 — PWA with a share target, replacing the React Native app · M
- Add `manifest.webmanifest`, a service worker (fully offline, since the
  engine is local) and `share_target`. On Android, **Share → EcoPrompt Coach**
  from the ChatGPT or Claude app lands the text in the coach.
- On iOS, a published Shortcut opens the web app with the shared text.
- This delivers the one unique mobile capability ROADMAP 3.2 identified (share
  sheet intake) at a fraction of the cost of two native store pipelines. Move
  `apps/mobile` to `docs/legacy/` with a note explaining why.

**Done when:** the PWA passes Chrome's installability criteria, sharing text on
Android opens the coach pre-filled, and the app works in airplane mode.

### Step 31 — Embeddable eco-labels · S
- The Pages deploy renders `labels/<model>.svg`, EU-energy-label style: the
  grade at a typical prompt, the range, `data_source` and the catalog
  vintage. It comes with a copy-paste badge snippet.
- Static files with no tracking, for bloggers, docs and procurement.

**Done when:** every catalog model has a label regenerated on each deploy, and
a snapshot test guards the SVG.

### Step 32 — Store launches · M
- ROADMAP 2.1–2.4: Chrome, then Edge and Firefox.
- Launch *after* Stage 0 and Steps 9–10, so the first reviewers see receipts,
  the feature nobody else has, rather than just a grade pill.

**Done when:** the extension is listed in the Chrome Web Store with the
privacy policy URL.

---

## Stage 5 — Teams without a server *(≈ 1–2 weeks)*

ROADMAP 5.2 names the tension: a team dashboard seems to need data to leave
the device, which ARCHITECTURE §5 promises never happens. The answer is to
not build a server.

### Step 33 — Aggregate-only team file · S
- **Export team file** writes a weekly summary: totals by grade, model family
  and site, plus counted savings. It contains no text, no per-prompt rows and
  no timestamps finer than a day. It has a schema version and a content
  hash.
- Document it in METHODOLOGY as *the aggregation boundary*: exactly what
  leaves the device, field by field.

**Done when:** the file schema is published and a test proves no text field
can appear in it.

### Step 34 — Zero-backend team dashboard · M
- A web-app page where a team lead drops in *N* team files and gets team
  totals, trends, savings and a sustainability-report-ready CSV.
- It runs entirely in the browser: no server, no accounts, no data custody.
  Per-person views are hidden below 5 members.
- An organization gets the whole reporting story with zero infrastructure,
  and the privacy claim stays intact.
- **Personal mode** falls out for free: drop in your own extension export
  and get a full-history dashboard. Today the web app has no history view at
  all.

**Done when:** 20 synthetic team files aggregate correctly offline, and
per-person rows never render for teams smaller than 5.

### Step 35 — Hosted relay only on demonstrated demand · gate
Build an optional relay (aggregates only) + SSO **only if** several teams use
Step 34 by hand for 4+ weeks. That is the monetization test for the
ARCHITECTURE "Next" row, run without writing a backend first.

---

## Stage 6 — Polish that compounds *(ongoing, ≈ 2 weeks total)*

### Step 36 — Accessibility · M
Fixes for what the audit found:
- **Color contrast.** The grade badge puts white text on grade B's `#84CC16`
  at about 2:1 contrast (`styles.css:529-535`), far below WCAG AA's 4.5:1.
  Grade C and the primary green buttons fail too. Grades A and B also share
  the same 🟢 dot in the model select (`app.js:72`). Give grades a non-color
  channel too: the letter plus a pattern.
- **Live regions.** The whole results panel and the compare table are
  `aria-live`, so screen readers re-read everything after each keystroke.
  Announce one summary line instead.
- **Carousel.** The hero carousel rotates every 5.5 s with no pause control
  and ignores reduced-motion settings. Add a pause and respect
  `prefers-reduced-motion`.
- **Keyboard and focus.**
  - Focus is lost when tip buttons or library cards are rebuilt (fixed by
    Step 5's keyed rendering).
  - The modal needs a focus trap.
  - The effort radiogroup needs arrow-key support.
  - Add a skip link.
  - The Undo toast needs to stay up longer than 5.2 s.
- The extension pill updates through `aria-live="polite"`, and its card is
  fully keyboard-operable.
- Add axe checks to the Playwright job (ROADMAP 5.3).

### Step 37 — Localized equivalents and i18n · M
Relatable units are cultural: "kettle" lands in the UK, "microwave" in the
US, and miles or kilometers depends on the reader.
- Add a string catalog and locale-aware equivalents.
- Start with Dutch (the project's Digital Society School / Ministry of
  Finance origin), then Spanish, French and German.
- CJK tokenization is already handled.

### Step 38 — Share cards · S
- A user-initiated PNG of the weekly recap, rendered on a canvas.
- Open Graph and Twitter tags, so a shared coach link unfurls as a card. The
  web app has neither today.
- Growth that doesn't need telemetry (ROADMAP 5.1).

---

## Efficiency ledger

Measurable targets from the steps above. The baselines were measured on
2026-09-25.

| What | Today | Target | Step |
|---|---|---|---|
| `analyzePrompt` on an 86k-char paste | 25.8 ms | ≤ 8 ms | 3 |
| Protected-span scans per analysis | up to 5 | 1 | 3 |
| Start-up work per tab | 3 JSON fetches + 22 model fits | 0 fetches, 0 fits | 4 |
| Web app first paint | blocked on 3 fetches; fails on `file://` | immediate; works offline | 4, 30 |
| UI logic copied across surfaces | grade colors ×5, engine start-up ×4 | defined once, in core | 4 |
| Web re-renders per keystroke | tips + Compare cards, table, chart re-animated | only what changed | 5 |
| Storage write per send | whole array (≤ 5,000 entries) | one day-bucket key | 2 |
| History beyond 5,000 sends | silently dropped | daily roll-ups, lossless totals | 2 |
| Page observation | `document.body` subtree, trailing debounce | composer + picker + transcript, idle-scheduled | 5 |
| Pill positioning | forced layout on every scroll frame | Resize/IntersectionObserver | 5 |
| Output-length accuracy | a task-type guess | observed; pre-send guesses calibrated per user | 9, 12 |
| CI runs per PR push | 2× the matrix (`push` + `pull_request`) | 1× | 8 |

---

## Deliberately not doing

Recorded so that nobody has to re-argue these later.

- **Telemetry or analytics.** Receipts and calibration stay on the device.
  The privacy claim is worth more than the data (ROADMAP 5.1).
- **Carbon-aware "send it later".** A chat user can't choose the provider's
  serving region. Live grid data would add network calls. The evidence of
  benefit for interactive chat is weak.
- **Cross-user leaderboards.** They need identity and a server, which
  contradicts the privacy model.
- **Point estimates for Opus / Fable seeded from Sonnet.** RESEARCH-2026 §4.1
  rejected this. Step 22 uses floors instead.
- **Recalibrating the A–E bands.** RESEARCH-2026 §2.5 refuted the case with
  the actual distribution.
- **The React Native app.** Step 30 replaces it.

---

## Milestones

Each milestone ships on its own and can be demoed.

```
M1 SOLID ─────────── Steps 1–8     bugs fixed · history v2 · perf budget · adapters · Playwright green
   │
M2 CLOSED LOOP ───── Steps 9–13    the pill shows what the answer ACTUALLY cost        ◀ signature
   │
M3 ONE-CLICK ─────── Steps 14–19   Apply · Budget Dial · 0 Wh answers · savings ledger
   │   └─ Step 32 store launch (needs ROADMAP 2.1 privacy policy)
   │
M4 PROVABLE ──────── Steps 20–26   evidence ledger · ranges · floors · quality frontier · validation + DOI
   │
M5 EVERYWHERE ────── Steps 27–31   npm + CLI · SDK wrapper · MCP · PWA share target · eco-labels
   └─ TEAMS ──────── Steps 33–35   aggregate-only files · zero-backend dashboard · relay gate
        Stage 6 (a11y, i18n, share cards) runs alongside from M3 on
```

**Rough total for one developer:** about 4–5 months for M1–M4. M5 and Teams
add about 5 weeks. M1 and M2 alone (about 8 weeks) are enough to make the
product unlike anything else in the category.

**If only three things get done:** Step 1 (the bugs understate footprints
today), Step 9 + 10 (observed output and receipts, the signature), and
Step 14 (one-click Apply, which turns advice into action).

---

## How we'll know it's working, without telemetry

| Signal | Where it comes from |
|---|---|
| Output-estimate error, before vs after calibration | Local, shown to the user (Step 12). Aggregated only via opt-in team files. |
| Share of prompts sent with a budget | Local history (Step 2) |
| Counted savings per active user | Savings ledger (Step 19) → team files (Step 33) |
| Adapter health | Weekly canary pass rate (Step 7) |
| Adoption | Store installs and ratings, npm downloads, MCP installs, stars. All public, none instrumented. |

---

## New risks this plan introduces

| Risk | Mitigation |
|---|---|
| Writing into host composers feels invasive, or breaks on a redesign | Adapter-scoped, always visible, always undoable (Step 14). The Dial is off by default (Step 15). Canary + fixtures catch breakage (Step 7). |
| Watching replies looks like surveillance | Store counts, never text. Say so plainly in PRIVACY.md. Recording has an off switch and a per-site disable (Step 2). |
| Brevity lowers answer quality | Receipts show the real effect. The quality frontier (Step 24) keeps recommendations honest. Dial skip rules (Step 15). |
| Caching makes conversation estimates too high | Report a range with a cached lower bound, and document it (Step 11). |
| The quality data licence is unclear | Verify before import; ship without it rather than ship it wrong (Step 24). |
| Scope, with one maintainer | Every milestone ships on its own. Stages 4–5 are optional and gated (Step 35). |

---

## Definition of done, for every step

1. Tests cover the change: unit, property or Playwright, whichever fits.
2. `node scripts/sync-core.js` has been run and `npm test` passes.
3. If a number changed, `docs/METHODOLOGY.md` says why, with a citation id.
4. If data handling changed, PRIVACY.md changed in the same PR.
5. There is a `CHANGELOG.md` entry, and the version is bumped from its single
   source.
