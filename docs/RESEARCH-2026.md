# Research: the 2026 evidence base

**Date of research:** 2026-09-24 · **Method:** eight parallel web-grounded
research passes, each audited by an independent adversarial fact-checker, then
synthesised and critiqued.

This document records what that research actually established, what it failed
to establish, and — just as importantly — what it found had *not* changed.
It is the evidence trail for the changes released alongside it.

> **Read this first.** The single most useful output of this round was not new
> data. It was discovering that **the most severe defects were in our own code,
> not in the literature**, and that a large share of the incoming research could
> not be verified well enough to write down. Three of eight dimensions were
> effectively unaudited. The honest response to most of this research was to
> *subtract* claims, not add numbers.

---

## 0. A hard constraint on everything below

The research ran inside a network policy that blocked **arxiv.org,
nature.com, sciencedirect.com, huggingface.co, epoch.ai, ml.energy,
eur-lex.europa.eu** and every hyperscaler sustainability domain. Server-side
web *search* worked; direct *fetching* of primary sources did not.

So unless a finding below is explicitly marked **fetched**, its citation was
surfaced by search and **nobody in this pipeline opened the document**. That is
not a formality. It is the difference between a citation and a rumour, and this
project's entire defensible asset is the difference between those two things.

Two verification routes were also unavailable: Scite (monthly quota exhausted)
and Scholar Gateway (corpus is Wiley-centric, poor arXiv coverage).

---

## 1. What we found in our own code

Every item here was verified by **executing the engine**, so none of it depends
on the network constraint above. These drove the release.

### 1.1 Detection failed toward the cheaper model, every time

`detectModelFromLabels()` was run against the labels a 2026 user actually sees:

| Picker label | Resolved to (before) | Why that is wrong |
|---|---|---|
| `Opus 4.5`, `Opus 5.5`, `Opus` | *(null)* → `claude-4.5-sonnet` | Opus absent from catalog **and** regex |
| `Sonnet 5` | `claude-4.5-sonnet` | two generations old, under the wrong name |
| `Gemini 3 Pro` | `gemini-2.5-pro` | newer generation as older |
| `Gemini 3 Deep Think` | `gemini-2.5-pro` | heavy reasoning → a **non-reasoning** entry |
| `GPT-5.6 Sol`, `GPT-5.1` | `gpt-5` | unknown minor version swallowed by `5(?:\.\d)?` |
| `Grok 4 Heavy` | *(null)* → `grok-3` | |
| `V4` (DeepSeek) | *(null)* → `deepseek-v3` | |
| `Auto` (router) | *(null)* → `gpt-5` | router modes unmodelled |
| Copilot `Deep Research` | `gpt-5-thinking` | **11.6× overstatement** — see 1.2 |

**Every failure resolved to an older, cheaper or non-reasoning sibling.** The
error was not random — it was one-directional, and it ran in the direction of
understating the footprint. For a tool whose entire purpose is to make a hidden
cost visible, that is the worst available direction to be wrong in.

The worst case compounded. `gemini-2.5-pro` carries `is_reasoning: false`, and
the effort multiplier is applied only `if (model.isReasoning)`. So a *Deep
Think* query reported **0.42 Wh, grade B**, and passing `reasoningEffort: high`
changed nothing — it was silently dropped. A comparable heavy-reasoning entry
(`o3`) is **14 Wh, grade E**: roughly **33× understated**, and a B where the
truth is nearer E. `METHODOLOGY.md` §8.7 already named this class of error as
"the largest single source of error in per-query estimates". It was
demonstrable, not theoretical.

### 1.2 One failure ran the other way

`copilot.microsoft.com` was mapped to the `openai` family, which put ChatGPT's
`\bdeep\s+research\b` rule in scope for Copilot's own Deep Research mode —
reporting a reasoning model's energy against Copilot's non-reasoning default,
an **11.6× overstatement**. This was a pre-existing bug, not 2026 churn.

`perplexity.ai` and `poe.com` appear in the extension manifest but had no
family at all, so detection returned null unconditionally and the host default
served a number for a model the page never revealed.

### 1.3 The engine contradicted its own citation

The most severe finding, and it came from fitting the coefficients and printing
them rather than from any paper.

`calculator.js` stated in its header that *"the fit consistently recovers
e_in ≈ 0"*. **It does not, for any of the 21 models** — `e_in` spans
**0.0009–0.516 mWh/token** and is strictly positive throughout. Because the
largest fitted benchmark point is **10,000 input tokens**, extrapolating that
term linearly into today's context windows produced:

| Input tokens (reply held at 500) | Energy | Grade | Share from the input term |
|---|---|---|---|
| 10,000 *(the fitted maximum)* | 2.6 Wh | C | 57% |
| 50,000 | 8.5 Wh | D | 87% |
| 100,000 | 15.9 Wh | E | 93% |
| 200,000 | 30.8 Wh | E | **96%** |
| 1,000,000 | 149.3 Wh | E | **99%** |

For scale, that model's own long benchmark (10k in / 1.5k out) is 4.35 Wh.

So at long context the engine attributed almost all of a query's energy to
input — while **Adamska et al. (arXiv:2503.10666), cited in this very catalog
as the basis for output-dominance (r≈0.9), says the opposite**. Contradicting
your own cited reference is the one position a citation-backed product cannot
afford. The header comment was worse than stale: it actively told a maintainer
that long contexts were safe.

### 1.4 `_metadata.last_updated` did not track its own file

`models.json` was edited on 2026-09-10 (commit `f5027ca`), but that commit
added **no models** and never bumped `last_updated`, which still read
`2026-06-10`. So the roster was genuinely un-refreshed while the date field was
simply wrong about the file it describes. Any staleness gate keyed on that field
would have fired on freshly edited data.

---

## 2. What the literature actually said

### 2.1 Verified from primary sources — the only vendor facts that were

Anthropic's current lineup was **fetched** from Anthropic's own platform docs
and help centre, with verbatim strings confirmed by the fact-checker, and then
**independently corroborated by a second route** (the bundled Claude API model
reference), which agreed on every point:

- Lineup: **Claude Fable 5.1, Opus 5.5, Opus 5, Sonnet 5, Haiku 4.5**.
- Context: 1M for Fable 5.1 / Opus / Sonnet 5; **200K** for Haiku 4.5.
- Thinking is **always on** for Fable 5.1 and Opus 5.5.
- Effort levels: **Low / Medium / High / Extra high (xhigh) / Max** — against
  the engine's three tiers (`low` / `standard` / `high`).
- Claude 3.7 Sonnet appears nowhere in the current lineup.
- Haiku 4.5 carries a retirement commitment no earlier than **2026-10-15**.

**No per-query energy figure exists for any of these models.**

### 2.2 Negative results — recorded so the next refresh does not re-litigate them

These are genuine findings, not search failures:

- **No lab has published a per-query energy figure for *any* 2026-generation
  model.** Every 2026 entry must therefore be `extrapolated`, with no anchor.
- **Jegham et al. (arXiv:2505.09598) is unrevised at v6** (24 Nov 2025). No v7.
- **Google has published no successor** to its Aug 2025 disclosure of
  0.24 Wh / 0.26 mL / 0.03 gCO₂e per median Gemini Apps prompt.
- **ML.ENERGY v3** data is current as of 2026-02-16 — nothing newer than the
  catalog's existing freeze.

### 2.3 Verified by independent recomputation

The competitive dimension was the strongest, because its fact-checker
recomputed the numbers from git clones rather than trusting a page:

- **EcoLogits 0.11.1** (MPL-2.0): 334 model entries across 6 providers.
  Architecture and OpenRouter throughput only — **no energy field anywhere**.
  Its energy model has *no input-token term at all*, which makes it the natural
  regression target for our clamp: at `T_in ≈ 0` the two should converge.
- **ML.ENERGY**: 1,858 configurations. Boundary is *GPU-only, Zeus/NVML,
  steady-state, vLLM 0.11.1, H100/B200 — excludes CPU, RAM, PUE, embodied, idle
  and training.* Citable as a cross-check; **not importable** — the repo that
  ships the JSON has no LICENSE file.
- **AI Energy Score**: GPU energy only, Wh per 1,000 queries, H100, FP16.

### 2.4 Two things that argue against the product's current design

- **Keying footprint on `model_id` is weaker than we present it.** ML.ENERGY's
  measured data shows **batch size moving per-request energy 12–17×** for one
  model on one GPU — more than the difference *between* models. No benchmark
  point in our catalog states an assumed batch size, and `energy_wh_std` almost
  certainly does not span that. The point estimate is doing more work than the
  evidence licenses.
- **The `measured` tier was overstated.** Five of eight `measured` entries were
  closed hosted models that no third party can instrument. Fixed in this release
  by renaming, not by changing any number.

### 2.5 Where the research was wrong and the product was right

Recorded because it would otherwise waste a future cycle. One dimension argued
the A–E bands are inflated and would grade "the large majority of real prompts"
as A, reproducing the EU's A+++ failure. **Computing the actual distribution
refutes this**: across all 22 catalog models × 3 prompt shapes (66 points) it is
**A:13 / B:23 / C:14 / D:7 / E:9**, and on short prompts alone
**A:9 / B:9 / C:1 / D:1 / E:2**. At a realistic 150-in/400-out prompt
the live per-site defaults put ChatGPT, Claude, Copilot and Grok all in **B**,
with only Gemini Flash in A. **Do not recalibrate the bands.** The underlying
source measures *judgements of environmental friendliness*, not behaviour —
comprehension evidence being used to support a behavioural claim.

---

## 3. What collapsed under verification

This is the part worth reading before trusting any future research pack.

| Dimension | Verdict |
|---|---|
| **Regulation** | All 21 findings arrived with **every source marked unopened**. Unusable. |
| **Measurement studies** | 11 of 17 claims rest on arXiv IDs nobody resolved to a document, several carrying suspiciously precise figures. |
| **Provider disclosures** | **Not one** hyperscaler PUE/WUE figure was read from its primary PDF. Its own fact-checker caught a **fabricated citation title**, an impossible date ordering, and a mis-attribution of Amazon's self-computed benchmark onto Google. |

### 3.1 Do NOT add these citations

The following arXiv identifiers appeared across the measurement, regulation and
behaviour dimensions. **Not one was resolved to a document by anyone in this
pipeline**, and several carry unusually precise figures — the profile that
fabricated citations take. One citation in this set was already refuted outright
on integrity grounds.

```
2601.22076  2601.22357  2512.03024  2603.02949  2603.20224  2604.09048
2606.10660  2606.10861  2606.21869  2607.02531  2608.06733  2608.23968
2608.25096  2608.28044  2609.19499
```

Treat this as a **verification queue, not a reading list**. Shipping any of them
would be the single largest threat to the product's core asset.

Note that `2601.22357` ("Small Talk, Big Impact") is **already cited in
`METHODOLOGY.md` §9** with no URL and no author list. It could not be verified
in either direction here. It is flagged, not condemned — someone with arXiv
access should resolve it or remove it.

### 3.2 The number we deliberately did not write down

Three independent dimensions and two third-party repos report the **published
Joule** median as **0.31 Wh (IQR 0.16–0.60)**, against the 0.34 Wh preprint
figure the catalog asserts. Every one of those routes was proxy-blocked.

We did **not** substitute 0.31. You do not need to verify 0.31 to know you
should stop asserting 0.34 *as the Joule figure* — so the claim was removed and
the citation version-pinned to the preprint with an explicit warning. Removing
an unsupported claim requires no new citation and carries no verification risk.
A 0.31 Wh *GPU-plus-server* figure and a 0.31 Wh *full-stack* figure mean very
different things here, and nobody has read which one it is.

---

## 4. What was built from this

| ID | Change | Grounded in |
|---|---|---|
| R1 | Detection fails closed on unknown generations; Copilot gets its own family; routed hosts flagged; detection returns provenance | §1.1, §1.2 — executed, not cited |
| R2 | Input term clamped past 5× the fitted range, reports `energy.clamped`, grade marked provisional; false header comment corrected | §1.3 — executed |
| R3 | `claude-sonnet-5` added with carried-forward points; 3.7 Sonnet retired; 4.5 Sonnet marked legacy | §2.1 — fetched + corroborated |
| R4 | Joule clause removed, citation version-pinned, `measured` → `benchmarked` for closed models, Altman boundary strengthened, negative results recorded | §2.2, §2.4, §3.2 |
| R5 | Dev host matches removed from the release manifest; Firefox data-collection declared | engineering dimension, MDN fetched |

### 4.1 Where this release departs from the research

The research recommended adding **Opus 5.5 and Fable 5.1** alongside Sonnet 5,
seeded from Sonnet's benchmark points. **They were deliberately left out.**

Seeding a larger, always-on-thinking model from a smaller non-thinking model's
points would report a lower number under a higher-tier name — which is precisely
the one-directional understatement described in §1.1 that this release exists to
fix. Adding a correct *name* over a known-low *number* trades a visible error for
an invisible one.

Sonnet 5 is different and was added: it is the same tier and same host as the
entry it carries forward from, so the number is unchanged and only the
attribution is corrected.

Until a measurement exists, Opus and Fable resolve to **no catalog entry**,
which the engine now reports as such rather than guessing a sibling.

---

## 5. Open questions, in priority order

1. **Read the Joule paper** (arXiv:2509.20241 / `PII S2542-4351(26)00114-5`) and
   record its stated boundary. This is the single most important missing fact.
2. **Resolve or remove** the 15 unverified arXiv identifiers in §3.1, starting
   with `2601.22357`, which is already shipping in `METHODOLOGY.md`.
3. **Download the four hyperscaler sustainability PDFs.** No `grids.json`
   numeric change should be made until someone has.
4. **Survey the actual model pickers in a browser.** Every non-Anthropic UI
   string in this research is single-sourced through a blocked proxy, which is
   why no new OpenAI / Google / xAI / DeepSeek label patterns were added.
5. **Cross-check the clamp against EcoLogits** (§2.3) — its model has no input
   term, so at low `T_in` the two estimators should converge.
6. **State an assumed batch size** per benchmark point, or widen the bands to
   span the 12–17× that batching moves (§2.4).

---

## 6. How to redo this well

The blocking constraint was network policy, not method. Before the next round,
widen the environment's allowed domains to include at least `arxiv.org`,
`sciencedirect.com`, `huggingface.co`, `ml.energy` and the hyperscaler
sustainability domains. The adversarial fact-checking stage worked exactly as
intended — it caught a fabricated title, an impossible date pair and a
self-refuting premise — but a fact-checker that cannot open a URL can only ever
return "unverifiable", which is what most of this round produced.
