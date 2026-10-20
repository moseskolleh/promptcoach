# Changelog

Notable changes to EcoPrompt Coach. Newest first. The steps named here are
the ones in [PLAN.md](PLAN.md).

## Unreleased

### Detection for 2026 pickers (PLAN.md Step 6)

- **The model pickers people see today are read correctly.** All 23 labels
  checked in PLAN.md finding 2 now resolve to the right model. Before, six
  of them silently resolved to an older, cheaper sibling.
- **Modes count.** ChatGPT's *Instant … Extra High* and *Pro*, Grok's
  *Fast*, *Expert* and *Heavy*, and meta.ai's *Instant*, *Thinking* and
  *Contemplating* set the model and its effort. The card says which, for
  example "GPT-6 Sol (mode detected on page) · extra-high effort".
- **A thinking mode on the page means thinking is on.** For a model whose
  thinking is optional, the estimate's low end now includes the least
  thinking (new `thinkingOn` option; METHODOLOGY §2.5.3).
- **Newer generations fail closed**, from a list generated from the
  catalog: GPT-7, Claude 6, Opus 5.6, Gemini 5 and the like. The card
  shows the site default and says the page's model isn't in the catalog
  yet.
- **Site defaults are 2026 models**, shown as assumed. Routers
  (Perplexity, Poe, Copilot, Gemini's *Auto*) say the model isn't visible.
  DeepSeek and Perplexity show no estimate, since their models aren't in
  the catalog.
- **meta.ai is supported.**
- **Demo playground:** 2026 labels on every page, an effort switch on
  Clarion, and two new pages, Orbit (meta.ai-style) and Quasar
  (Grok-style).
- Fix: an unknown generation no longer falls through to the looser
  selector group, where an unrelated label could read as an older model.

### The 2026 roster (PLAN.md Step 5)

- **23 current models** join the catalog, each estimated (`data_source:
  "estimated"`), with one fetched source per fact:
  - Anthropic: Claude Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5.
  - OpenAI: GPT-6 Astra, GPT-6.1 Sol, GPT-6 Luna.
  - Google: Gemini 4 Argon, Gemini 3.8 Flash, Gemini 3.5 Flash-Lite,
    Gemma 4 26B-A4B, Gemma 4 31B.
  - Meta: Muse Spark 1.3, Muse Spark Open, Muse Glimmer 30B.
  - xAI: Grok 4.7.
  - Moonshot: Kimi K3.
  - Z.ai: GLM-5.3, GLM-5.3-Flash.
  - Alibaba: Qwen3.8-27B.
  - Mistral: Mistral Small 4, Mistral Medium 3.5.
  - NVIDIA: Nemotron 3 Ultra.
- **GPT-6 Sol is a reference entry** superseded by GPT-6.1 Sol, as OpenAI
  calls it the previous generation.
- **Every old entry says what replaced it** (`superseded_by`). DeepSeek V3
  and R1 point nowhere until DeepSeek V4 can be read from a primary source.
- **Waiting for a primary source:** DeepSeek V4, Qwen3.8-2.4T-A95B (no
  published precision, and too large to assume one), Gemini 3.1 Pro
  (preview id only), Gemma 4 E4B, Mistral Large 4.
- **The pickers list only current models.** The default models are now
  GPT-6 Luna (web coach), GPT-6.1 Sol (extension) and Gemini 3.5 Flash-Lite
  (popup comparison).
- **Gate refinement:** a precision a lab doesn't publish is estimated at 16
  bits, which errs high, so only a stated precision needs a source. This
  holds up to 200B total parameters, the range the estimator was fitted
  on. A larger model with no published precision waits.
- **Known issue:** very large open-weight models (Kimi K3, GLM-5.3, Muse
  Spark Open) estimate at tens of Wh per query at standard effort. At their
  vendors' default max or xhigh effort, that rises to hundreds of Wh. See
  PLAN.md Step 5's status note.

### Hosts for the 2026 models (PLAN.md Step 4)

- **Four new hosts** in `grids.json`: Meta, Moonshot AI, Alibaba Cloud and
  Z.ai. None has a document of its own that could be read from the build
  environment, so each **borrows** another host's figures and says so
  (`proxy_of`). Meta borrows AWS's until Meta's sustainability report PDF
  is read. The three China hosts borrow DeepSeek's China averages, as the
  plan specifies. See METHODOLOGY §4.1.
- **The engine resolves a proxy once, at load.** A proxy carries no numbers
  of its own and can't point at another proxy; anything else is refused.
  Estimates report the borrowing in `factors.hostProxyOf`.
- **Shown in the web coach:** the carbon card says "borrowed from AWS until
  Meta's own figures are read".
- **Gated in CI:** every grid entry cites a source, or is a proxy whose
  notes say why.
- Fix: a `host_key` such as `constructor` no longer resolves to an inherited
  property.

### Catalog gates and a monthly refresh (PLAN.md Step 9)

- **`scripts/check-catalog.js`** checks `models.json` in CI, as its own
  step, and in `npm test`. On top of the schema v3 rules it adds:
  - **No estimate on search-only facts.** Sources name what they vouch
    for (`fact`). A current model's estimate needs a fetched source for
    each fact it rests on: `params`, `precision` and `thinking` for
    `active-params`; `tier` and `thinking` for `tier`.
  - **No deny-listed citations.** A current entry may not mention an arXiv
    id from RESEARCH-2026 §3.1. The list is read from that document.
  - **`superseded_by` chains** end at a current model or an explicit
    `null`, with no loops and no unknown ids. Once any model is current,
    every reference entry needs one.
- **`check-apps` checks hard-coded model ids.** Every model id written
  into the apps, demo pages or core must exist in the catalog.
- **`docs/CATALOG-REFRESH.md`** is the monthly runbook: network access
  first, then what to check per provider, how to record sources, what each
  CI message means, and what the refresh PR lists.
- Nothing a user sees changes.

### Honest labels for estimates (PLAN.md Step 8)

- **One labelling function.** `describeImpact()` gives every app the same
  label for a result. See METHODOLOGY §2.5.8. A model nobody has measured
  shows:
  - its range, "0.252–12.6 Wh", or "≥ 8.93 Wh" for a floor;
  - an *estimated · tier* or *estimated · from parameters* chip;
  - a grade range when the range crosses a band ("A–E", coloured from A to
    E), or "≥ D" for a floor;
  - *likely high*, the chosen direction of error.
- **Measured and benchmarked models look exactly as before.**
- **Where it shows:**
  - web: coach, sticky pill, Compare cards, table and chart, explorer and
    library;
  - extension: pill, card and popup;
  - mobile: the badge accepts a grade range.
- **Everyday units for ranges.** `forImpact()` writes a range in one unit
  when one fits ("1.5–75.5 minutes of an LED bulb"). Otherwise each end
  gets its own unit. New: `energyRange()`, `waterRange()`,
  `carbonRange()`, and a repeat count, `forImpact(impact, 25)`.
- **No percentage between overlapping ranges.** `savingClaim()` returns
  "at least N%" only when the ranges are apart, and "probably less"
  otherwise. Compare's banner and the coach's switch button use it. This is
  pulled forward from Step 27.
- **Totals are ranges** when any entry is an estimate. `aggregate()` adds
  `range`, and `forTotals()` uses it. The extension's history stores each
  estimate's `lowWh` and `highWh`, and the web library keeps an entry's
  range.
- **Old model names leave the copy.** The web hero facts and Compare's
  opening trio are picked from the catalog. The README example waits for
  Step 5.
- **Fix:** the popup's quick grades were computed at *low* effort, because
  the effort control was read before it was restored. They now use the
  saved effort. This changes the popup's grades for o3, o4-mini,
  GPT-5 (Thinking) and DeepSeek-R1.

### Effort as each provider names it (PLAN.md Step 3)

- **One effort scale:** `none`, `low`, `standard` (alias `medium`),
  `high`, `xhigh`, `max`. Each level is a factor range on thinking. `xhigh`
  and `max` start at `high` and only widen upward, since nothing past
  `high` has been measured. See METHODOLOGY §2.5.7.
- **Provider vocabularies** (`EFFORT_VOCABULARIES`, `effortFromLabel()`)
  for Anthropic (fetched), plus OpenAI, Google, xAI, DeepSeek and Meta
  (search-only).
- **How the engine applies effort:**
  - An unknown or missing effort now means the model's `default_effort`.
    Only without one does it mean `standard`.
  - `none` switches thinking off. An adaptive or optional model then gets
    a point estimate; an `always` model treats it as `low`.
  - `multiAgent: true` makes an estimated model's figure a floor:
    `range.highWh` is null and `grade.floor` is set.
- **Benchmarked thinking models keep their single factor.** `xhigh` and
  `max` count as `high`, and `none` as `low`. The reference snapshot is
  unchanged.
- **Inherited property names no longer resolve.** Names like
  `constructor` used to pass as an effort level, effort vocabulary,
  weight precision or tier; now they are refused.

### Estimators for models nobody has measured (PLAN.md Step 2)

- A `current` entry can now carry an `estimate` block instead of benchmark
  points. The engine derives its numbers from the reference entries. Two
  methods are built; see METHODOLOGY §2.5.
- **`active-params`, for open-weight models.** It ports EcoLogits'
  energy-per-token relation (genai-impact/ecologits `d0b76e3`, MPL-2.0).
  It uses the model card's weight precision, and is bridged to this
  catalog's scale by the measured Llama 3.3 70B and Llama 3.2 1B entries.
  Its band is ×0.48–×2.08.
- **`tier`, for closed models.** It takes the median of a tier's
  reference members, with the cheapest-to-dearest member as the range.
  Tiers are named on the reference entries.
- **Thinking adds hidden tokens,** priced at the model's own per-token
  cost. The evidence is the GPT-5 pair and DeepSeek-R1's measurement.
  - `always` thinking pays at least the low end, with a floor at the
    tier's median plain answer.
  - `adaptive` and `optional` thinking range from no thinking at all.
- **A model that thinks is a range only.** `energy.wh` is then the range's
  geometric centre, for sorting and totals, never for display.
- Results gain `energy.range`, `water.range`, `carbon.range`, `grade.range`
  and `estimate`. The engine gains `evidence`.
- `scripts/estimator-validation.js` prints the leave-one-out tables.
- **No catalog model is estimated yet,** so nothing a user sees changes.
  The 2026 entries arrive in Step 5. The reference snapshot test still
  passes unchanged.

### Catalog schema v3 (PLAN.md Step 1)

- Every `models.json` entry now has a `status`.
  - `current` means a model a user can pick today.
  - `reference` means an older model, kept as evidence for the estimators
    and so stored history can re-score.
  - All 22 existing entries are `reference`.
- `thinking` (`always` / `adaptive` / `optional` / `none`) replaces
  `is_reasoning`. The `retired` flag, which the engine never read, is
  gone.
- Open-weight reference entries carry parameter counts and per-fact
  `sources`, fetched from the labs' model cards.
- Engine changes:
  - `listModels()` returns current models only.
    `listModels({ includeReference: true })` returns everything.
  - `compareModels()` with no `modelIds` compares the same set.
  - Reference ids always resolve.
  - Unknown statuses, unknown thinking modes, duplicate ids, and entries
    with an `estimate` block (which needs Step 2's estimators) are refused.
- **No number changed.** A snapshot test pins every reference estimate.
- **The UI is unchanged for now.** The apps ask for reference entries
  explicitly until Step 5 adds the 2026 models.
