# EcoPrompt Coach — Build Plan v4

**Models first: a 2026 catalog, then the closed loop.** A step-by-step plan:
new features, improvements and efficiencies, in the order to build them.

v4 puts a new **Stage 0** in front of the v3 plan: replace a catalog of 2025
models with the models people use today, estimated honestly and detected
correctly. Everything after it is v3's plan, renumbered, with changes noted
where the new catalog touches a step. v3 is kept at
[`docs/legacy/PLAN-v3.md`](docs/legacy/PLAN-v3.md).

[`ROADMAP.md`](ROADMAP.md) is still the checklist for hygiene, distribution
and governance: licensing in `Context/`, privacy policy, store listing,
governance files. This plan covers **what to build next**. Where a step
overlaps with ROADMAP.md, it points there instead of repeating it.

Every figure about this codebase below came from running the engine or the
detector, or from searching the code. v4's figures were produced on 2026-10-18 and v3's on 2026-09-25;
no product code has changed between the two dates (the last code commit is
`79a8a78`, 2026-09-24). Model facts carry a verification status:
**fetched** means a primary page was opened, **search-only** means the
fact was only seen in search results or secondary sources.

---

## What changed from v3

| | v3 (2026-09-25) | v4 (2026-10-18) |
|---|---|---|
| First stage | Fix bugs, history, performance | **Ship a 2026 catalog**: current models only, estimated as ranges, detected correctly |
| Catalog | 22 models: 21 from 2025 or earlier, plus Sonnet 5, already legacy | Current 2026 lineups plus leading 2026 open-weight models. The 22 old entries become hidden reference data |
| Unmeasured models | Opus and Fable deliberately absent | Estimated by a stated method, shown as a range, labelled *extrapolated* |
| Reasoning effort | Step 23, late in Stage 3 | Step 3, because GPT-6 is now one model from Instant to Extra High |
| Validation study | Measure Llama 3.x | Measure 2026 open-weight models, to test the new estimator |

**Numbering.** Steps 1–9 are new. Steps 10–46 are v3's Steps 1–38:
v3 Steps 1–22 are now 10–31, v3 Step 23 is now Step 3, and v3 Steps 24–38
are now 32–46. Every cross-reference has been renumbered. Steps that the
new catalog changes carry a **Changed in v4** note.

### Decisions recorded on 2026-10-18

1. **Numbers for models nobody has measured: an estimate with a range.**
   Open-weight models are estimated from their published active-parameter
   counts. Closed models are estimated from a tier and shown as a range,
   rounded up where thinking is always on. Every one is labelled
   *extrapolated*.
2. **2025-and-earlier models: hidden, kept as reference.** They are removed
   from every picker, comparison, explorer, detection rule and demo. Their
   benchmark data stays in the repo, because it is the evidence the new
   estimates are derived from and it lets old history re-score.
3. **This document:** PLAN v4, with the model refresh first.

**Recorded on 2026-10-19:**

4. **A model that thinks is shown as a range only.** It gets no single
   number until real thinking-token counts exist. This replaces Step 2's
   "point estimate at the top quartile". The only thinking evidence would
   put Opus 5.5 at grade E even for a one-line question, a precision the
   evidence doesn't support.

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

## What the code told us about the catalog

These findings define Stage 0. Each one was confirmed against the code at
the line cited, and every figure comes from running the engine on
2026-10-18.

**1. No current model is in the catalog.** 21 of the 22 entries in
`models.json` are models from 2025 or earlier. The 22nd, `claude-sonnet-5`,
is a 2026 model that is already legacy, and its numbers are Claude Sonnet
4.5's benchmark points under a new name. Anthropic's current lineup is **Fable 5.1, Opus 5.5,
Sonnet 5.5 and Haiku 5.5** (fetched from `platform.claude.com`,
2026-10-18). The other providers have moved on just as far (Step 5).

**2. Detection fails on every label people see today.** We ran
`detectModelFromLabels` on 23 labels from current model pickers. The
labels come from Step 5's sources: claude.ai's are fetched, the rest
search-only. **None resolves correctly.**

| Outcome | Labels | Count |
|---|---|---|
| **Older, cheaper sibling, silently** | claude.ai `Sonnet 5.5` → Sonnet 5 · `Haiku 5.5` → Haiku 4.5. Gemini `3.8 Flash` and `3.5 Flash-Lite` → 2.5 Flash · `3.1 Pro` → 2.5 Pro. Mistral Vibe `Medium 3.5` → Large 2 | 6 |
| Fail closed to a 2025 host default | ChatGPT `GPT-6` → GPT-5. claude.ai `Opus 5.5`, `Fable 5.1` → Sonnet 5. Gemini `Auto` → 2.5 Flash | 4 |
| No match, so the 2025 host default | ChatGPT `Instant`, `Medium`, `High`, `Extra High`, `Pro`. claude.ai `Extra high`. Gemini `4 Argon`. Grok `Fast`, `Expert`, `Heavy`. DeepSeek `Instant`, `Expert` | 12 |
| Site not supported | meta.ai `Thinking` | 1 |

Six labels resolve **silently to an older, cheaper sibling**. That is the
one-directional understatement RESEARCH-2026 §1.1 spent a release fixing,
back again for two reasons:
- Version patterns aren't anchored at the end. `/\bsonnet[\s-]*5\b/`
  matches "Sonnet 5.5", because `\b` sits between "5" and "."
  (`calculator.js:611`). The fail-closed guard for "3.1 Pro" is skipped
  for the same reason: its lookbehind sees the "1" after the decimal point
  (`calculator.js:585`).
- Bare catch-alls absorb new generations: `\bhaiku\b`, `\bflash\b`,
  `\bpro\b`, `\blarge\b` and `\bmedium\b` (`calculator.js:608, 615-620`).

The fail-closed path is honest, but every host default it falls back to is
a 2025 model. Three sites now name a *mode* rather than a model: ChatGPT
(Instant … Pro), Grok (Fast / Expert / Heavy) and DeepSeek (Instant /
Expert). Nothing matches any of them. So a ChatGPT *Extra High* answer is
recorded at GPT-5 Instant's 0.68 Wh, and a Grok *Heavy* answer (a team of
agents) is recorded as one Grok 3 reply.

**3. `retired` does nothing.** `claude-3.7-sonnet` carries `retired: true`
and a note saying it is "excluded from detection", but the engine never
reads the field (`calculator.js:222-251`). `listModels()` returns all 22
models, so it appears in every picker, in Compare and in the explorer.
"Hide the old models" needs real engine support, not a flag.

**4. The engine only accepts measurements.** Every entry must have three
`performance` benchmark points, or construction throws
(`calculator.js:224-230`). So the only way to add a model nobody has
measured is to write invented numbers into fields named `energy_wh_mean`.
Every reader of the data file, and the `data_source` label, takes those
fields to mean "a benchmark said this".

**5. The evidence is thin, and all of it is from 2025.** Of the 22 entries,
3 are measured (Llama 3.2 1B, Llama 3.3 70B, DeepSeek-R1), 1 is anchored
to a provider figure (Gemini 2.5 Flash), 5 are benchmarked and 13 are
extrapolated. No lab has published a per-query energy figure for any 2026
model (RESEARCH-2026 §2.2). A search on 2026-10-18 found none either.
So after the refresh, **every number a user sees is an estimate**, and
the UI has to say so (Step 8).

**6. The reference set already shows how wide the honest ranges are.** At
150 input / 400 output tokens and standard effort:

| Tier | Reference entries | Wh: min / median / max | Grades |
|---|---|---|---|
| Small | 7 | 0.12 / 0.18 / 0.24 | all A |
| Frontier chat | 8 | 0.52 / 0.78 / 1.17 | all B |
| Thinking | 4 | 1.69 / 11.58 / 24.55 | C, D, E, E |

- Small: GPT-4o mini, GPT-4.1 nano, Haiku 4.5, Gemini 2.5 Flash,
  Gemini 2.0 Flash, Mistral Small, Llama 4 Scout.
- Frontier chat: GPT-5, GPT-4o, Claude 3.7 Sonnet, Claude Sonnet 4.5,
  Gemini 2.5 Pro, Mistral Large 2, DeepSeek V3, Grok 3.
- Thinking: GPT-5 Thinking, o3, DeepSeek-R1, o4-mini.
- `claude-sonnet-5` is left out because it duplicates Sonnet 4.5. The two
  measured Llama 3.x entries calibrate the active-parameter estimator
  instead (Step 2).

The thinking tier spans **14.5×**. The two reference pairs that differ
only in thinking imply how many hidden tokens a thinking answer adds at
150 in / 400 out:

| Pair | Energy ratio | Implied hidden tokens | Evidence |
|---|---|---|---|
| GPT-5 → GPT-5 Thinking | 11.4× | ≈ 5,300 | both extrapolated |
| DeepSeek V3 → R1 | 40.1× | ≈ 20,600 | R1 measured, V3 extrapolated |

For a thinking model, a single number would be false precision. It has to
be shown as a range.

**7. Old model ids are wired into about 160 places.** The core tests have
66, `calculator.js` 31 (detection and host defaults), the catalog 25, the
web app 6, the extension 4, the demo pages 4 and mobile 1. Three
surfaces disagree on the default model:
- web: `gpt-4o-mini` (`app.js:113`)
- extension: `gpt-4o` (`shared/defaults.js:8`, `content.js:31, 153`)
- mobile: `gpt-5` (`storage.ts:63`)

**8. Two new hosts have nowhere to go.**
- Muse Spark is served from Meta's own data centers, but `grids.json`
  has no `meta` entry. It has only Azure, AWS, Google Cloud, Mistral EU,
  DeepSeek and xAI. `meta.ai` isn't in the extension manifest either.
- The open-weight leaders from Moonshot, Alibaba and Z.ai are served
  first-party from China, which has no entry besides DeepSeek's.

---

## What the code told us in v3 (all still open)

These findings define Stage 1 and justify Stage 2. Each one was confirmed
against the code at the line cited, and every figure comes from running the
engine on 2026-09-25. No product code has changed since then, so they all
still hold. They name v3's catalog models, but none of the mechanisms depend
on which model is selected.

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
true figure by an unknown amount, so Step 20 reports a range, not a point.

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
> on it, and 2.1 blocks the store launch in Step 40.

---

## Stage 0 — The 2026 catalog *(≈ 4 weeks)*

Every later stage reports a number about a model. Today, for every current
picker label, that number is about the wrong model. Fix that first. Stage 0
ships on its own as v2.1, and the store launch (Step 40) must not go out
with the 2025 catalog.

### Step 1 — Catalog schema v3: current vs reference · M
- Add fields to each `models.json` entry:
  - `status`: `current` or `reference`
  - `released`: an ISO date
  - `superseded_by`: the id of the model that replaced it
  - `thinking`: `always`, `adaptive`, `optional` or `none`
  - `effort_vocab`: which provider effort vocabulary applies (Step 3)
  - `open_weight`, and for open-weight models
    `params: {total_b, active_b, precision}`
  - `estimate`: the method and its inputs (Step 2)
  - `sources`: each with a url, a `fetched` / `search-only` status and a
    `checked_on` date
- Move all 22 existing entries to `status: "reference"`, and give each a
  `superseded_by` where one exists (Step 5's table). They keep their
  `performance` points, because those are the evidence.
- Engine changes:
  - `listModels()` returns `current` models only. An explicit
    `{includeReference: true}` returns the rest, for methodology views and
    tests.
  - `getModel()` and `estimateImpact()` still resolve reference ids, so
    stored history and old share links keep working.
  - Replace the no-op `retired` flag with `status`.
- A `current` entry supplies an `estimate` block instead of `performance`.
  **Invented numbers never go into `energy_wh_mean`.** That field keeps
  meaning "a benchmark said this".

**Done when:** `listModels()` returns only `current` models, none released
before 2026-01-01. Every reference id still estimates to exactly the value it does today. A
test proves no `current` entry carries `performance` points unless they
cite a benchmark.

> **Status (2026-10-19): built.**
> - All 22 entries are `reference`. `thinking` replaces `is_reasoning`,
>   and the no-op `retired` flag is gone.
> - The open-weight entries carry parameter counts fetched from the labs'
>   own model cards: Llama 3.2 1B, Llama 3.3 70B, Llama 4 Scout,
>   DeepSeek V3 and R1. These are inputs for Step 2's leave-one-out check.
> - A snapshot test pins every reference estimate: 22 models × 6 shapes ×
>   3 efforts.
> - Two values wait for later steps. `superseded_by` arrives in Step 5,
>   with the models it points to, so no id ever points at nothing.
>   `effort_vocab` arrives in Step 3.
> - Until Step 5 adds current models, the apps ask for reference entries
>   explicitly (`includeReference: true`), so no picker goes empty. Step 5
>   removes that opt-in, and with it every pre-2026 model from the UI.

### Step 2 — Two estimators, both with ranges · L
Decision 1, made concrete. Both estimators are pure functions in core and
return `{wh, range: {lowWh, highWh}, method, inputs}`.

**Active-parameter estimator, for open-weight models.**
- Port EcoLogits' published energy-per-token relation (MPL-2.0;
  RESEARCH-2026 §2.3 already cloned 0.11.1). Decode energy per token is a
  function of active parameters. The GPU count comes from total
  parameters × bytes per parameter ÷ GPU memory, plus server overhead.
  Our PUE, WUE and CIF are then applied from `grids.json`.
- Read the constants from the repo and cite the commit. Don't retype them
  from a paper.
- EcoLogits' `models.json` already carries some 2026 models as estimation
  inputs: Gemma 4, Mistral Small 4 and Large 4, and GLM-5.x. Diff our
  parameter counts against theirs, and record each disagreement with the
  rule that settles it (Step 5's caveats).
- The prefill term uses the e_in / e_out ratio of the measured reference
  entries. The input clamp (`INPUT_FIT_EXTRAPOLATION_LIMIT`) still applies.
- **Check it against the reference set.** Run it, leave-one-out, on the
  reference entries that have both architecture facts and a measured
  point: Llama 3.2 1B, Llama 3.3 70B and DeepSeek-R1. R1 also tests the
  thinking path.
- If the estimator misses a measured point by more than its band, widen
  the band. Don't tune constants until it hits.
- Be honest about the gap: only two measured non-reasoning points exist.
  Step 33 measures 2026 open-weight models directly.

**Tier estimator, for closed models.**
- Each closed model gets a tier (`small` or `frontier`) and a thinking
  mode. Its base coefficients are the tier median of the reference
  entries' fitted coefficients, and its range is the tier min–max
  (finding 6).
- **Thinking becomes hidden output tokens,** not a separate catalog
  entry. v3's catalog split models into pairs (`gpt-5` /
  `gpt-5-thinking`), but 2026 models don't split that way: GPT-6 Sol
  serves Instant through Extra High, and Claude's thinking is adaptive.
  - So `E = E_base(T_in, T_out + T_think)`, where `T_think` is a range
    per effort level (Step 3).
  - The prior comes from the two reference pairs: about 5,300 to 20,600
    hidden tokens at standard effort for a 150/400 prompt (finding 6).
  - Once the SDK wrapper (Step 36) reads real reasoning-token counts,
    those replace the prior.
- **Always-on thinking rounds up** (decision 1). For `thinking: always`,
  the point estimate sits at the top quartile of the thinking prior. The
  low end of the range never drops below the frontier-chat median plus
  the minimum thinking budget that Step 3 sets for the lowest effort
  level. Opus 5.5 and Fable 5.1 therefore can't be
  estimated below a non-thinking frontier model, which was the failure
  RESEARCH-2026 §4.1 rejected.
- **Cross-check, never an input:** compare against price order within
  each provider (for example, $20 vs $0.50 per million output tokens for
  Opus 5.5 vs Haiku 5.5). If a tier assignment contradicts the price order
  within one provider, it gets flagged in review.

**Shared rules.**
- Thinking is the same hidden-token term in both estimators. Open-weight
  models that always think (Muse Spark Open, Kimi K3) get it on top of
  their parameter-based base cost.
- The 2025 reference set assumes 2025 hardware, so estimates for 2026
  models probably err high. That's the chosen direction of error, and the
  UI says "likely high" (Step 8).
- Add METHODOLOGY §2.5 *Estimating models nobody has measured*: both
  methods, their inputs, the leave-one-out table, the direction of error,
  and what would replace each estimate.

**Done when:** both estimators have unit tests and the leave-one-out table
is in METHODOLOGY. Ranges are monotonic in tokens and effort. No
`thinking: always` model's range starts below the frontier-chat median.

> **Status (2026-10-19): built.** METHODOLOGY §2.5 and
> `scripts/estimator-validation.js` hold the method and the leave-one-out
> tables. Where the build departs from the wording above:
> - **R1's evidence.** DeepSeek-R1 is not paired with the catalog's V3
>   entry. V3's extrapolated decode coefficient is ~3.4× below EcoLogits'
>   figure for the same architecture, and pairing them inflates R1's
>   implied thinking to ~20,600 tokens. Instead, R1's measurement is
>   priced against its own estimated plain answer. The hidden-token
>   evidence at 150/400 is therefore ~5,300–5,800, not 5,300–20,600.
> - **Thinking models are a range only** (decision 4). There is no
>   top-quartile point.
> - **The active-parameter band** is ×0.48–×2.08: the full disagreement
>   between the two calibration entries, applied either side. Leave-one-out
>   showed the narrower in-sample spread was too optimistic.
> - **GPU counts** use the weight precision the model card states, not
>   EcoLogits' blanket 16 bits.
> - **The price-order cross-check** moves to Step 5, since it needs
>   per-model prices.

### Step 3 — Effort as each provider names it · S
*(was v3 Step 23, pulled forward: the catalog can't model GPT-6 without it)*
- Map each provider's effort vocabulary to the hidden-token ranges from
  Step 2:
  - **Anthropic** (fetched): Low / Medium / High / Extra high / Max.
    - The claude.ai apps default to **Medium**.
    - The API defaults differ per model: `medium` for Opus 5.5 and Haiku
      5.5, `high` for Fable 5.1 and Sonnet 5.5.
    - On claude.ai, thinking can't be switched off for any current model.
  - **ChatGPT** (search-only): Instant / Medium / High / Extra High run on
    GPT-6 Sol on paid plans. *Pro* runs on GPT-6 Astra.
  - **Gemini** (search-only): thinking level Low / Medium / High. The app
    defaults to Low; the API defaults to Medium.
  - **Grok** (search-only): Fast / Expert / Heavy. *Heavy* is a team of
    agents, so it needs an agent-count multiplier, and its estimate is a
    floor until that count is documented.
  - **DeepSeek:** Instant (V4.1-Flash) / Expert (V4-Pro), plus the
    DeepThink toggle.
  - **Muse Spark** (search-only): Instant / Thinking / Contemplating.
    *Contemplating* is multi-agent and gets the same treatment as Heavy.
- Keep the engine's three keys (`low` / `standard` / `high`) as aliases,
  so stored settings and the API don't break. Interpolate between them,
  and widen the band off-tier.
- When the effort can't be read from the page, use the model's documented
  default effort, not `standard`.

**Done when:** the effort factor is monotonic within each vocabulary, every
level has a test, and an unknown effort resolves to the model's default.

> **Status (2026-10-19): built.** METHODOLOGY §2.5.7 documents it.
> - **The scale.** One canonical scale: `none / low / standard / high /
>   xhigh / max`, with `medium` as an alias of `standard`. Each level is a
>   factor range on thinking. Past `high` the range only widens upward,
>   because nothing there is measured.
> - **Provider vocabularies.** Anthropic's is fetched; the others are
>   search-only. Detection (Step 6) will read them through
>   `effortFromLabel()`.
> - **Several agents.** Grok *Heavy* and Muse *Contemplating* produce a
>   floor (`multiAgent`), as this step specifies.
> - **Not yet set.** Per-model `default_effort` and `effort_vocab` values
>   arrive with the models in Step 5.

### Step 4 — Infrastructure for the new hosts · S
- Add a `meta` entry to `grids.json` for Muse Spark. Use PUE, WUE and grid
  mix from Meta's latest sustainability report, read from the PDF itself.
  RESEARCH-2026 §5.3's rule holds: no grid number without the primary
  document.
- Open-weight models get the provider's own first-party API as their
  serving host where one exists. Moonshot, Alibaba and Z.ai are new China
  hosts. Until each has a fetched source, they reuse the `deepseek` China
  averages and say so explicitly (`proxy_of: "deepseek"`). Inventing
  per-company PUE figures is not an option.
- A model with no first-party chat host uses the cloud its lab runs on:
  `google_cloud` for Gemma 4, and `aws` for Nemotron 3 Ultra, as the Llama
  entries do today.

**Done when:** every current model's `host_key` resolves. Each new grid
entry cites a fetched source or is visibly marked as a proxy.

### Step 5 — The 2026 roster · M
**The rule:** a model is `current` if it was released on or after
2026-01-01 **and** is still its provider's current offering for its tier.
- Superseded 2026 models (Sonnet 5, Opus 5, Fable 5, GPT-5.6 and the
  like) become `reference` entries that point to their successor, so a
  "legacy models" menu still resolves.
- Previews stay out until they are generally available, with one
  exception: a model whose API is in preview counts if a consumer app
  already serves it. So Mistral Large 4 waits, and Gemini 3.1 Pro is in.

Status of each fact: **F** = fetched from the vendor's own page · **F-SDK**
= the vendor's SDK source on GitHub (`openai/openai-python`) · **S** =
search-only. Anthropic's rows were fetched end to end. For most other
vendors the primary pages were blocked by the environment's network policy
(Step 9), so their rows must be fetched before they ship.

**Closed models — tier estimator (Step 2)**

| Provider | Model · id | Released | Thinking | Tier | Status |
|---|---|---|---|---|---|
| Anthropic | Claude Fable 5.1 · `claude-fable-5-1` | 2026-09-01 | always (adaptive) | frontier · always | F |
| Anthropic | Claude Opus 5.5 · `claude-opus-5-5` | 2026-09-22 | always (adaptive) | frontier · always | F |
| Anthropic | Claude Sonnet 5.5 · `claude-sonnet-5-5` | 2026-09-28 | adaptive; can't be switched off on claude.ai | frontier | F |
| Anthropic | Claude Haiku 5.5 · `claude-haiku-5-5` | 2026-10-07 | adaptive; can't be switched off on claude.ai | small | F |
| OpenAI | GPT-6 Astra · `gpt-6-astra` | 2026-09-04 (preview 09-03) | reasoning; ChatGPT *Pro* | frontier · always | S, id F-SDK |
| OpenAI | GPT-6 Sol · `gpt-6-sol` | 2026-09-22 | effort; ChatGPT *Instant … Extra High* | frontier | S, id F-SDK |
| OpenAI | GPT-6.1 Sol · `gpt-6.1-sol` | 2026-09-29 | effort; API and Perplexity, not yet ChatGPT | frontier | S, id F-SDK |
| OpenAI | GPT-6 Luna · `gpt-6-luna` | 2026-09-22 | reasoning; ChatGPT Free and Go | small | S, id F-SDK |
| Google | Gemini 4 Argon · `gemini-4-argon` | 2026-10-13 (announced 09-30) | thinking levels Low / Medium / High | frontier · always | id and date F, rest S |
| Google | Gemini 3.8 Flash · `gemini-3.8-flash` | 2026-09-02 | thinking supported | small | S |
| Google | Gemini 3.5 Flash-Lite · `gemini-3.5-flash-lite` | 2026-07-21 | thinking supported | small | S |
| Google | Gemini 3.1 Pro · `gemini-3.1-pro` | API preview 2026-02-19 | thinking | frontier | S. In because the Gemini app serves it (see the rule) |
| Meta | Muse Spark 1.3 · `muse-spark-1.3` | 2026-09-02 | Instant / Thinking / Contemplating | frontier, until settled (see below) | S |
| xAI | Grok 4.7 · `grok-4.7` | 2026-09-21 (one source: 09-14) | Fast / Expert / Heavy (multi-agent) | frontier | S |

**Open-weight models — active-parameter estimator (Step 2)**

The Hugging Face model cards themselves were blocked too. These facts were
read from the same text in Hugging Face's blog sources and the labs' own
GitHub READMEs, which mirror the cards (**F**). Active parameters are
**decode** parameters per token.

| Lab | Model · id | Released | Total / active | Thinking | Status |
|---|---|---|---|---|---|
| Meta | Muse Spark Open · `muse-spark-open` | 2026-10-15 | 816B / 42B MoE | **always**; effort Low–Extra high, default Extra high | F (licence S) |
| Meta | Muse Glimmer 30B · `muse-glimmer-30b` | 2026-08-10 | 30B dense | strength levels | F |
| DeepSeek | DeepSeek-V4-Pro · `deepseek-v4-pro` | 2026-04-24 (0813 build GA 08-13) | 1.6T / 49B MoE | optional: Non-think / Think High / Think Max | F |
| Moonshot | Kimi K3 · `kimi-k3` | 2026-07-26 | 2.8T / 104B MoE | **always**; Low / High / Max, default Max | F |
| Alibaba | Qwen3.8-2.4T-A95B · `qwen3.8-2.4t-a95b` | 2026-08-12 | 2.4T / 95B MoE | effort; whether it can be switched off is unverified | params F (from the repo name), architecture S |
| Alibaba | Qwen3.8-27B · `qwen3.8-27b` | 2026-08-14 | 27B dense | on by default | F |
| Z.ai | GLM-5.3 · `glm-5.3` | 2026-08-28 | 744B / 40B MoE | Low / High / Max | F (licence S, disputed) |
| Z.ai | GLM-5.3-Flash · `glm-5.3-flash` | 2026-08-26 | 320B / 18B MoE | Low / High / Max | F |
| Google | Gemma 4 26B-A4B · `gemma-4-26b-a4b` | 2026-04-02 | 25.2B / 3.8B MoE | optional | F |
| Google | Gemma 4 31B · `gemma-4-31b` | 2026-04-02 | 31B dense | optional | F |
| Google | Gemma 4 E4B · `gemma-4-e4b` | 2026-04-02 | 8B / 4.5B effective | optional | F |
| Mistral | Mistral Medium 3.5 · `mistral-medium-3.5` | 2026-04-28 | 128B dense | hybrid; Vibe's default | S |
| Mistral | Mistral Small 4 · `mistral-small-4` | 2026-03-16 | 119B / 6.5B MoE | optional, with effort | F (active count disputed) |
| NVIDIA | Nemotron 3 Ultra · `nemotron-3-ultra` | 2026-06-04 | 550B / 55B hybrid Mamba MoE | toggle | params F, date S |

**Fetching is part of this step.** Step 9's gate blocks any row whose key
facts are still search-only, so every **S** above gets its primary page
opened before the entry ships. That needs the network allowlist from
Step 9. Three cases can't be settled by fetching today:
- **DeepSeek V4.1-Flash**, and its 1017 build. DeepSeek's *Instant* mode
  serves it, but its size is disputed: 552B or ~763B total, with 16B
  active at decode. Every source is search-only, and no card for the 1017
  build was found. Until one is, DeepSeek *Instant* shows a **floor** from
  V4-Flash (284B / 13B, F), which is the smaller model (Step 31). V4-Flash
  enters as a `reference` entry with a parameter-based estimate, used only
  for that floor.
- **Mistral Large 4** (~1.05T / 49B, preview since 2026-10-06). It joins
  when its weights ship; sources give Oct 27 and Oct 31.
- **Muse Spark 1.3's tier.** Meta calls it small and fast, but publishes
  no size and no price. Until the price-order cross-check can run, it
  takes the *frontier* tier. That matches decision 1's rule of rounding
  up when unsure.

**Later candidates** (2026, verified enough to add in a monthly refresh):
- Inkling (975B / 41B)
- Beam 1.0 (501B / 23B, always thinking)
- MiniMax-M3 (~428B / 23B)
- Nemotron 3 Super (120.6B / 12.7B)
- Qwen3.6-35B-A3B
- MiMo-V2.5-Pro (search-only)

OpenAI has published no 2026 open-weight model. gpt-oss (Aug 2025)
becomes reference data with the rest.

**Estimator caveats** these models raise, all handled in Step 2:
- Count active parameters one way everywhere, with or without embeddings.
  Mistral Small 4 is 6B, 6.5B or 8B depending on the rule, and EcoLogits
  uses 4B where Google's card says 3.8B for Gemma 4 26B.
- Native FP4 checkpoints (Kimi K3, DeepSeek V4, Muse Spark Open's NVFP4)
  change the GPU count.
- Sparse attention (DeepSeek V4, GLM-5.x) means long-context prefill costs
  less than active parameters suggest.
- Muse Spark Open, Kimi K3 and Beam always think, so the hidden-token
  prior applies to them too.

**Successors for the 22 reference entries** (`superseded_by`)

| Old entries | Successor |
|---|---|
| `gpt-5`, `gpt-4o` | `gpt-6-sol` |
| `gpt-5-thinking`, `o3` | `gpt-6-sol` at High |
| `gpt-4o-mini`, `gpt-4.1-nano`, `o4-mini` | `gpt-6-luna` |
| `claude-sonnet-5`, `claude-4.5-sonnet`, `claude-3.7-sonnet` | `claude-sonnet-5-5` |
| `claude-4.5-haiku` | `claude-haiku-5-5` |
| `gemini-2.5-pro` | `gemini-3.1-pro` |
| `gemini-2.5-flash` | `gemini-3.8-flash` |
| `gemini-2.0-flash` | `gemini-3.5-flash-lite` |
| `mistral-large` | `mistral-medium-3.5`, until Large 4 ships |
| `mistral-small` | `mistral-small-4` |
| `llama-4-scout`, `llama-3.3-70b` | `muse-spark-open` |
| `llama-3.2-1b` | `null`: no same-provider successor, so history-only |
| `deepseek-v3` | `deepseek-v4-pro` until V4.1-Flash clears the gate. It is the larger model, so any error runs high |
| `deepseek-r1` | `deepseek-v4-pro` at Think High |
| `grok-3` | `grok-4.7` |

**Site defaults** (all shown as "assumed")

| Site | Default | Note |
|---|---|---|
| chatgpt.com | `gpt-6-sol` | Free and Go get `gpt-6-luna`; the plan isn't visible on the page |
| claude.ai | `claude-sonnet-5-5` at Medium | Anthropic doesn't state the Free default |
| gemini.google.com | `gemini-3.8-flash` | routed: *Auto* picks the model per prompt |
| grok.com | `grok-4.7` *Fast* | |
| chat.deepseek.com | floor from `deepseek-v4-flash` | until V4.1-Flash clears the gate |
| chat.mistral.ai (Vibe) | `mistral-medium-3.5` | |
| meta.ai (new) | `muse-spark-1.3` | which version meta.ai runs is unverified |
| copilot.microsoft.com | `gpt-6-sol` | routed; Microsoft's page still says GPT-5, probably stale |
| perplexity.ai | floor | routed; its default is its own Sonar model, which has no entry |
| poe.com | `claude-sonnet-5-5` | routed; nothing current verified |

**Done when:** every row has an id, a release date, a thinking mode, an
estimation method, and sources with a status. A test asserts that every
`current` model was released on or after 2026-01-01.

### Step 6 — Detection and site defaults for 2026 pickers · M
- **Anchor every version pattern at both ends** with `(?![\d.])`, so
  `Sonnet 5` can't match "Sonnet 5.5". Delete the bare catch-alls
  (`\bhaiku\b`, `\bflash\b`, `\bpro\b`, `\blarge\b`, `\bmedium\b`).
- **Generate the fail-closed list from the catalog** instead of writing it
  by hand. For each family, any version above the newest catalog version
  fails closed: GPT-7, Claude 6, Opus 5.6, Gemini 5, Grok 5, DeepSeek V5,
  Muse 2. A test enumerates the families and checks that "newest + 0.1"
  and "newest + 1" both fail closed.
- **Detect modes as well as models.** `detectModelFromLabels` returns
  `{modelId, effort}`.
  - ChatGPT: *Instant … Extra High* means GPT-6 Sol at that effort, and
    *Pro* means GPT-6 Astra.
  - Grok: *Fast*, *Expert* and *Heavy* are all Grok 4.7 at increasing
    effort.
  - DeepSeek: *Instant* means V4.1-Flash and *Expert* means V4-Pro.
  - A bare mode word ("Medium", "Pro", "Expert") only counts on its own
    host family. Today's bare catch-alls are what absorbed new
    generations.
- **Defaults.** Replace every host default with a current model and show
  it as "assumed: site default". For example, ChatGPT Free serves Luna
  while paid plans serve Sol, and the page doesn't reveal the plan.
- **Routed hosts.** Perplexity, Poe and Copilot get new defaults and a
  "router: model not visible" label (v3 finding 7, below). Gemini joins
  them: its *Auto* mode picks the model per prompt, and free users have
  had only Auto since about Oct 9 (search-only).
- Mistral's Le Chat is now **Vibe** on the same host (search-only). Its
  default, Medium 3.5, gets a pattern of its own.
- **meta.ai becomes a supported site:** a manifest match, a `meta` family
  and a host default. `kimi.com`, `chat.qwen.ai` and `chat.z.ai` are
  candidates for later; adding each one is a single adapter (Step 15).
- **Demo pages.** Update the picker labels and the `ecoprompt-model` meta
  tags in `apps/demo` to 2026 models, and add a meta.ai-style page.

**Done when:** all 23 labels in finding 2 resolve correctly. The generated
"next version" labels fail closed for every family. The demo exercises
every provider's 2026 labels.

### Step 7 — Migration: nothing breaks for existing users · S
- **Settings.** A saved `defaultModel` that is now a reference id (`gpt-4o`
  is the extension's default today) follows its `superseded_by` chain to
  a current model on load. Say so once: *"Your default model was updated
  from GPT-4o to GPT-6 Sol."*
- **History.** v1 entries keep their stored figures. Every old id still
  resolves (Step 1), so nothing shows "unknown model". Once History v2
  lands (Step 11), re-scoring uses each entry's *own* model's reference
  coefficients: a past query keeps reflecting the model that actually
  served it.
- **Share links and the web library.** An old id opens with the reference
  model, so the shared number reproduces. A banner offers *Compare with
  the current successor* in one click.
- **One default model, defined once in core.** This pulls forward that
  part of Step 13. The web app, the extension and mobile all read it.

**Done when:** a fixture of old settings, history, share links and library
entries loads with no errors and no "unknown model", and the default model
is defined in exactly one place.

### Step 8 — Honest labels for a catalog of estimates · S
After the refresh, no model a user can pick is measured, benchmarked or
anchored (finding 5). The UI must stop showing single confident numbers.
This step is the minimum slice of Steps 22 and 30 that Stage 0 can't ship
without.
- Pill, popup, web coach, Compare and the explorer show:
  - the range ("0.5–1.2 Wh")
  - an *estimated · tier* or *estimated · from parameters* chip
  - a grade range whenever the range crosses a band ("B–C")
- Thinking models show "likely high" until real reasoning-token counts
  exist.
- Update the copy that names old models:
  - the README example (GPT-4o, DeepSeek-R1)
  - the web hero carousel (`app.js:211, 232`)
  - Compare's default trio (`app.js:122`)
- The reference models appear only in METHODOLOGY and, from Step 29, in
  "Why this number?". They never appear in a picker.

**Done when:** no UI path shows a current model's number without its range
and method label, and no old model name appears in any app's UI copy.

### Step 9 — Gates and a monthly refresh · S
- CI checks, in addition to Step 17's schema validator and freshness gate:
  - every `current` model was released on or after 2026-01-01
  - every source has a status
  - no `current` model's estimate rests only on `search-only` facts. The
    facts that matter are its active-parameter count, thinking mode and
    tier. Fetch the primary page, or the entry waits.
  - no `current` model rests on a citation from the RESEARCH-2026 §3.1
    deny-list
  - every `superseded_by` chain ends at a `current` model, or at an
    explicit `null` for history-only entries
  - every model id hard-coded in an app exists in the catalog
- Add a runbook, `docs/CATALOG-REFRESH.md`: a monthly check of each
  provider's model page and each site's picker, with every refresh landing
  as a PR that lists its sources.
- The runbook starts with the environment's network allowlist. On
  2026-10-18 this environment couldn't open help.openai.com,
  ai.google.dev, dev.meta.ai, x.ai, mistral.ai, api-docs.deepseek.com,
  perplexity.ai or poe.com. That is why most non-Anthropic facts in Step 5
  are `search-only`, the same failure RESEARCH-2026 §6 recorded.
- The cadence has to be monthly. October 2026 alone saw:
  - Claude Haiku 5.5 (Oct 7)
  - GPT-6 becoming ChatGPT's default (Oct 7–8)
  - Gemini 4 Argon reaching the API (Oct 13)
  - Muse Spark Open (Oct 15)
  - DeepSeek V4.1-Flash-1017 (Oct 17)
  - Mistral Large 4's open weights, expected Oct 27–31 (search-only; sources conflict)

**Done when:** CI fails each violation with a clear message, and the
runbook has been used once for real (the Mistral Large 4 weights).

---

## Stage 1 — Make the base trustworthy and fast *(≈ 3 weeks)*

Everything later writes to history, reads the page, or runs on every
keystroke. Fix those three things first.

### Step 10 — Fix the verified bugs · S
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
DOM-level bugs get Playwright tests when Step 16's harness lands.

### Step 11 — History v2: record inputs, not just results · M
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

### Step 12 — One analysis pass · M
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

### Step 13 — One engine bootstrap, one presentation layer · M
- **Load once.** Every tab, the popup and the settings page each fetch three
  JSON files and re-fit coefficients for all 22 models
  (`content.js:502-509`, `popup.js:601-610`, `settings.js:47-54`). The web app
  hides the whole page until its three fetches finish, and fails on
  `file://`.
  - Make `scripts/sync-core.js` also emit `vendor/core.bundle.js`: the three
    modules, the data inlined as JS, and the **pre-computed coefficients**.
  - A test asserts that the pre-computed coefficients equal a fresh fit, so
    the bundle can never drift from the data.
  - **Changed in v4:** "coefficients" now also means the output of Step 2's
    estimators for every `current` model, plus the fitted reference
    entries. The same drift test covers both.
- **Share the presentation layer.** Add `packages/core/src/present.js` for
  logic that is now copied across surfaces:
  - the grade palette (defined 5 times)
  - formatters, with one rounding rule
  - the impact-options builder
  - quick per-model grades
  - the range and method chip from Step 8
  - the tip actions the web app already has: trim, "≤100 words" and the
    greener-model switch (`app.js:392-442`). Step 23 then reuses them in the
    extension instead of re-implementing them.
- Settings stops loading the analyzer and conversions it doesn't use.

**Done when:** zero `fetch` calls and zero fits at start-up on every surface.
No grade color or formatter is defined outside core. The sync gate in CI
covers the bundle.

### Step 14 — A lighter runtime on every page · M
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
  clear-and-rebuild. That also fixes the focus loss noted in Step 44.

**Done when:** a Playwright trace of a 2,000-token streamed reply on the demo
shows no long tasks over 50 ms caused by the extension, and typing in the web
coach triggers no Compare re-render unless its inputs changed.

### Step 15 — Site adapters and attach health · M
- Add `apps/extension/sites/<host>.json`, declarative per-site config:
  - `composer`
  - `sendButton`
  - `assistantMessage` (needed by Step 18)
  - `stopButton`
  - `picker`
  - `effortToggle`
  - `insertStrategy` (needed by Step 23)
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

### Step 16 — A test harness that matches the product · M
- **Playwright on `apps/demo`** in CI (ROADMAP 2.6): inject the content
  script, type, send, assert the pill, the history write and the receipt
  (once Step 19 lands).
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

### Step 17 — Data contracts and freshness gates · S
**Changed in v4:** the catalog-specific gates (release dates, source
status, `superseded_by` chains, hard-coded model ids) moved to Step 9 and
land with the new catalog. This step keeps the generic ones.
- Add a small hand-written schema validator to `scripts/check-apps.js`
  (keeping zero dependencies) for `models.json`, `grids.json` and
  `equivalents.json`. Step 1's schema v3 is the one it validates.
- Freshness gates: the catalog fails CI at 90 days old (ROADMAP 0.1). Grids
  fail at 365 days: `grids.json` still reads `last_updated: 2026-06-10`
  (ROADMAP 4.4).
- One version source, checked across `package.json`, the manifests and the
  metadata (ROADMAP 0.3).
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

## Stage 2 — Close the loop: measure what actually happened *(≈ 4–5 weeks)*

This is the signature stage. After it, EcoPrompt Coach is the only tool that
can say what *your* answer actually cost, not what an average answer might.

### Step 18 — Response observer · L
- After a confirmed send, the adapter's `assistantMessage` selector finds the
  new reply node. The observer tracks its text length until it is stable: no
  mutation for 1.5 s, and the stop button is gone.
- It converts the length to tokens with `estimateTokens` (the same ±12%
  calibration as prompts). The count goes to the service worker as
  `outTokensObs`. **The text is never stored or sent anywhere.**
- Treat **Regenerate / Try again** and edited-message resends as new turns.
  They are real costs the extension misses today.
- Where a site shows reasoning time ("Thought for 34s"), record the duration
  as `thinkSeconds`. It is a signal for effort detection (Step 3), not an
  energy input yet.

**Done when:** in the demo playground, observed output tokens are within ±15%
of the mock reply's true token count, and a regenerate creates a second
entry.

### Step 19 — Receipts · M
- When the reply finishes, the pill flips to a **receipt** for a few seconds:
  > *This answer: 1,140 tokens · 1.7 Wh · C. That's 3.3× the estimate. A
  > "≤150 words" cap would have been about 0.4 Wh.*
- In the popup, the Impact tab gets **estimated vs observed**, per site and
  per task type.
- Receipts are the proof surface every later step reports into.

**Done when:** every recorded turn with an observed reply shows a receipt, and
the Impact tab separates observed from estimated energy.

### Step 20 — Conversation meter · L
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

### Step 21 — Self-calibrating output estimates · M
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

### Step 22 — Honest numbers everywhere · S
**Changed in v4:** Step 8 already ships the range, the method chip and the
grade range for every current model. This step covers the rest.
- Surface what the engine already computes:
  - `energy.clamped` becomes "at least …"
  - `grade.provisional` becomes "≥ C"
  - Routed hosts show "router: model not visible, showing site default".
- The badge and totals prefer observed values where they exist.

**Done when:** no UI path shows a clamped or routed figure without its label.

---

## Stage 3 — Act, don't just advise *(≈ 3–4 weeks)*

Partner feedback ranked this concept #1 for one reason: it is actionable
(legacy PLAN-v1 §11). Right now the actions stop at advice.

### Step 23 — One-click Apply in the chat box · M
- The pill card gets an **Apply** button. It writes the optimized prompt
  (courtesy trimmed, plus an optional budget line) into the host's composer
  using the adapter's `insertStrategy`:
  - `<textarea>`: the native value setter + an `input` event.
  - ProseMirror/Quill `contenteditable`: select-all, then
    `insertText` or a `beforeinput` InputEvent.
- An **Undo** toast restores the original. Every Apply is logged as a
  counterfactual: the original estimate vs the applied estimate.
- The action logic comes from core's presentation layer (Step 13), which is
  the web app's existing trim, budget and model-switch actions moved there.
  Add the actions no surface has yet:
  - "halve the length" for `output_budget_long`
  - the instant answer for `special_query` (Step 25)

**Done when:** Apply + Undo round-trip exactly on all three demo pages and on
the DOM fixtures of each real site. The host's own send button still works
after Apply.

### Step 24 — Budget Dial · M
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

### Step 25 — Instant zero-AI answers · M
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
  (Step 28).

**Done when:** the golden corpus's zero-AI cases are answered correctly
offline, with a fuzz test proving the parser never executes input.

### Step 26 — Set-once brevity · S
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

### Step 27 — Right-size at send time · M
- When the task is a small-model task (summarization, translation, factual
  Q&A) and the selected model is frontier or reasoning, the pill says:
  *"Gemini Flash does this for about 70% less."*
- When Thinking is on for a simple prompt: *"Thinking is on. This prompt
  probably doesn't need it (≈ 11× the energy)."*
- **Changed in v4:** on GPT-6 and Claude, thinking is an effort level, not
  a model. So the advice becomes *"Medium instead of Extra High"* or
  *"Haiku 5.5 instead of Opus 5.5"*, using Step 6's detected effort.
- **Changed in v4:** every number is now a range. Claim a saving only when
  the suggested model's high end is below the current model's low end.
  Otherwise say "probably less", never a percentage.
- Once Step 32 lands, recommendations carry a quality note, so the coach
  never suggests a model that is off the quality frontier.

**Done when:** each suggestion's claimed saving equals the engine's comparison
for the same tokens, no percentage is claimed between overlapping ranges,
and the suggestions are silent for code and agentic tasks.

### Step 28 — Savings ledger, goals and weekly recap · M
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

## Stage 4 — Prove, don't assert *(≈ 6 weeks)*

`docs/ARCHITECTURE.md`: *"The defensible asset is the methodology + trust."*
This stage makes that asset visible in the product, not only in the docs.

### Step 29 — Evidence ledger · M
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
- **Changed in v4:** for a `current` model the chain starts one step
  earlier: the estimator and its inputs (active parameters, or the tier and
  the reference entries behind it) → coefficients → infrastructure →
  citations. Step 1's per-entry `sources` migrate into this ledger. The
  drawer is also the one place the 2025 reference models are visible.

**Done when:** every number in the UI can be traced to a citation id with a
status, and adding a deny-listed id fails CI.

### Step 30 — Uncertainty engine · L
- `estimateDistribution()` runs a seeded quasi-Monte-Carlo (about 512 Halton
  points, deterministic) over:
  - benchmark std (lognormal)
  - PUE/WUE/CIF ranges from the citations
  - a **batching/utilization factor**: RESEARCH-2026 §2.4 found batch size
    moves per-request energy 12–17×, and today's bands don't span that
  - token-count error (±12% prose / ±18% code)
  - output-estimate error, from Step 21's calibration
  - **Changed in v4:** the estimator ranges from Step 2 (tier spread, the
    hidden-token prior) as their own inputs. For most current models this
    will be the largest term, and the attribution should say so.
- It returns P10/P50/P90 and a **variance attribution**: *"Most of this
  uncertainty is how busy the provider's servers were."*
- UI: Step 8's min–max ranges become P10–P90 ranges. When the range crosses
  a band, the grade becomes a range ("B–C").

**Done when:** P50 matches `estimateImpact` within 5% at the benchmark points,
a call takes ≤ 2 ms (results cached per model × token bucket), and the
attribution sums to 100%.

### Step 31 — Floors, not guesses, for unknown models · M
**Changed in v4:** Opus 5.5, Fable 5.1, GPT-6, Gemini 4 and Grok 4.7 are in
the catalog now, so this step covers generations *past* the catalog: the
labels that Step 6's generated list fails closed on.
- When detection reports `unknownGeneration`, show a **floor** instead of
  substituting the host default. The floor is the newest catalog model of
  the same family and tier. For example: *"Opus 5.6 isn't in the catalog
  yet. Showing at least Opus 5.5's low end."*, with a "≥" grade.
- It reuses the "lower bound" semantics `energy.clamped` already has, keeping
  the RESEARCH-2026 §4.1 rule: no point estimate seeded from a smaller
  sibling.
- The floor is also the trigger for the Step 9 runbook: a floor shown on a
  real site means the catalog is behind.

**Done when:** every unknown-generation label in the detection test table
produces a floor with "≥" grading, and none produces a point estimate.

*(v3's Step 23, "Effort as a continuum", is now Step 3.)*

### Step 32 — Quality-aware right-sizing · L
- The partner concern from the original research, verbatim: *"Trade-off
  between efficiency and result quality — make it transparent"* (legacy
  PLAN-v1 §11). The product still recommends smaller models with no quality
  signal.
- Add `quality.json`: per-model quality scores from a source whose licence
  permits redistribution. Jegham et al. v6 publishes a DEA eco-efficiency
  ranking. Verify the table and its licence before importing, and ship
  nothing if either is unclear.
- **Changed in v4:** Jegham et al. v6 ranks 2025 models only, so it can't
  score the current catalog. The source has to cover the 2026 roster, with
  a licence that permits redistribution. If no such source exists, this
  step waits. It does not fall back to scoring old models.
- The Compare tab gets an **energy × quality frontier** chart.
  Recommendations become *"the cheapest model within N points of the best
  for this task type"*, and the coach never recommends a model off the
  frontier.

**Done when:** every model recommendation in the product sits on the frontier,
and the quality source is a `fetched` citation in the Step 29 ledger.

### Step 33 — Validation study · L
ROADMAP 4.2, made concrete.

**Changed in v4:** measure 2026 open-weight models, not Llama 3.x. This is
now the test of Step 2's active-parameter estimator, and that estimator
decides most of the open-weight numbers in the catalog.
- Measure at the three benchmark shapes with NVML/Zeus, on rented GPUs:
  - a small MoE that fits on one GPU (Gemma 4 26B-A4B)
  - a mid MoE on one 8-GPU node (GLM-5.3-Flash or DeepSeek V4.1-Flash)
  - with thinking on and off where the model allows it, which also tests
    Step 2's hidden-token prior
- Publish the raw data and scripts in `validation/`.
- Before renting GPUs, read the two 2026 measurement leads found on
  2026-10-18. Neither has been read yet:
  - *Energies* 19(20):4893 (2026-10-16). Gemma 4 E4B and three other small
    models on one RTX 4090, GPU-only via NVML. Its tables may give a first
    small-model check.
  - "Luo et al., arXiv 2609.29707". This is Qwen3.8-27B with thinking on
    and off, whole-system power. It is an arXiv id nobody has resolved,
    so it goes on the RESEARCH-2026 §3.1 verification queue, not into the
    citations.
- Compare the engine's predictions. Promote any measured model from
  `extrapolated` to `measured`, with its new points.
- The EcoLogits cross-check (RESEARCH-2026 §5.5) is no longer independent,
  because Step 2 ports EcoLogits' relation. The measurement is the
  independent check now.
- Add `CITATION.cff` and a Zenodo DOI per release (ROADMAP 4.1).

**Done when:** `docs/VALIDATION.md` reports predicted vs measured with error
bars for at least two 2026 open-weight models, Step 2's bands are widened
wherever a measurement fell outside them, and the release has a DOI.

### Step 34 — Research refresh with an open network · S, recurring
- RESEARCH-2026 §6: the last round failed because arXiv, ScienceDirect,
  Hugging Face and the hyperscaler domains were blocked. Widen the
  environment allowlist, then work through §5 open questions 1–4:
  - read the Joule paper and record its boundary
  - resolve the 15 unverified arXiv ids
  - read the four sustainability PDFs (five, with Meta's from Step 4)
  - survey the live model pickers. **Changed in v4:** this part moves to
    Step 9's monthly runbook, because models now change faster than
    quarterly.
- Repeat quarterly, on the cadence ROADMAP 0.2 asks to be published.

**Done when:** each open question has a `fetched` citation or is recorded as a
negative result.

---

## Stage 5 — Reach: the same engine, new surfaces *(≈ 3–4 weeks)*

The engine has no dependencies, is typed and tested. Each surface below is
mostly packaging.

### Step 35 — `@ecoprompt/core` on npm, plus a CLI · M
- `exports` map with CJS and a thin ESM wrapper (no build step), and the
  existing `index.d.ts`.
- `npx ecoprompt "your prompt" --model gpt-5` prints the card; `--json` for
  scripts.

**Done when:** `npm i @ecoprompt/core` works in Node, Deno and a bundler, and
the CLI output matches the web app for the same input.

### Step 36 — SDK footprint wrapper · M
- `withFootprint(client)` wraps the OpenAI and Anthropic JS SDKs. It reads the
  **real** `usage` block (input, output, cached and reasoning tokens) from
  every response, so there is no estimation at all on the token side.
- **Changed in v4:** real reasoning-token counts are the evidence Step 2's
  hidden-token prior lacks. Developers can opt in to exporting
  aggregate-only counts per (model × effort) in the Step 41 team-file
  format, to narrow the prior. Exported files carry no text and no
  per-call rows.
- Emits a per-call footprint and session totals. Adds a CSV analyzer for
  provider usage exports.
- Developers are where query volume is. This is also the natural bridge to
  the paid, organization-level story.

**Done when:** a recorded fixture of real SDK responses produces footprints
identical to calling `estimateImpact` with the same usage numbers.

### Step 37 — MCP server · M
- `packages/mcp` exposes `estimate_footprint`, `coach_prompt`,
  `compare_models` and `explain_number` over stdio.
- Coding agents and assistants can check the footprint of a plan before
  running it, and report what a session cost. *Agents that know their own
  footprint* is a new category.

**Done when:** every tool works in the MCP Inspector, and one documented
client config works end to end.

### Step 38 — PWA with a share target, replacing the React Native app · M
- Add `manifest.webmanifest`, a service worker (fully offline, since the
  engine is local) and `share_target`. On Android, **Share → EcoPrompt Coach**
  from the ChatGPT or Claude app lands the text in the coach.
- On iOS, a published Shortcut opens the web app with the shared text.
- This delivers the one unique mobile capability ROADMAP 3.2 identified (share
  sheet intake) at a fraction of the cost of two native store pipelines. Move
  `apps/mobile` to `docs/legacy/` with a note explaining why.

**Done when:** the PWA passes Chrome's installability criteria, sharing text on
Android opens the coach pre-filled, and the app works in airplane mode.

### Step 39 — Embeddable eco-labels · S
- The Pages deploy renders `labels/<model>.svg`, EU-energy-label style: the
  grade at a typical prompt, the range, `data_source` and the catalog
  vintage. It comes with a copy-paste badge snippet.
- **Changed in v4:** labels exist for `current` models only. Each one shows
  the grade *range* and the estimation method, never a bare letter. A label
  for a superseded model redirects to its successor's.
- Static files with no tracking, for bloggers, docs and procurement.

**Done when:** every current catalog model has a label regenerated on each
deploy, and a snapshot test guards the SVG.

### Step 40 — Store launches · M
- ROADMAP 2.1–2.4: Chrome, then Edge and Firefox.
- Launch *after* Stages 0–1 and Steps 18–19, so the first reviewers see receipts,
  the feature nobody else has, rather than just a grade pill.
- **Changed in v4:** never launch on the 2025 catalog. A reviewer's first
  ChatGPT or Claude tab would show the wrong model. Stage 0 is a hard
  prerequisite, and the Step 9 freshness gate must be green on the release
  commit.

**Done when:** the extension is listed in the Chrome Web Store with the
privacy policy URL.

---

## Stage 6 — Teams without a server *(≈ 1–2 weeks)*

ROADMAP 5.2 names the tension: a team dashboard seems to need data to leave
the device, which ARCHITECTURE §5 promises never happens. The answer is to
not build a server.

### Step 41 — Aggregate-only team file · S
- **Export team file** writes a weekly summary: totals by grade, model family
  and site, plus counted savings. It contains no text, no per-prompt rows and
  no timestamps finer than a day. It has a schema version and a content
  hash.
- Document it in METHODOLOGY as *the aggregation boundary*: exactly what
  leaves the device, field by field.

**Done when:** the file schema is published and a test proves no text field
can appear in it.

### Step 42 — Zero-backend team dashboard · M
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

### Step 43 — Hosted relay only on demonstrated demand · gate
Build an optional relay (aggregates only) + SSO **only if** several teams use
Step 42 by hand for 4+ weeks. That is the monetization test for the
ARCHITECTURE "Next" row, run without writing a backend first.

---

## Stage 7 — Polish that compounds *(ongoing, ≈ 2 weeks total)*

### Step 44 — Accessibility · M
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
    Step 14's keyed rendering).
  - The modal needs a focus trap.
  - The effort radiogroup needs arrow-key support.
  - Add a skip link.
  - The Undo toast needs to stay up longer than 5.2 s.
- The extension pill updates through `aria-live="polite"`, and its card is
  fully keyboard-operable.
- Add axe checks to the Playwright job (ROADMAP 5.3).

### Step 45 — Localized equivalents and i18n · M
Relatable units are cultural: "kettle" lands in the UK, "microwave" in the
US, and miles or kilometers depends on the reader.
- Add a string catalog and locale-aware equivalents.
- Start with Dutch (the project's Digital Society School / Ministry of
  Finance origin), then Spanish, French and German.
- CJK tokenization is already handled.

### Step 46 — Share cards · S
- A user-initiated PNG of the weekly recap, rendered on a canvas.
- Open Graph and Twitter tags, so a shared coach link unfurls as a card. The
  web app has neither today.
- Growth that doesn't need telemetry (ROADMAP 5.1).

---

## Efficiency ledger

Measurable targets from the steps above. The catalog baselines were
measured on 2026-10-18 and the rest on 2026-09-25.

| What | Today | Target | Step |
|---|---|---|---|
| Models in pickers that aren't current (2025 or earlier, or superseded) | 22 of 22 | 0 | 1, 5 |
| Current picker labels resolved correctly | 0 of 23 | 23 of 23 | 6 |
| Labels silently resolved to an older sibling | 6 of 23 | 0, with a generated test for every family | 6 |
| Places that define the default model | 4, with 3 different ids | 1 | 7 |
| Current-model numbers shown without a range | all | none | 8 |
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
  rejected this, and v4 still doesn't do it. Step 2 estimates them from the
  thinking tier, as a range whose low end can't fall below frontier chat.
  That's a different method from copying a smaller sibling's numbers.
  Floors (Step 31) remain for generations past the catalog.
- **2025 models in any picker** (decision 2). They stay in the repo as
  reference data and nowhere in the UI except "Why this number?".
- **Hard-deleting the 2025 data.** It is the only measured evidence the
  2026 estimates rest on, and the only way old history can re-score.
- **Writing invented benchmark points for unmeasured models.** Estimates
  go in an `estimate` block that names its method (Step 1). They never go
  in fields that mean "measured".
- **Recalibrating the A–E bands.** RESEARCH-2026 §2.5 refuted the case with
  the actual distribution.
- **The React Native app.** Step 38 replaces it.

---

## Milestones

Each milestone ships on its own and can be demoed.

```
M0 2026 CATALOG ──── Steps 1–9     current models only · ranges · 2026 detection · migration  ◀ first
   │
M1 SOLID ─────────── Steps 10–17   bugs fixed · history v2 · perf budget · adapters · Playwright green
   │
M2 CLOSED LOOP ───── Steps 18–22    the pill shows what the answer ACTUALLY cost        ◀ signature
   │
M3 ONE-CLICK ─────── Steps 23–28   Apply · Budget Dial · 0 Wh answers · savings ledger
   │   └─ Step 40 store launch (needs ROADMAP 2.1 privacy policy)
   │
M4 PROVABLE ──────── Steps 29–34   evidence ledger · ranges · floors · quality frontier · validation + DOI
   │
M5 EVERYWHERE ────── Steps 35–39   npm + CLI · SDK wrapper · MCP · PWA share target · eco-labels
   └─ TEAMS ──────── Steps 41–43   aggregate-only files · zero-backend dashboard · relay gate
        Stage 7 (a11y, i18n, share cards) runs alongside from M3 on
```

**Rough total for one developer:** about 4 weeks for M0, then about 4–5
months for M1–M4. M5 and Teams add about 5 weeks. M0–M2 (about 12 weeks)
are enough to make the product unlike anything else in the category.

**If only four things get done:** Steps 1–8 (today every current model is
the wrong model), Step 10 (the bugs understate footprints), Steps 18 + 19
(observed output and receipts, the signature), and Step 23 (one-click
Apply, which turns advice into action).

---

## How we'll know it's working, without telemetry

| Signal | Where it comes from |
|---|---|
| Output-estimate error, before vs after calibration | Local, shown to the user (Step 21). Aggregated only via opt-in team files. |
| Share of prompts sent with a budget | Local history (Step 11) |
| Counted savings per active user | Savings ledger (Step 28) → team files (Step 41) |
| Adapter health | Weekly canary pass rate (Step 16) |
| Adoption | Store installs and ratings, npm downloads, MCP installs, stars. All public, none instrumented. |

---

## New risks this plan introduces

| Risk | Mitigation |
|---|---|
| Writing into host composers feels invasive, or breaks on a redesign | Adapter-scoped, always visible, always undoable (Step 23). The Dial is off by default (Step 24). Canary + fixtures catch breakage (Step 16). |
| Watching replies looks like surveillance | Store counts, never text. Say so plainly in PRIVACY.md. Recording has an off switch and a per-site disable (Step 11). |
| Brevity lowers answer quality | Receipts show the real effect. The quality frontier (Step 32) keeps recommendations honest. Dial skip rules (Step 24). |
| Caching makes conversation estimates too high | Report a range with a cached lower bound, and document it (Step 20). |
| The quality data licence is unclear | Verify before import; ship without it rather than ship it wrong (Step 32). |
| Scope, with one maintainer | Every milestone ships on its own. Stages 5–6 are optional and gated (Step 43). |
| Estimates for unmeasured models are wrong | They are ranges with a named method (Steps 2, 8). The validation study measures the open-weight path (Step 33). Real reasoning-token counts narrow the thinking prior (Step 36). |
| Tier assignment for closed models is a judgement call | Every assignment sits in one reviewable table (Step 5), with the price-order cross-check (Step 2). |
| Rounding up thinking models overstates them | That is the deliberate direction of error (decision 1). It is labelled "likely high" and documented in METHODOLOGY §2.5. |
| The catalog goes stale within weeks | A monthly runbook, a 90-day CI gate, and floors that flag the gap on real sites (Steps 9, 17, 31). |
| Vendor pages can't be fetched from this environment | Rows stay `search-only` until fetched. A `search-only` source can't be the only source for a shipped number (Step 9). |

---

## Definition of done, for every step

1. Tests cover the change: unit, property or Playwright, whichever fits.
2. `node scripts/sync-core.js` has been run and `npm test` passes.
3. If a number changed, `docs/METHODOLOGY.md` says why, with a citation id.
4. If data handling changed, PRIVACY.md changed in the same PR.
5. There is a `CHANGELOG.md` entry, and the version is bumped from its single
   source.
6. If the catalog changed, every new or changed entry lists its sources with
   a `fetched` or `search-only` status, and its estimation method.
