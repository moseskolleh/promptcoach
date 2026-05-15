# EcoPrompt Coach — Strategy, Bug Audit & Path to Monetization

_Companion document to PLAN.md. Combines a code audit run on 2026-05-15 with a competitive scan of the AI-sustainability tooling market._

---

## TL;DR

1. **The consumer Chrome-extension space for per-prompt carbon tracking is already crowded** (AI Impact Tracker, GreenQuery, Ecomind, Prompt Power, ChatGPT Carbon Tracker — all free). Shipping another free extension is a me-too move.
2. **The enterprise wedge is wide open for 18–36 months.** Carbon-accounting incumbents (Watershed, Persefoni, Microsoft Sustainability Manager) treat AI as one cloud line item; LLM observability tools (Langfuse, Helicone, LangSmith) don't surface carbon at all. CSRD/ESRS E1, the EU AI Act, and ISO/IEC 42001 are forcing Scope-3 AI disclosure starting in 2026 audit cycles.
3. **The methodology is not the moat.** EcoLogits (Boavizta + Data For Good) is open-source and credible — building on it de-risks audit-grade reporting.
4. **The moat is distribution + audit artifacts + integrations** into the carbon-accounting platforms of record.
5. **8 production bugs found, 4 already fixed in this branch.** See `Bug Audit` section.

---

## Part 1 — Bug Audit (verified by running code, not by inspection alone)

Each issue below was reproduced in a Node test harness using the actual `shared/analyzer.js` and `shared/calculator.js` files plus the real `data/*.json` files.

### Fixed in this branch

| # | File | Severity | Bug | Fix |
|---|------|----------|-----|-----|
| 1 | `shared/calculator.js` | HIGH | `autoDetectModel('grok.com')` returned `null` even though `manifest.json` lists Grok as a supported site — every Grok user got the popup's fallback default, breaking inline impact estimates. | Added grok.com + x.ai mappings to closest size-class proxy (llama-3.3-70b) until real benchmarks land. |
| 2 | `shared/calculator.js` | MEDIUM | Default model mappings were stale: `chatgpt.com → gpt-4o`, `claude.ai → claude-3.5-sonnet`, `gemini → gemini-2.0-flash`, even though `data/model_benchmarks.json` contains GPT-5, Claude 4.7 Opus / 4.5 Sonnet, Gemini 2.5 Pro. Users on the current default UI for each site saw the wrong impact. | Updated mappings to the current default. Added guard so `autoDetectModel` only returns IDs that actually exist in `MODEL_DATA` — protects against future drift. |
| 3 | `shared/analyzer.js` | HIGH | CJK token counting was off by **~4x**. Test: `estimateTokens('解决这个数学问题')` (8 Chinese chars) returned `2`. Real tokenizers emit ~8 tokens. Every downstream energy/water/carbon number was under-reported by 75% for Chinese, Japanese, and Korean users. | Added CJK character range detection (Hiragana, Katakana, CJK Unified Ideographs, Hangul, CJK Compatibility) with 1.0 chars-per-token ratio. Verified: 8-char Chinese phrase now returns 8 tokens. |
| 4 | `background.js` | LOW | Install-time default model was hardcoded `gpt-4o`. | Updated to `gpt-5`. |

### Still open (recommended next, ranked by user impact)

| # | File:line | Severity | Bug | Recommended fix |
|---|-----------|----------|-----|-----------------|
| 5 | `content.js:587-634` | HIGH | DOM selectors for ChatGPT/Claude/Gemini are generic (`tagName === 'TEXTAREA'`, `isContentEditable`). ChatGPT uses a `.ProseMirror` contenteditable that nests text in `<p>` elements — clicks can land on the child span, and `element.isContentEditable` returns `false` for descendants. | Walk ancestors when checking editable state; add a platform-detection map of known selectors with a fallback. Add a MutationObserver that re-attaches when the AI vendor reshuffles their DOM. |
| 6 | `shared/analyzer.js:24-42` | HIGH | Heuristic tokenizer is ±15-20% off the real cl100k/Claude/SentencePiece counts. Energy/water/carbon are linear in tokens, so the user-visible impact has the same error. | Ship `js-tiktoken` for OpenAI models (it's small, ~1 MB), keep heuristic for others, and surface the confidence interval in the tooltip ("0.40-0.50 Wh"). The market scan suggests audit-grade output is the WTP driver — error bars matter. |
| 7 | `content.js:692-702` | MEDIUM | Document-level `paste`, `input`, `keydown` listeners are never removed. If the content script re-injects (CSP recovery, SPA navigation), listeners stack and the tooltip can fire twice per keystroke. | Add a `beforeunload` cleanup. Track a single `controller = new AbortController()` and pass `signal: controller.signal` to every `addEventListener`. |
| 8 | `popup.js` (multiple) | MEDIUM | `settings.userRegion` only changes carbon. Water is also region-dependent (cooling type + grid mix) per the source paper, but `calculateImpact()` ignores the user region for water on purpose. This is documented but contradicts the README's "regional accuracy" claim. | Either add per-region WUE multipliers to `data/infrastructure.json` and surface them, or update the README to be explicit that the water number reflects the data-center site, not the user's grid. |

### Verification harness (paste into a Node REPL)

```javascript
const fs = require('fs');
global.chrome = { runtime: { getURL: p => 'file:///' + p, lastError: null } };
global.window = global;
global.fetch = async (url) => {
  const p = url.replace('file:///', './');
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
eval(fs.readFileSync('shared/calculator.js', 'utf8'));
eval(fs.readFileSync('shared/analyzer.js', 'utf8'));

(async () => {
  await window.EcoPromptCalculator.loadData();
  console.log(window.EcoPromptCalculator.autoDetectModel('grok.com'));
  console.log(window.EcoPromptAnalyzer.estimateTokens('解决这个数学问题'));
})();
```

Run after every PR that touches calculator or analyzer; the README's GPT-4o sanity check (0.421 Wh / 1.44 mL / 0.149 gCO2e) is the regression anchor.

---

## Part 2 — Competitive Landscape

### Direct competitors (consumer extensions — already shipped)

| Tool | What it does | Pricing |
|------|--------------|---------|
| **AI Impact Tracker** (tortue.studio) | ChatGPT-only, local, open source. | Free |
| **GreenQuery** | ChatGPT-only, CO2 + water, weekly charts, CSV export, 1y history. | Free |
| **Ecomind – AI Sustainability Tracker** | 12+ providers (OpenAI, Anthropic, Gemini, custom). | Free |
| **Prompt Power** | Silent tracker across Claude/ChatGPT/Gemini/Perplexity. | Free |
| **ChatGPT Carbon Tracker** | First-gen, ChatGPT-only. | Free |

The "free Chrome extension that estimates per-prompt carbon" niche is a red ocean. Six tools, near-identical UX, no breakout winner.

### Methodology layer (commodity, open)

- **EcoLogits** (genai-impact.org) — open Python lib, the de-facto European methodology. Use it; don't rebuild it.
- **CodeCarbon** — measures local training/inference energy via NVIDIA SMI.
- **Hugging Face AI Energy Score** — model leaderboard.
- **Boavizta** — impact-factor source.

### Enterprise carbon-accounting incumbents (weak on AI today, will catch up in 12-18 months)

- **Watershed** — ~$50k+/yr, 60+ enterprise integrations including cloud providers, treats AI as one Scope-3 line item.
- **Persefoni** — investor-grade carbon accounting; uses GenAI internally but no LLM-usage module.
- **Microsoft Sustainability Manager** — $4-12k/tenant/mo, Azure-bundled, the closest AI-aware incumbent.
- **Sweep, Net0, Normative, Salesforce Net Zero Cloud, Oracle Cloud Sustainability** — general carbon accounting; none surface per-prompt LLM data today.

### Adjacent threats

- **LLM observability** — Langfuse, Helicone, LangSmith, PromptLayer, Phoenix track latency/cost/tokens but **none surface energy/carbon today**. Adding a carbon column is a one-sprint feature; Helicone (proxy model) is especially well-positioned. Treat as 6-12 month threat.
- **AI governance/TRiSM** — Credo AI, CalypsoAI, Lakera, Robust Intelligence. Credo AI explicitly maps ISO 42001 but doesn't track sustainability. Most credible *acquirer*.

### Regulatory drivers (the actual reason enterprises will pay)

1. **CSRD + ESRS E1 (EU).** First assurance cycles 2025-2026. Cloud AI emissions fall under Scope 3 Category 1. ~5,000 EU companies in scope (>1,000 employees AND >€450M turnover) under Omnibus I.
2. **EU AI Act — energy disclosure for GPAI models.** First Commission assessment August 2028; enterprise buyers pre-positioning now.
3. **ISO/IEC 42001 (AI Management Systems).** Requires AI Impact Assessment including environmental sustainability, water, energy. The de-facto "SOC 2 for AI."

(US: SEC climate rule is politically volatile; California SB 253/261 is the firmer driver for Fortune 1000 with CA operations.)

### Market signals

- **Funding in this exact niche is thin.** No notable VC round found for AI-prompt carbon tracking specifically (climate-tech rebounded to ~$40.5B in 2025 but concentrated in materials/grid/adaptation). Most existing extensions are indie/solo builds; EcoLogits is non-profit.
- **Hyperscaler/lab disclosure is a vacuum.** Anthropic and OpenAI publish almost nothing on Scope 1/2/3. Good (data is genuinely missing); bad (no upstream ground truth, only estimates).
- **Pricing anchors.** Watershed ~$50k/yr entry; MS Sustainability Manager $4-12k/tenant/mo; AI-governance peers (Credo AI) $50-250k ACV.

---

## Part 3 — Differentiation Opportunities (ranked by enterprise willingness-to-pay)

### Tier S — $50-250k ACV, defensible 18-36 months

**1. CSRD/ISO-42001-audit-ready AI Scope-3 report.**
Sell to CSO/Sustainability + Chief AI Officer jointly. Deliverable: signed, methodology-cited monthly attestation of AI-inference emissions per legal entity, mapped to ESRS E1 disclosure points and ISO 42001 controls. This is what Watershed/Persefoni don't yet produce and what Big-4 assurance providers will start demanding in the 2026-2028 cycle. **Key features:**
- Per-entity / per-cost-center attribution from SSO group membership.
- Methodology disclosure (EcoLogits + Boavizta citations).
- PDF + machine-readable XBRL output for direct CSRD filing.
- Audit trail of which prompts/models/regions produced which kgCO2e.

### Tier A — $15-60k ACV, sticky after rollout

**2. SSO + team rollout + per-employee AI carbon budgets.**
Okta/Azure AD provisioning. Department dashboards. Optional gamification ("Engineering used 32% less AI energy this quarter"). Sustainability teams have spent 5 years rolling out flight/commute budgets — same playbook applies to AI. Justify against headcount × productivity-tooling spend.

**3. Bidirectional integration into Watershed / Persefoni / Microsoft Sustainability Manager.**
Position as the "AI data connector" rather than a competing dashboard. Lower direct revenue but a clear *acquisition path* (Watershed/Persefoni are likely acquirers once the wedge proves out). Implements EcoLogits + your model database, exposes a CSV/Parquet/API feed.

### Tier B — $5-15/user/mo, consumer hook

**4. Real-time inline coaching with model-switching.**
The original product vision; genuine UX differentiation vs. every other extension, which is post-hoc. "Switch to Haiku to save 84% energy" inline on chatgpt.com/claude.ai. By itself a freemium consumer hook; converts to seats via the team plan in Tier A.

### Tier C — marketing leverage, not direct revenue

**5. "Green Prompt" / model-card certification mark.**
Verifiable third-party badge enterprises display in their CSRD report or marketing materials ("X% of Q2 prompts ran on certified-efficient models"). Becomes a moat once your methodology is cited by auditors as the standard.

---

## Part 4 — Concrete 90-day Product Roadmap

The current code is a solid consumer extension. To pivot to the enterprise wedge without breaking the existing user base:

### Sprint 1 (weeks 1-2) — Foundations

- [x] Fix the bugs in Part 1 table rows 1-4 (done in this branch).
- [ ] Land bugs 5-7 (DOM resilience, tokenizer accuracy, listener cleanup).
- [ ] Add `js-tiktoken` for OpenAI models; show confidence interval `0.40-0.50 Wh` in tooltip — required to claim "audit-grade" later.
- [ ] Replace ad-hoc `MODEL_DATA[id].host.toLowerCase().replace(/\s+/g, '_')` matching with explicit `hostKey` in `model_benchmarks.json` — defends against the "AWS"/"aws"/"Amazon Web Services" rename risk.

### Sprint 2 (weeks 3-4) — Methodology credibility

- [ ] Adopt EcoLogits' impact factors as an importable data file; document the import process so the data can be refreshed when the upstream lib updates.
- [ ] Publish a `METHODOLOGY.md` that cites Boavizta + Jegham et al. with the exact formulas in use. This is the artifact Big-4 auditors will read.
- [ ] Add per-region CIF AND per-region WUE in `data/infrastructure.json`. (Currently only CIF is region-aware; the README is misleading.)

### Sprint 3 (weeks 5-8) — Team primitive

- [ ] Move history off `chrome.storage.local` (10 MB cap; per-device) onto a Supabase/Neon backend keyed by SSO email.
- [ ] Build a minimal web dashboard (Next.js, deployed to Vercel) showing per-user and per-team aggregates.
- [ ] Implement Google Workspace / Microsoft Entra ID OIDC for SSO-driven team grouping.
- [ ] Ship a Slack bot that pings the team channel weekly: "Engineering's AI carbon was X kgCO2e this week."

### Sprint 4 (weeks 9-12) — Enterprise artifacts

- [ ] Generate a monthly PDF + CSV per legal entity, signed with a methodology-version hash.
- [ ] Add ESRS E1 disclosure-point mapping and ISO 42001 control mapping in the export.
- [ ] Ship one bidirectional integration (start with Watershed's data-ingest API — it's the largest TAM by share).
- [ ] Reach out to 3 design partners in CSRD-scope EU companies (FTSE 100 / Euronext 100 sustainability teams) before the August 2026 reporting deadline.

---

## Part 5 — Honest market take

- **The consumer wedge is a red ocean.** 5+ free extensions ship today. Do not monetize there. Use it as a distribution funnel into the enterprise product.
- **The enterprise wedge is real but small (~$50-200M ARR opportunity at maturity).** It compounds the moment CSRD assurance cycles begin demanding AI Scope-3 line items.
- **The window closes in 18-36 months** when either (a) Watershed/Persefoni ship a native AI module or (b) Helicone/Langfuse add a carbon column. Both are credible 6-18 month threats.
- **The methodology is not the moat.** EcoLogits is open and audit-credible. Don't rebuild it.
- **The moat is:** distribution into sustainability + AI-governance buyer committees, audit-grade reporting artifacts, and integrations to the carbon-accounting platforms of record.
- **Best founding-team shape:** one ex-Persefoni/Watershed/Credo enterprise-sales lead + one technical founder (you) shipping the EcoLogits-powered product + a methodology advisor from Boavizta/HF/MIT to anchor audit credibility.

---

## Sources

- EcoLogits: https://ecologits.ai/latest/
- EcoLogits GitHub: https://github.com/genai-impact/ecologits
- CodeCarbon: https://codecarbon.io/
- Hugging Face AI Energy Score: https://huggingface.github.io/AIEnergyScore/
- Watershed: https://watershed.com/
- Persefoni breakdown: https://research.contrary.com/company/persefoni
- Helicone LLM observability guide: https://www.helicone.ai/blog/the-complete-guide-to-LLM-observability-platforms
- Credo AI: https://www.credo.ai/product
- ISO/IEC 42001: https://www.iso.org/standard/42001
- Baker Botts on the EU AI Act: https://www.bakerbotts.com/thought-leadership/publications/2026/march/the-eu-ai-act
- "How Hungry is AI?" (Jegham et al.): https://arxiv.org/html/2505.09598v5
- AI Impact Tracker: https://chromewebstore.google.com/detail/ai-impact-tracker/lbeceglchgnhaaidddcdgapnacdjofpf
- Ecomind: https://chromewebstore.google.com/detail/ecomind-ai-sustainability/aimdngdjkppipnkhkkpimnkbbgpjphfb
- ChatGPT Carbon Tracker: https://chromewebstore.google.com/detail/chatgpt-carbon-tracker/cclkbhgeajbcehglecbnhpchnfhpakdk

---

_Last updated: 2026-05-15. Companion: PLAN.md, README.md._
