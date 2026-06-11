# 🌱 EcoPrompt Coach

**Know what your AI really costs the planet — in units you actually understand.**

EcoPrompt Coach makes the energy, water, and carbon footprint of every AI
query visible *before you hit send* — and never in kilowatt-hours. A
watt-hour means nothing to most people; "boiling a kettle", "charging 40% of
your phone", or "driving a car 12 meters" does. Then it coaches you to
reduce it: trim wasted tokens, cap output length, right-size the model, and
skip the LLM entirely when a calculator or weather app does it better.

![Version](https://img.shields.io/badge/version-2.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/core_tests-13_passing-brightgreen)

---

## Why now (the 2025/2026 science)

Per-query footprints finally have credible numbers. Four independent 2025
sources converge on **0.2–0.4 Wh for a typical short prompt** on an efficient
stack (Google: 0.24 Wh median Gemini prompt; OpenAI: 0.34 Wh; Epoch AI:
~0.3 Wh; Microsoft/*Joule*: 0.34 Wh production median) — while **reasoning
modes and long contexts run 10–100× higher** (Jegham et al. v6: >33 Wh;
GPT-5 thinking estimates up to ~40 Wh). The spread between the most and
least efficient model on the same task exceeds **65×**, and response length —
not prompt length — is the dominant driver (r ≈ 0.9).

That two-orders-of-magnitude gap is a *behavioural* lever. Nobody else puts
it in front of the person typing the prompt, in language they feel.
Full math + citations: **[docs/METHODOLOGY.md](docs/METHODOLOGY.md)**.

## What's in this monorepo

| Directory | What it is |
|---|---|
| [`packages/core`](packages/core) | The shared engine: per-token energy model fitted from published benchmarks, water + carbon accounting with explicit boundaries, relatable-equivalents converter, prompt analyzer & coach. Zero dependencies, fully tested (`npm test`). |
| [`apps/extension`](apps/extension) | Chrome extension (MV3): live eco-grade pill on ChatGPT/Claude/Gemini/Copilot/Mistral/DeepSeek/Perplexity/Poe/Grok, popup coach + model comparison + personal impact dashboard. |
| [`apps/web`](apps/web) | Responsive web app (static, no build step): coach, model comparison, model explorer, prompt library, methodology digest. |
| [`apps/mobile`](apps/mobile) | Mobile app **structure** (Expo/React Native skeleton): share-sheet prompt intake, dashboard, weekly recap — ready to implement. |
| [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) | Every formula, every factor, every source, every limitation. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the pieces fit, and the product/startup roadmap. |

One engine, every surface: extension, web, and mobile all run the exact same
`@ecoprompt/core` code and data, so the numbers always agree.

## Quick start

```bash
# Run the engine tests
npm test

# Try the web app
npx serve apps/web          # then open http://localhost:3000

# Load the extension
# chrome://extensions → Developer mode → Load unpacked → apps/extension

# After editing packages/core, re-sync the apps' vendored copies
node scripts/sync-core.js
```

## The math in one breath

```
Energy  E = E_fixed + e_in·T_in + e_out·T_out        (coefficients fitted per model
                                                      from published benchmark points;
                                                      reasoning effort scales E_fixed + decode)
Water   W = (E/PUE)·WUE_site + E·WUE_source          (on-site cooling + electricity generation)
Carbon  C = E · CIF_grid · 1.15                      (location-based grid + embodied uplift)
```

Then everything is translated: *"This prompt ≈ 4 minutes of an LED bulb,
2 teaspoons of water, and driving a car 1 meter."* Grades A–E, styled after
EU energy labels, anchored so a median 2025 prompt is an A and a heavy
reasoning run is an E.

## Example (from the engine, GPT-4o, 100 in / 300 out tokens)

- ⚡ **2.8% of a phone charge** (0.42 Wh) — grade **B**
- 💧 **~20 drops of water** (1.0 mL)
- 🌍 **Driving a car 1 meter** (0.17 g CO₂e)

Same question to a reasoning model (DeepSeek-R1): **the energy of riding an
e-bike 2.4 km** (23.8 Wh) — grade **E**, ~57× more. That's the coaching
moment.

## Status & roadmap

- ✅ v2 engine with 2025/2026 evidence base, 19-model catalog, 13 passing tests
- ✅ Chrome extension + responsive web app
- ✅ Mobile app architecture (skeleton)
- ⏭️ Org dashboards (team totals, goals, Slack recaps), API for enterprises,
  per-tenant grid factors, verified provider integrations

## Provenance

Built on Jegham et al. (2025), *How Hungry is AI?* (arXiv:2505.09598, v6),
Google's per-prompt disclosure (arXiv:2508.15734), Mistral AI's peer-reviewed
LCA, Epoch AI, and Microsoft's *Joule* (2026) production study — see the
[full reference list](docs/METHODOLOGY.md#9-full-reference-list). Original
prototype developed at the Digital Society School with Ministry of Finance
(NL) partners, whose feedback ranked Prompt Coach the #1 concept for
actionability and impact.

## License

MIT — see [LICENSE](LICENSE).
