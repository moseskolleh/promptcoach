# Changelog

Notable changes to EcoPrompt Coach. Newest first. The steps named here are
the ones in [PLAN.md](PLAN.md).

## Unreleased

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
