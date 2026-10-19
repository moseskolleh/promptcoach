# Changelog

Notable changes to EcoPrompt Coach. Newest first. The steps named here are
the ones in [PLAN.md](PLAN.md).

## Unreleased

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
