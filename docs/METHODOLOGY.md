# EcoPrompt Coach — Scientific Methodology (v2)

This document is the single source of truth for every number the product
shows. It states the formulas, the data they are fitted from, the system
boundary, and the known limitations — in that order, because the most common
failure mode of "AI footprint" tools is mixing numbers from incompatible
boundaries.

Last updated: 2026-06-10.

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

The 3×3 system is solved exactly (Cramer's rule); if measurement noise
produces a negative coefficient, the offending term is pinned to zero and
the rest re-fitted by least squares, so estimates are always monotonic in
both token counts.

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
doubled whenever effort ≠ standard or tokens exceed the measured range
(11.5k), because we are extrapolating.

### 2.3 Task multipliers

Non-chat tasks scale energy: image generation ×3, agentic/multi-step ×2,
data analysis ×1.4, summarization ×0.7, translation ×0.6 (v1 factors,
retained as order-of-magnitude estimates pending dedicated benchmarks).

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

---

## 7. Coaching evidence base

- **Cap the output, not just the prompt.** Response length is the dominant
  energy driver (Adamska et al. 2025, r ≈ 0.9); verbosity constraints save
  up to ~60% (Poddar et al. 2025; *Green Prompt Engineering*,
  arXiv:2509.22320). Hence the "set an output budget" tip.
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

---

## 9. Full reference list

1. Jegham, N., Abdelatti, M., Elmoubarki, L., Hendawi, A. (2025). *How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference.* arXiv:2505.09598 (v6, Nov 2025). https://arxiv.org/abs/2505.09598
2. Elsworth, C., et al. (Google, 2025). *Measuring the environmental impact of delivering AI at Google Scale.* arXiv:2508.15734. https://arxiv.org/abs/2508.15734
3. Oviedo, F., Kazhamiaka, F., Choukse, E., et al. (Microsoft, 2025). *Energy Use of AI Inference: Efficiency Pathways and Test-Time Compute.* arXiv:2509.20241; published in *Joule* (2026). https://arxiv.org/abs/2509.20241
4. Mistral AI (2025). *Our contribution to a global environmental standard for AI.* https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai/
5. Altman, S. (2025). *The Gentle Singularity.* https://blog.samaltman.com/the-gentle-singularity
6. You, J. (Epoch AI, 2025). *How much energy does ChatGPT use?* https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
7. Adamska, M., et al. (2025). *Green Prompting: Characterizing Prompt-driven Energy Costs of LLM Inference.* arXiv:2503.10666. https://arxiv.org/abs/2503.10666
8. *Green Prompt Engineering* (2025). arXiv:2509.22320. https://arxiv.org/html/2509.22320
9. *Small Talk, Big Impact: The Energy Cost of Thanking AI* (2026). arXiv:2601.22357.
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
