# EcoPrompt Coach — Scientific Methodology (v2)

This document is the single source of truth for every number the product
shows. It states the formulas, the data they are fitted from, the system
boundary, and the known limitations — in that order, because the most common
failure mode of "AI footprint" tools is mixing numbers from incompatible
boundaries.

Last updated: 2026-09-24. Evidence audit: [RESEARCH-2026.md](RESEARCH-2026.md).

---

## 1. What changed since v1

v1 was built on a single paper (Jegham et al. 2025, v4) and interpolated
energy linearly between three benchmark buckets. v2 keeps that paper as its
benchmark backbone (now v6, Nov 2025, 30 models) and adds the wave of
2025/2026 primary disclosures and production studies:

| Source | Per-query figure | Boundary |
|---|---|---|
| Google, *Measuring the environmental impact of delivering AI at Google* (arXiv:2508.15734, Aug 2025) | **0.24 Wh, 0.26 mL water, 0.03 gCO₂e** per median Gemini Apps text prompt | Full serving stack (TPU 58% + host 25% + idle 10% + PUE overhead 8%); market-based carbon incl. embodied; on-site water only |
| OpenAI / S. Altman, *The Gentle Singularity* (Jun 2025) | **0.34 Wh, ~0.32 mL** per average ChatGPT query | Undisclosed |
| Mistral AI lifecycle analysis of Mistral Large 2 (Jul 2025, ISO 14040/44, peer-reviewed) | **1.14 gCO₂e, 45 mL water** per 400-output-token response | Cradle-to-grave LCA incl. training amortization and embodied hardware |
| Epoch AI, *How much energy does ChatGPT use?* (Feb 2025) | **~0.3 Wh** typical GPT-4o query; ~2.5 Wh at 10k-token input | Bottom-up FLOP estimate incl. overhead |
| Oviedo et al. (Microsoft), *Energy use of AI inference* (arXiv:2509.20241; Joule, 2026) | **median 0.34 Wh** (IQR 0.18–0.67) for >200B-param models | Production serving (real batching/utilization/PUE); finds non-production extrapolations overstate 4–20× |
| Jegham et al., *How Hungry is AI?* (arXiv:2505.09598, v6 Nov 2025) | 0.42 Wh (GPT-4o short) → **>33 Wh** (o3 / DeepSeek-R1 long); GPT-4.1 nano ≤0.45 Wh even on long prompts | API-side inference estimates × provider PUE/WUE/CIF |
| URI AI lab / Jegham dashboard (Aug 2025) | GPT-5 medium **reasoning** response ~18.35 Wh avg, up to ~40 Wh | Contested — assumes full reasoning token budgets |
| Adamska et al., *Green Prompting* (arXiv:2503.10666, Mar 2025) | — | Finds **response length is the dominant energy driver (r ≈ 0.9)**; input length matters far less |

**Convergence:** four independent sources (Google 0.24, Altman 0.34, Epoch
~0.3, Microsoft/Joule 0.34) put a *typical short text query on an efficient
frontier stack* at **0.2–0.4 Wh**, while reasoning modes and very long
contexts run **10–100× higher**. That two-orders-of-magnitude spread —
driven by model choice, output length, and reasoning budget — is exactly the
behavioural lever this product coaches on.

---

## 2. Energy model

### 2.1 Per-token linear model

For each model we fit three coefficients from its three published benchmark
configurations (short = 100 in / 300 out, medium = 1000/1000, long =
10000/1500 tokens; Jegham et al., or provider-anchored estimates where
marked):

```
E_query [Wh] = E_fixed + e_in · T_in + e_out · T_out_effective
```

- `e_out` (Wh per output token) — dominant term. Decoding is sequential: each
  generated token requires a full forward pass.
- `e_in` (Wh per input token) — small. Prefill is processed in parallel; the
  fit consistently recovers `e_in ≈ 0` until very long contexts (consistent
  with Epoch AI's 2.5 Wh @ 10k input and with Adamska et al.).
- `E_fixed` (Wh) — per-request overhead: scheduling, host CPU/DRAM, idle
  provisioning share (the components Google's full-stack measurement showed
  make up ~42% of real per-prompt energy).

The 3×3 system is solved exactly; if measurement noise produces a negative
coefficient, every subset of the three terms is re-fitted by least squares
and the best-fitting non-negative subset is kept (non-negative least squares
for a three-parameter model). Estimates are therefore always monotonic in
both token counts and reproduce every published benchmark point within 5%.
(An earlier fallback pinned the *input* term whenever *any* coefficient went
negative, which overstated o4-mini's and Llama 3.3 70B's short-query energy
by 100% and 40% respectively; `npm test` now asserts the reproduction for
every model.)

*Worked example (GPT-4o, measured points 0.421 / 1.214 / 1.788 Wh):*
fit yields `e_in ≈ 0.0000009`, `e_out ≈ 0.00113`, `E_fixed ≈ 0.081` —
i.e. ~1.1 mWh per output token, near-zero per input token, 0.08 Wh fixed.
The fit reproduces all three measured points and matches the literature's
decode-dominance finding.

### 2.2 Reasoning (thinking) models

Reasoning models emit hidden chain-of-thought tokens the user never sees.
In the fit these surface in `E_fixed` and `e_out` (DeepSeek-R1: `E_fixed ≈
21.6 Wh` — its hidden thinking budget barely varies with visible output
length). The engine therefore scales **everything except prefill** by a
user-selectable effort factor:

```
effort ∈ { low: 0.4, standard: 1.0, high: 2.5 }
E_query = effort · (E_fixed + e_out · T_out) + e_in · T_in
```

`standard` reproduces the benchmark conditions. Uncertainty bands are
doubled whenever effort ≠ standard or the request exceeds the measured range
on either axis (10k input or 1.5k output tokens), because we are
extrapolating.

### 2.3 Task multipliers

Non-chat tasks scale energy: image generation ×3, agentic/multi-step ×2,
data analysis ×1.4, summarization ×0.7, translation ×0.6 (v1 factors,
retained as order-of-magnitude estimates pending dedicated benchmarks).

### 2.4 Multi-turn context

*Not yet written. It lands with the conversation meter (PLAN.md Step 20).*

### 2.5 Estimating models nobody has measured

No lab has published a per-query energy figure for any 2026 model
(RESEARCH-2026 §2.2, re-checked 2026-10-18). So a `current` catalog entry
does not carry benchmark points. It carries an `estimate` block naming one
of two methods, and the engine derives the number from the `reference`
(pre-2026) entries. Invented numbers never go into `energy_wh_mean`, which
keeps meaning "a benchmark said this".

Every estimate is a **range**, carried as `energy.range` with matching
`water.range` and `carbon.range`, and its grade carries `grade.range`. A
model that thinks is shown **as a range only**: its `energy.wh` is the
range's geometric centre, kept for sorting and totals, never for display
(`estimate.rangeOnly`, decision of 2026-10-19). Every estimate is labelled
*extrapolated*.

To reproduce every table in this section, run:
`node scripts/estimator-validation.js`

#### 2.5.1 Open-weight models: the active-parameter estimator

The per-output-token relation comes from **EcoLogits** (genai-impact,
MPL-2.0). It is ported from `ecologits/impacts/llm.py` at commit
`d0b76e3` (v0.11.3, 2026-10-14), with the constants copied from source:

```
GPUs     = 2^ceil(log2(ceil(1.2 · P_total · bits/8 / 80 GB)))
gpu_Wh   = α · e^(β·B) · P_active + γ          (per GPU, per token)
server_Wh = (latency/3600) · 1.2 kW · (GPUs/8) / B
latency  = α_L · P_active + β_L · B + γ_L      (seconds per token)
e_out,IT = GPUs · gpu_Wh + server_Wh
```

Here B = 64 (EcoLogits' batch size) and P is in billions. EcoLogits fitted
these constants on ML.ENERGY leaderboard data: vLLM on NVIDIA H100 80 GB,
models up to 200B parameters. We use its fallback latency regression,
because no measured throughput is available.

**One deliberate deviation.** EcoLogits assumes 16-bit weights for every
model. 2026 models ship FP8 or FP4 weights and are served that way, so the
GPU count uses the precision the model card states, falling back to 16
bits. This matters: an 816B model needs 32 GPUs at BF16 but 8 at NVFP4.

**The bridge to this catalog's scale.** EcoLogits' boundary is not Jegham
et al.'s. For the same models, our measured reference entries run
1.3–2.7× above EcoLogits after PUE. So:

```
e_out = e_out,IT · PUE_host · k
k     = geometric mean over the calibration entries of
        (fitted e_out / EcoLogits e_out · PUE)
```

- **Calibration entries.** These are the measured, non-thinking open-weight
  reference entries: today, Llama 3.3 70B (ratio 1.29) and Llama 3.2 1B
  (2.69), so k = 1.86. Their parameter counts are fetched from Meta's model
  cards.
- **e_in and E_fixed.** These take the calibration entries' own
  proportions: e_in = 0.023 · e_out (geometric mean), and E_fixed is about
  17 output tokens' worth.
- **The band.** It is **×0.48–×2.08**, the full factor by which the two
  calibration entries disagree, applied on either side. The leave-one-out
  check below shows errors that size are real.

Without the bridge, open-weight models would look up to 2.7× cleaner than
closed ones purely because of method.

#### 2.5.2 Closed models: the tier estimator

Closed models publish no parameter counts. Each is assigned a tier
(`small` or `frontier`, in its `estimate` block), and the tier's reference
members are the evidence. Members are named explicitly by a `tier` field on
the reference entries:

| Tier | Members |
|---|---|
| small | GPT-4o mini, GPT-4.1 nano, Claude Haiku 4.5, Gemini 2.5 Flash, Gemini 2.0 Flash, Mistral Small, Llama 4 Scout |
| frontier | GPT-5, GPT-4o, Claude Sonnet 4.5, Claude 3.7 Sonnet, Gemini 2.5 Pro, Mistral Large 2, DeepSeek V3, Grok 3 |

- **The point.** It uses the coefficient-wise median of the members.
- **The range.** It runs from the cheapest member to the dearest, each
  evaluated at the request's own token counts.

`claude-sonnet-5` is left out, because it duplicates Sonnet 4.5's points.

#### 2.5.3 Thinking: hidden tokens

2026 models don't split into a "thinking" entry and a "chat" entry. GPT-6
Sol serves Instant through Extra High, and Claude's thinking is adaptive.
So thinking is an extra cost on top of the plain answer, counted in
**hidden tokens** and priced at the model's own per-token cost. A ratio
would double-count for a model that already costs more per token.

```
hidden tokens = (E_thinking − E_plain) / e_out,plain    at the request's token counts
effort        scales hidden tokens: low 0.4 · standard 1 · high 2.5
```

The evidence:

| Evidence | Thinking side | Plain side | Hidden tokens at 150 in / 400 out |
|---|---|---|---|
| GPT-5 pair | GPT-5 Thinking (extrapolated) | GPT-5 (extrapolated) | ≈ 5,300 |
| DeepSeek-R1 | R1 (measured) | R1's own plain answer, priced by §2.5.1 | ≈ 5,800 |

R1 is deliberately **not** paired with the catalog's DeepSeek V3 entry.
V3's decode coefficient is an extrapolation about 3.4× below EcoLogits'
figure for the identical architecture. Pairing them would inflate R1's
implied thinking to about 20,600 tokens. Pricing R1's plain answer with
the same estimator that prices every open-weight model keeps one
consistent per-token cost. The measurement itself stays in the evidence.

How a model's thinking mode shapes its range:

| Thinking mode | Low end | High end |
|---|---|---|
| `always` (Opus 5.5, Fable 5.1) | the least hidden tokens | the most |
| `adaptive`, `optional` | no thinking at all | the most hidden tokens |
| `none` | the plain range | the plain range |

For a tier model that always thinks, the low end also has a **floor**: the
tier's median plain answer, plus the least thinking. Such a model can
never be estimated below a non-thinking frontier model, which is the
understatement RESEARCH-2026 §4.1 rejected.

What the engine shows today, for model shapes like the 2026 roster
(standard effort, 150 in / 400 out, unless noted):

| Shape | Range | Grades |
|---|---|---|
| Frontier tier, always thinks | 8.9–16.7 Wh | D–E |
| Same, a one-line question at low effort (30 in / 150 out) | 1.8–6.5 Wh | C–D |
| Frontier tier, adaptive thinking | 0.52–16.7 Wh | B–E |
| Small tier, adaptive thinking | 0.12–3.0 Wh | A–C |
| Frontier tier, no thinking | 0.52–1.17 Wh (point 0.74) | B |

#### 2.5.4 Direction of error

The reference set measured 2025 hardware: H100s at EcoLogits' batch size.
2026 serving runs on newer accelerators and, for many models, at FP8 or
FP4. **Estimates for 2026 models therefore probably err high.** That is
the chosen direction of error, and the UI says "likely high" (PLAN.md
Step 8).

Three known ways an estimate can still run *low*:
- **Multi-agent modes.** Grok Heavy and Muse Spark Contemplating run
  several agents per answer.
- **Unusually long thinking.** A prompt can make a model think far longer
  than the benchmark prompts did.
- **Unpublished architecture.** A closed model whose real size is above
  its tier.

What replaces each estimate:
- **Measured points** from the validation study (PLAN.md Step 33) replace
  the active-parameter estimate. That measurement is the independent check
  now, because §2.5.1 ports EcoLogits, so an EcoLogits cross-check would
  be circular.
- **Real reasoning-token counts** from the SDK wrapper (Step 36) replace
  the hidden-token evidence.
- **Observed answer lengths** from receipts (Step 19) replace output
  guesses.

#### 2.5.5 Limitations specific to the estimators

- The EcoLogits relation was fitted on models up to 200B parameters. The
  GPU count for 800B–2.8T MoE models is an extrapolation of its memory
  rule, not of its fit.
- Only two measured entries calibrate the active-parameter estimator, and
  only two pieces of evidence describe thinking. Each band is the spread
  of that evidence, not a statistical interval.
- Tier assignment for a closed model is a judgement, recorded per model
  in the catalog. Step 5 records each assignment with a price-order
  cross-check, since it needs per-model prices.

#### 2.5.6 Leave-one-out checks

**Active-parameter estimator: leave one calibration entry out.**

Shipped band: x0.48–x2.08 around the estimate.

| Predicted | Calibrated on | Shape | Fitted | Predicted | Error | Within the shipped band |
|---|---|---|---|---|---|---|
| llama-3.2-1b | llama-3.3-70b | 100/300 | 0.07 Wh | 0.03 Wh | -56% | **no** |
| llama-3.2-1b | llama-3.3-70b | 1000/1000 | 0.22 Wh | 0.11 Wh | -52% | yes |
| llama-3.2-1b | llama-3.3-70b | 10000/1500 | 0.34 Wh | 0.20 Wh | -41% | yes |
| llama-3.3-70b | llama-3.2-1b | 100/300 | 0.25 Wh | 0.57 Wh | +129% | **no** |
| llama-3.3-70b | llama-3.2-1b | 1000/1000 | 0.86 Wh | 1.77 Wh | +107% | yes |
| llama-3.3-70b | llama-3.2-1b | 10000/1500 | 1.65 Wh | 2.78 Wh | +69% | yes |

**Tier estimator: leave each member out.**

| Tier | Members inside the others' range at 100/300 | at 1000/1000 | at 10000/1500 | Worst error at centre |
|---|---|---|---|---|
| small | 5/7 | 5/7 | 5/7 | ±76% |
| frontier | 6/8 | 6/8 | 6/8 | ±127% |

**Thinking: predict each piece of evidence from the other.**

| Predicted | From | Shape | Benchmark | Predicted range | Inside range |
|---|---|---|---|---|---|
| DeepSeek-R1 (measured) | GPT-5 pair | 100/300 | 23.8 Wh | 8.26–35.8 | yes |
| DeepSeek-R1 (measured) | GPT-5 pair | 1000/1000 | 29.0 Wh | 25.5–110.4 | yes |
| DeepSeek-R1 (measured) | GPT-5 pair | 10000/1500 | 33.6 Wh | 38.0–164.8 | **no** |
| GPT-5 Thinking (extrapolated) | DeepSeek-R1 | 100/300 | 6.00 Wh | 9.51–16.2 | **no** |
| GPT-5 Thinking (extrapolated) | DeepSeek-R1 | 1000/1000 | 18.4 Wh | 11.7–19.8 | yes |
| GPT-5 Thinking (extrapolated) | DeepSeek-R1 | 10000/1500 | 28.0 Wh | 14.2–23.7 | **no** |

How to read these:
- **Active-parameter estimator.** Calibrated on a single entry, it misses
  the other by up to −56% / +129%. Four of six predictions fall inside the
  shipped ×0.48–×2.08 band. Both misses are at the short prompt.
- **Tier estimator.** The members left outside the others' range are the
  tier's extremes, as expected.
- **Thinking.** Each piece of evidence predicts the other at only some
  prompt sizes. GPT-5 Thinking's extrapolated points grow with prompt
  size, while R1's measured energy is nearly flat, so they disagree most
  at long prompts. The shipped range spans both. That disagreement is why
  a thinking model is shown as a range only.

#### 2.5.7 Effort levels, as each provider names them

Providers no longer offer just "thinking on/off". Anthropic has five effort
levels, ChatGPT's picker runs from Instant to Extra High, and Grok's *Heavy*
runs several agents at once. The engine maps every one of these onto a
single scale. Each level is a **range of factors** on the hidden thinking
tokens of §2.5.3:

| Level | Factor | Basis |
|---|---|---|
| `none` | 0 | No thinking. Honoured only by a model that can stop thinking; for an `always` model it means `low` |
| `low` | 0.4 | The engine's existing low tier (§2.2) |
| `standard` (alias `medium`) | 1 | The benchmark condition |
| `high` | 2.5 | The engine's existing high tier |
| `xhigh` | 2.5 – 6.25 | **Not measured.** At least `high`, up to one more high-sized step |
| `max` | 2.5 – 15.6 | **Not measured.** At least `high`, up to two more steps |

The ladder past `high` is an extrapolation with no evidence behind it. So
the low end stays at `high`, and only the upper end widens. Because thinking
models are shown as a range anyway (decision 4), widening is how this
uncertainty shows up, rather than as a confident number.

What each app's labels mean, cheapest first:

| Provider | App labels → level | App default | Status |
|---|---|---|---|
| Anthropic (claude.ai) | Low → low · Medium → standard · High → high · Extra high → xhigh · Max → max | Medium | fetched (support.claude.com, platform.claude.com) |
| OpenAI (ChatGPT, GPT-6 Sol) | Instant → none · Medium → standard · High → high · Extra High → xhigh | not documented | search-only (OpenAI help center) |
| Google (Gemini app) | Low → low · Medium → standard · High → high | Low | search-only (Gemini help) |
| xAI (grok.com) | Fast → low · Expert → high · **Heavy → high, several agents** | Fast | search-only (one secondary source) |
| DeepSeek | Non-think / Instant → none · DeepThink / Think High / Expert → high · Think Max → max | not documented | search-only |
| Meta (meta.ai) | Instant → none · Thinking → standard · **Contemplating → standard, several agents** | not documented | search-only |

ChatGPT's *Pro* is not an effort level. It switches the model to GPT-6
Astra, which detection resolves (PLAN.md Step 6).

How effort is applied:
- **No effort given, or an unknown one.** The model's documented
  `default_effort` applies. Without one, the benchmark condition
  (`standard`) applies.
- **Several agents at once, with the count unknown.** One agent's low end
  is all that is known, so the result is a **floor**: `range.highWh` is
  null and `grade.floor` is set. It shows as "at least …" until someone
  documents how many agents run.
- **Benchmarked (reference) thinking models.** They keep the single factor
  of §2.2. `xhigh` and `max` count as `high`, and `none` as `low`, because
  a model whose thinking is baked into its benchmark points can neither
  stop nor be scaled past what was measured.

#### 2.5.8 How the apps show an estimate

Every app labels a result through one function, `describeImpact()`, so the
web app, the extension pill and card, the popup and (once built) the mobile
screens say the same thing. A measured or benchmarked model keeps its single
figure and grade. A model nobody has measured shows:

| What | Model that thinks | Model that doesn't think | Several agents (floor) |
|---|---|---|---|
| Energy figure | the range, "0.252–12.6 Wh" | "about" the point, with the range beside it | "≥ 8.93 Wh" |
| Everyday units | "1.5–75.5 minutes of an LED bulb" | "about 2.7 seconds of a microwave" | "at least 6.9 minutes of video streaming" |
| Grade | "A–E", coloured from A to E | one letter, or "A–B" when the range crosses a band | "≥ D" |
| Method chip | *estimated · tier* or *estimated · from parameters* | same | same |
| Note | *likely high* | *likely high* | *likely high* |

- **"Likely high"** is on every estimate. It is the direction of error
  chosen in §2.5.4: the estimates are built from 2025 models on 2025
  hardware.
- **One unit where one fits.** A range is written in a single everyday
  unit when both ends count at least one of it and stay within its
  natural span. Otherwise each end gets its own unit: "between 12 drops of
  water and 5.8 teaspoons of water". A range never reads "0.4–12 minutes".
- **Savings between estimates.** A percentage is claimed only when the
  cheaper model's high end is below the dearer model's low end. It is then
  "at least" the gap between those two ends. Overlapping ranges get
  "probably less", never a number (PLAN.md Step 27, pulled forward for
  Compare and the coach's switch button).
- **Totals.** A day's or week's total that includes an estimate is a
  range: lows summed with lows, highs with highs. One floor makes the total
  a floor. The extension stores each estimate's `lowWh` and `highWh` in its
  history for this.
- **Where the energy goes.** For an estimate the breakdown gives shares,
  not watt-hours. For a model that thinks it covers the visible answer
  only, and says how many hidden tokens thinking adds.
- **Sorting.** The centre of each range orders lists. Compare calls its top
  row "Likely greenest" when an estimate is in the set.

---

## 3. Water model

```
W_query [L] = E_IT · WUE_site + E_query · WUE_source,   E_IT = E_query / PUE
```

- `WUE_site` — on-site cooling water (evaporated), per provider disclosure:
  AWS 0.15 L/kWh (2024), Microsoft 0.30 L/kWh (FY2024), Google 1.15 L/kWh
  (ISO Cat 2 consumptive — the figure used in Google's own Gemini paper).
- `WUE_source` — water consumed generating the electricity: **2.18 L/kWh**
  US average (Mytton, *npj Clean Water*, 2021; building on Macknick et al.),
  region-adjusted for China (6.0) and France (2.0).

We deliberately include off-site water. This is the core of the public
critique of Google's "5 drops" figure (Ren et al., 2025): generation water
usually *exceeds* cooling water. Our numbers are therefore higher than
provider marketing but boundary-honest. The "500 mL per conversation" memes
and the "5 mL" rebuttals are both artifacts of boundary choice — we state
ours: **operational on-site + off-site generation water**.

---

## 4. Carbon model

```
C_query [kgCO₂e] = E_query · CIF · F_embodied
```

- `CIF` — location-based grid carbon intensity of the host data center
  (Azure 0.353, AWS 0.385, Google 0.32 kgCO₂e/kWh per Jegham et al.), with
  user-selectable regional overrides (IEA 2024 world 0.445; Ember 2024 US
  0.384; CAISO 0.23; ERCOT 0.371; PJM 0.398; EU ~0.19; France 0.056;
  Nordics 0.03; China 0.58; India 0.71).
- `F_embodied = 1.15` — lifecycle uplift amortizing chip manufacturing and
  data-center construction, following the boundary used by Google's 2025
  per-prompt analysis and Mistral's LCA (both find embodied adds roughly
  10–20% on top of operational). Can be disabled in the engine.

We use **location-based** CIF, not market-based. Google's headline
0.03 gCO₂e/prompt relies on market-based clean-energy purchasing; the
electron physically consumed still comes from the local grid, and
location-based accounting is the behaviour-relevant signal.
### 4.1 Hosts that borrow another host's figures

Every host's PUE, WUE and CIF come from a document someone read
(RESEARCH-2026 §5.3). Four hosts that serve 2026 models have no such
document yet, so each borrows another host's figures and says so
(`proxy_of` in `grids.json`):

| Host | Borrows | Why | What replaces it |
|---|---|---|---|
| Meta (own data centers) | AWS | Meta's sustainability report PDF couldn't be opened from the build environment on 2026-10-20 | PUE, WUE and grid mix read from Meta's latest sustainability report PDF |
| Moonshot AI (China) | DeepSeek's China averages | No published figures | Figures Moonshot publishes |
| Alibaba Cloud (China) | DeepSeek's China averages | No fetched source yet | A fetched Alibaba Cloud source |
| Z.ai (China) | DeepSeek's China averages | No published figures | Figures Z.ai publishes |

The web coach shows the borrowing on the carbon card ("borrowed from AWS
until Meta's own figures are read"), and every estimate reports it in
`factors.hostProxyOf`. Inventing per-company figures is not an option; a
proxy is the honest stand-in until a document exists.

---

## 5. Relatable equivalents

A core product requirement: **watt-hours mean nothing to ordinary
employees.** Every figure is shown as an everyday equivalent first and the
technical unit second. Factors (see `packages/core/src/data/equivalents.json`):

| Unit | Factor | Basis |
|---|---|---|
| Phone charge | 15 Wh | flagship battery 12–19 Wh incl. losses |
| LED bulb | 10 W | 800-lumen LED |
| Microwave | 1000 W | typical household unit |
| Video streaming | 1.3 Wh/min | IEA: ~0.077 kWh/h TV streaming incl. network |
| Kettle (1 L boil) | 110 Wh | thermodynamic minimum + losses |
| E-bike | 10 Wh/km | typical pedal-assist |
| Espresso shot / glass / bottle | 30 / 250 / 500 mL | — |
| Shower | 10 L/min | standard head |
| Car | 170 gCO₂/km | EU/US new-car fleet average 2023-24 |
| Breathing | 0.7 g CO₂/min | ~1 kg/day human at rest |
| One tree's uptake | 2.4 g CO₂/h | ~21 kg/yr mature tree |

The picker chooses the unit whose count lands nearest a "human" magnitude
(≈3 on a log scale), so users see "4 minutes of an LED bulb", never
"0.00067 kWh".

---

## 6. Eco-grades

EU-energy-label-style grades on per-query energy, anchored to the 2025
convergence (a median efficient prompt must land in A; reasoning-heavy work
in D–E):

| Grade | Energy/query |
|---|---|
| **A** | ≤ 0.4 Wh |
| **B** | ≤ 1.2 Wh |
| **C** | ≤ 3.5 Wh |
| **D** | ≤ 10 Wh |
| **E** | > 10 Wh |

An estimated model's grade is the grade of each end of its energy range:
"B–E" when the range crosses bands, "≥ C" for a floor (§2.5.8).

---

## 7. Coaching evidence base

- **Cap the output, not just the prompt.** Response length is the dominant
  energy driver (Adamska et al. 2025, r ≈ 0.9); verbosity constraints save
  up to ~60% (Poddar et al. 2025; *Green Prompt Engineering*,
  arXiv:2509.22320). Hence the "set an output budget" tip — and when the
  analyzer detects an explicit budget already in the prompt ("in 50 words",
  "two sentences", "3 bullet points", "under 280 characters", "one word",
  "yes or no", "briefly"), it sets the output estimate accordingly
  (words × 4/3 tokens, characters ÷ 4, ~25 tokens/sentence, ~15/line,
  ~20/bullet, ~35/list item, ~100/paragraph; brevity cues scale by 0.4–0.7×)
  and swaps the nag for an acknowledgment, so following the advice visibly
  improves the grade. A length phrase only counts when it is about the
  answer (it ends the clause, follows a directive verb, or opens the prompt)
  and is not negated — "the use of commas in a sentence I will paste" and
  "do not answer with just yes or no" are content. A requested *long* answer
  ("in 2000 words") raises the estimate instead and earns a warning.
- **Count tokens honestly.** Prompt tokens are estimated at ~4 characters
  per token for Latin prose and ~3.5 for code; CJK scripts are counted at
  one token per character and emoji at two, since those tokenize far denser
  (a Japanese prompt was previously undercounted ~3×).
- **Right-size the model.** The measured spread between the most and least
  efficient model on the same task exceeds 65× (Jegham v6). Small models
  (Gemini Flash, GPT-4o mini, Haiku-class) handle summarization, translation
  and factual Q&A at ~30% of frontier energy.
- **Reserve reasoning modes.** Reasoning budgets cost 10–70× a standard
  query (Jegham v6; ML.ENERGY v3.0: DeepSeek-R1 median ~20.9 Wh with ~11k
  hidden tokens).
- **Trim courtesy tokens.** Small per query, large at fleet scale (*Small
  Talk, Big Impact: The Energy Cost of Thanking AI*, arXiv:2601.22357) —
  and a teachable on-ramp to token awareness.
- **Some queries shouldn't be LLM queries.** Weather, time, navigation, and
  arithmetic have exact, near-zero-energy tools.

---

## 8. Known limitations (read before quoting numbers)

1. **Estimates, not meters.** Per-query figures for closed models are
   inferred from public API behaviour × provider infrastructure factors.
   The Microsoft/Joule study shows such inference can overstate production
   energy 4–20×; provider self-reports may understate by boundary choice.
   We show uncertainty bands and label every model `measured` /
   `extrapolated` / `anchored`.
2. **Anthropic and Meta (Llama 4) have published no per-query figures** as
   of mid-2026; their entries are extrapolations from size class and
   measured siblings.
3. **GPT-5 thinking figures are contested** (URI estimate assumes full
   reasoning budgets); we ship them as a separate model entry with wide bands.
4. **Inference only.** Training, fine-tuning, and end-user device energy are
   excluded (Mistral's LCA suggests training amortization adds materially;
   our embodied factor covers hardware, not training).
5. **Medians vs means.** Provider anchors are medians; heavy-tail prompts
   (long context, reasoning) dominate real fleet totals.
6. **Anchors have their own boundaries.** Each provider-reported figure in
   `models.json` now states its boundary. Mistral's 1.14 gCO₂e / 45 mL per
   response is a cradle-to-grave LCA including training amortisation and
   embodied hardware — roughly 25× the engine's inference-only figure — so
   it is kept for reference, not reproduced; Google's 0.24 Wh median is for
   a prompt of unknown length with on-site water only. Anchors are never
   used to override the fitted curve.
7. **Which model the user actually selected.** The extension reads the chat
   page's model switcher ("GPT-5 Thinking", "2.5 Pro", an active DeepThink
   toggle) and falls back to the site's default model when it cannot; the
   difference between a standard and a reasoning selection is 10–30× and
   is the largest single source of error in per-query estimates.

8. **The input coefficient is only fitted to 10,000 tokens.** `e_in` is small
   but non-zero for every model (0.0009–0.516 mWh/token). Extrapolated
   linearly, it would attribute ~96% of a 200k-token query's energy to input —
   inverting Adamska et al., which this document cites for output-dominance.
   The engine therefore holds the input term flat past 5× the largest fitted
   point and returns `energy.clamped` with a provisional grade. **A clamped
   figure is a lower bound, not an estimate.**
9. **A model id is a weaker predictor than this document implies.** Independent
   measurement shows batch size moving per-request energy 12–17× for a single
   model on a single GPU — more than the spread between models. No benchmark
   point here states an assumed batch size, and the published uncertainty bands
   almost certainly do not span it.
10. **`measured` now means a third-party hardware measurement.** Five closed
   hosted models previously carried that label on the strength of an
   infrastructure-aware estimation framework; they are now `benchmarked`. No
   number changed — only the claim about where it came from.

---

## 9. Full reference list

1. Jegham, N., Abdelatti, M., Elmoubarki, L., Hendawi, A. (2025). *How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference.* arXiv:2505.09598 (v6, Nov 2025). https://arxiv.org/abs/2505.09598
2. Elsworth, C., et al. (Google, 2025). *Measuring the environmental impact of delivering AI at Google Scale.* arXiv:2508.15734. https://arxiv.org/abs/2508.15734
3. Oviedo, F., Kazhamiaka, F., Choukse, E., et al. (Microsoft, 2025). *Energy Use of AI Inference: Efficiency Pathways and Test-Time Compute.* arXiv:2509.20241. https://arxiv.org/abs/2509.20241 — **preprint figures only.** The published *Joule* (2026) version reports different values and has NOT been read; secondary sources put its median at 0.31 Wh (IQR 0.16–0.60) rather than the preprint’s 0.34 Wh, with an unknown boundary. Verify against the journal article before quoting any figure from it.
4. Mistral AI (2025). *Our contribution to a global environmental standard for AI.* https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai/
5. Altman, S. (2025). *The Gentle Singularity.* https://blog.samaltman.com/the-gentle-singularity
6. You, J. (Epoch AI, 2025). *How much energy does ChatGPT use?* https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
7. Adamska, M., et al. (2025). *Green Prompting: Characterizing Prompt-driven Energy Costs of LLM Inference.* arXiv:2503.10666. https://arxiv.org/abs/2503.10666
8. *Green Prompt Engineering* (2025). arXiv:2509.22320. https://arxiv.org/html/2509.22320 — ⚠️ **unverified**: no author list; identifier not resolved to a document (see RESEARCH-2026.md §3.1).
9. *Small Talk, Big Impact: The Energy Cost of Thanking AI* (2026). arXiv:2601.22357 — ⚠️ **UNVERIFIED**: no URL, no author list, identifier never resolved to a document. Resolve or remove before any external publication (see RESEARCH-2026.md §3.1).
10. Li, P., Yang, J., Islam, M. A., Ren, S. (2025). *Making AI Less "Thirsty".* Communications of the ACM. https://cacm.acm.org/sustainability-and-computing/making-ai-less-thirsty/
11. Mytton, D. (2021). *Data centre water consumption.* npj Clean Water 4, 11. https://www.nature.com/articles/s41545-021-00101-w
12. IEA (2025). *Electricity 2025 — Emissions.* https://www.iea.org/reports/electricity-2025/emissions
13. Ember (2025). *US Electricity 2025 / Electricity Data Explorer.* https://ember-energy.org/data/electricity-data-explorer/
14. Microsoft (2024). *Environmental Sustainability Report FY2024* and datacenter WUE/PUE disclosures. https://datacenters.microsoft.com/sustainability/efficiency/
15. AWS (2024). *Sustainability — water stewardship.* https://sustainability.aboutamazon.com/products-services/aws-cloud
16. Google (2025). *Environmental Report 2025 / data center operations.* https://datacenters.google/operating-sustainably/
17. ML.ENERGY Leaderboard v3.0 (2025). https://ml.energy/leaderboard
18. AI Energy Score (Hugging Face et al., 2025). https://huggingface.github.io/AIEnergyScore/
19. Ritchie, H. (2025). *AI footprint update, August 2025.* https://hannahritchie.substack.com/p/ai-footprint-august-2025
20. Goedecke, S. (2025). *Talking to ChatGPT costs 5 ml of water, not 500 ml.* https://www.seangoedecke.com/water-impact-of-ai/

> Note: figures pulled from secondary coverage were cross-verified across
> multiple independent outlets; spot-check the three primary PDFs (refs 1–3)
> before any external publication.
