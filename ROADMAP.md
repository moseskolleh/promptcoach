# EcoPrompt Coach — everything that needs to be done

The complete work breakdown, in dependency order. Unlike most roadmaps in this
position, this one starts from a working product: the engine is tested, CI is
green, and two surfaces are live. So this is mostly about **distribution,
durability and trust** rather than construction.

**Legend** — ⛔ blocker · ⚠️ correctness or trust risk · 🔧 engineering
· 📄 documentation · 🌍 operations · 🚀 growth

---

## Where the project actually stands

Verified by execution on 2026-09-15, not by reading the code.

| Check | Result |
|---|---|
| `npm test` | ✅ **44/44 engine + analyzer tests pass** |
| `npm run check` | ✅ 700 static checks, 22 scripts, 15 JSON files, 7 pages |
| Vendored-copy sync test | ✅ present and enforced in CI and on deploy |
| CI on Node 20 and 22 | ✅ runs on every push and PR |
| GitHub Pages deploy | ✅ web app and demo playground live |
| Chrome extension | ⚠️ loads unpacked; **not published to any store** |
| Mobile app | ⛔ skeleton only — every screen is a TODO |
| Model catalog | ⚠️ 22 models, current 2026-09-24. Note the earlier "three months stale" reading was imprecise: the file was edited 2026-09-10 but added no models and never bumped `last_updated`, so the *roster* was un-refreshed while the *date field* was simply wrong. |
| Repo weight | ⚠️ **58 MB `.git`**, ~58 MB of unreferenced binaries |
| Governance files | ❌ no CONTRIBUTING, SECURITY, PRIVACY, CHANGELOG, CITATION |

The honest summary: the hard part is done and done well. What is missing is
everything between "a good tool that works on your machine" and "a tool other
people can find, trust, and keep using" — plus one quiet credibility problem
(catalog staleness) that gets worse on its own every week.

---

## Phase 0 — Credibility maintenance

The methodology is the defensible asset. `docs/ARCHITECTURE.md` says so
outright: *"The defensible asset is the methodology + trust."* An asset that
decays needs a maintenance schedule, and there isn't one.

### 0.1 ⚠️ The model catalog is three months stale

**File:** `packages/core/src/data/models.json`

`_metadata.last_updated` is `2026-06-10`. The newest models in the catalog are
GPT-5, Claude Sonnet 4.5 / Haiku 4.5, Gemini 2.5, Llama 4 Scout and Grok 3.

The product's central claim is that *"the spread between the most and least
efficient model on the same task exceeds 65×"* and that a user should
right-size their model. That claim is only actionable if the model the user is
actually typing into is **in the catalog**. When it isn't,
`autoDetectModel` falls back to a hostname default and silently reports the
wrong model's footprint — the failure is invisible to the user, and it is
wrong in the direction that matters, because new frontier models are exactly
the ones whose energy profile users cannot guess.

This is not a "nice to refresh". In a field that ships a new frontier model
every few weeks, a stale catalog is a correctness bug with a slow fuse.

**Do:**
- Audit the catalog against what the supported sites currently serve in their
  model pickers, and add the missing entries.
- Add a `catalog_age_days` check to `npm test` that **fails CI when
  `last_updated` is more than 90 days old**. Make the decay visible to the
  build rather than to a user.
- Surface the vintage in the UI: "catalog updated June 2026" beside the
  result, so a reader can weigh it.
- Handle unknown models honestly — when `detectModelFromLabels` sees a picker
  label it cannot map, say "unrecognised model, showing the {provider}
  default" rather than presenting a confident figure.

### 0.2 📄 Set and publish a review cadence

`docs/METHODOLOGY.md §8` is titled "Known limitations (read before quoting
numbers)" and is genuinely good. Add to it: who reviews the numbers, how often,
and what triggers an out-of-cycle update (a new provider disclosure, a major
paper revision, a new frontier model). A methodology that names its own review
schedule is materially more fundable than one that doesn't.

### 0.3 ⚠️ Fix the version drift

Four version numbers disagree:

| Location | Version |
|---|---|
| `package.json` (root) | 2.0.0 |
| `packages/core/package.json` | 2.0.0 |
| `models.json` `_metadata.version` | 2.0.0 |
| README badge | 2.0.0 |
| `apps/extension/manifest.json` | **2.2.0** |

The extension has shipped two minor versions that nothing else records, and
there is no `CHANGELOG.md` to explain what changed. Before a store submission
this becomes a real problem: reviewers and users will ask what version they are
running. Add a `CHANGELOG.md`, pick a single source of truth, and add a
consistency check to `scripts/check-apps.js` — it already validates JSON and
cross-references ids, so this fits its existing job.

---

## Phase 1 — Repository weight and licensing hygiene

⚠️ This phase is small, and one part of it may be urgent.

### 1.1 ⚠️ ~58 MB of binaries that nothing references

`.git` is **58 MB** for a project whose entire source is under 6,000 lines.

| Path | Size | Referenced by code or docs? |
|---|---|---|
| `Context/MVF.EIA.S2.REV-Presentation conv.pdf` | 21 MB | **no** |
| `docs/brand-assets/*.png` (7 files, 2816×1536) | 34 MB | **no** |
| `Context/How Hungry is AI.pdf` | 1.7 MB | **no** |
| `Context/Prototypes PartnerFeedback DetailedReport.pdf` | 396 KB | **no** |
| `Context/Eco-Friendly Alternatives (Dashboard).xlsx` | 76 KB | **no** |

`docs/brand-assets/ICON_MAPPING.md` already says it plainly:

> **Status: legacy design reference.** These PNGs (≈5 MB each) were produced
> for the v1 prototype. No current app loads them […] safe to move out of the
> repository.

Every contributor pays that 58 MB on every clone, forever, for assets the
project itself has marked as dead.

**Do:** move the brand assets to a release attachment or a design drive, and
delete `Context/` from the working tree. Note that removing them from HEAD does
**not** shrink `.git` — history rewriting (`git-filter-repo`) is the only thing
that does, and it breaks every existing clone and PR. Given the repo's age and
small contributor count, doing it now is far cheaper than doing it later, but
it is a deliberate call to make with anyone who has a fork.

### 1.2 ⚠️ Check what is in `Context/` before it stays public

Two of those files deserve a look before anything else happens to them, because
this is a **public repository**:

- **`How Hungry is AI.pdf`** is the Jegham et al. paper. arXiv papers carry
  per-submission licences and not all of them permit redistribution. Link to
  `arXiv:2505.09598` instead of vendoring the PDF — the citation is already in
  `METHODOLOGY.md §9` and is more useful than a copy that cannot be updated.
- **`Prototypes PartnerFeedback DetailedReport.pdf`** is partner feedback,
  apparently from the Digital Society School / Ministry of Finance (NL)
  engagement named in the README. Confirm those partners intended their
  detailed feedback to be published before leaving it in a public repo. If
  they did not, `git rm` is not sufficient — it stays in history until the
  history is rewritten.

This is the one item in this document worth doing this week regardless of
everything else.

### 1.3 🔧 Extend `.gitignore`
The current file is good. Add `*.pdf`, `*.xlsx` and `*.docx` under a comment
explaining that source documents belong in a drive, not in git — so this does
not recur.

---

## Phase 2 — Ship the extension

The extension is the product's whole distribution story and it is currently
installable only by developers who clone the repo and enable Developer Mode.
Everything in Phase 2 is between here and a real user.

### 2.1 ⛔ Write a privacy policy

**File:** `PRIVACY.md` + a hosted URL

The Chrome Web Store **requires** a privacy policy URL for any extension
handling user content, and this one reads the text of everything a user types
into ten AI chat sites. Without it, submission is rejected.

The good news is that the policy is genuinely strong and easy to write:
`docs/ARCHITECTURE.md §5` establishes that everything runs client-side, prompts
never leave the device, and history lives in `chrome.storage.local`. Say
exactly that, name the `storage` and `activeTab` permissions and why each is
needed, and state that there is no analytics, no network call, and no account.

That is a better privacy story than almost anything else in this category. It
is worth stating loudly rather than burying in an architecture doc.

### 2.2 ⛔ Prepare the store listing
Screenshots (the demo playground at `apps/demo` is purpose-built for
producing clean ones), a promotional tile, a category, a support contact, and
a description that leads with the relatable-units hook rather than the
methodology.

### 2.3 🔧 Justify the host permissions before review
The manifest requests content-script access to ten AI hosts plus
`moseskolleh.github.io`, `localhost` and `127.0.0.1`. The last three are
development conveniences and reviewers treat broad host permissions as the
main risk signal. Ship the store build without `localhost`/`127.0.0.1`, or be
ready to explain them. Keep `activeTab` and `storage` — both are easy to
defend.

### 2.4 🔧 Submit to Firefox and Edge too
MV3 is broadly portable and both stores are less crowded. Firefox needs a
`browser_specific_settings` key and uses the `browser.*` promise API;
`background.service_worker` may need a fallback.

### 2.5 ⚠️ The selector fragility problem

**File:** `apps/extension/content.js`

The content script finds the composer and the model picker with CSS selectors
against ten third-party sites that redesign without notice. When ChatGPT
changes a class name, the pill silently stops appearing — no error, no test
failure, and the user simply thinks the extension is broken.

`scripts/check-apps.js` is static analysis and cannot catch this by
construction. The demo playground catches regressions in *our* code but its
mock DOM does not track the real sites.

**Do:**
- Add a scheduled CI job that loads each supported site's public landing page
  and asserts the selectors still match something. It cannot log in, but it
  catches the majority of redesigns.
- Make failure visible in the extension: if the composer is not found after N
  seconds on a `matches` host, surface a quiet "couldn't attach to this page"
  state in the popup rather than failing silently.
- Keep selectors in one table with a "last verified" date per site.

### 2.6 🔧 Add browser-level tests
Playwright against `apps/demo` would exercise the real content script against
the three mock interfaces — the injection, the pill, the history write — none
of which any current test covers. The playground already exists for exactly
this purpose; wire it to CI.

---

## Phase 3 — Mobile: decide before building

`apps/mobile` is a well-structured skeleton where every screen is a TODO:
`CoachScreen`, `CompareScreen`, `ImpactScreen`, `LibraryScreen`,
`SettingsScreen`, and `shareTarget.ts`. `engine.ts` is complete and correct —
the core imports cleanly through the workspace, so the hard integration
question is already answered.

### 3.1 🔧 Make the build-or-park call explicitly
A React Native app is a large, permanent maintenance commitment: two app store
review processes, OS upgrade churn, and release engineering — for a project
currently maintained by one person. The extension is unshipped and the catalog
is stale; both deliver more user value per hour than a third surface.

The roadmap in `docs/ARCHITECTURE.md` already puts mobile in the "Later" row.
**Recommendation: park it deliberately**, add a line to `apps/mobile/README.md`
saying so and why, and revisit after the extension is in a store and the
catalog has a maintenance cadence. A parked skeleton that says it is parked is
an asset; one that looks abandoned is a liability to a funder reading the repo.

### 3.2 🔧 If it is built, build the share-sheet first
`shareTarget.ts` is the genuine mobile-only capability — analysing a prompt
shared from the ChatGPT or Claude *apps*, which no extension can reach. The
other four screens duplicate the web app. Ship the share sheet plus the Coach
screen, and let the rest wait for evidence anyone wants it.

### 3.3 🔧 Verify the workspace assumption before writing UI
`apps/mobile/package.json` declares `"@ecoprompt/core": "file:../../packages/core"`,
but the root `workspaces` array lists only `packages/core` — mobile is not a
workspace member. The Metro bundler's handling of a symlinked CommonJS
dependency is the classic first-day blocker. Prove the import works in an Expo
build before anything else is written.

---

## Phase 4 — Trust, verification and research standing

This is where the project's real moat is, and where the cheapest wins are.

### 4.1 📄 Add `CITATION.cff`
The project is built on academic sources and is plausibly citable itself. A
`CITATION.cff` plus a Zenodo–GitHub Releases hook mints a DOI per release and
turns the methodology into something a paper can reference. Low effort, high
credibility return.

### 4.2 🚀 Publish the validation the methodology implies
`METHODOLOGY.md` fits per-token coefficients from published benchmark points.
Nobody has published a comparison of *this* engine's predictions against
independent measurements. Doing so — even on a handful of models — converts
"a well-sourced estimator" into "a validated estimator", which is the
difference between a useful tool and a citable one.

### 4.3 📄 Surface uncertainty in the UI, not just the docs
Every model carries a `data_source` of `measured`, `extrapolated` or
`anchored`, and `energy_wh_std` alongside every mean — **12 of 21 models are
`extrapolated`** and only 8 are `measured`. The engine knows how confident it is. Show it: a figure from an
extrapolated model should not look identical to one from a measured model. This
is the same discipline `METHODOLOGY.md §8` already applies in prose.

### 4.4 ⚠️ Keep grid factors current
`grids.json` carries regional carbon intensity and water factors that move
annually as grids decarbonise. Give them the same staleness check as 0.1.

---

## Phase 5 — Product and growth

### 5.1 🚀 Instrument nothing, measure anyway
The privacy stance (no telemetry) is a real asset and should not be traded
away for analytics. Measure through voluntary channels instead: store install
counts, GitHub stars, a "share your result" flow that the *user* initiates.
Resist the first request to add tracking to prove impact to a funder — the
privacy claim is worth more.

### 5.2 🚀 Org dashboards — the stated monetisation hypothesis
`docs/ARCHITECTURE.md` names this as the next phase: team aggregates, goals,
Slack/Teams weekly recaps, with a CSRD sustainability-reporting tailwind.
Note the tension to resolve first: a team dashboard needs prompts or their
derived metrics to leave the device, which is exactly what §5 promises they
never do. Design the aggregation boundary — send grades and totals, never
prompt text — before writing any of it, and document that boundary as
carefully as the measurement boundaries in `METHODOLOGY.md`.

### 5.3 🚀 Accessibility and internationalisation
The audience for "your AI use has a footprint" is global and the UI is
English-only. Also run a real accessibility pass: colour-coded A–E grades need
a non-colour channel, and the web app's grade badges and charts need
screen-reader text.

### 5.4 🚀 The zero-AI alternatives feature is underplayed
`analyzer.js` detects when a calculator, a weather app or a search would answer
the question better than an LLM — arguably the highest-leverage advice the tool
gives, since it is the only one that takes the footprint to zero. It is one tip
among many. Consider giving it its own moment in the UI.

---

## Phase 6 — Project durability

### 6.1 📄 Governance files
Missing: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
`CHANGELOG.md`, `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`.
For a project that wants outside contributors and institutional adoption,
these are cheap and they are the first thing a reviewer checks.

`CONTRIBUTING.md` should lead with the two rules that already govern this
codebase: run `node scripts/sync-core.js` after touching `packages/core`, and
every number traces to a citation in `METHODOLOGY.md`.

### 6.2 🌍 Dependabot and supply chain
The project's zero-dependency stance makes this nearly free. Add
`.github/dependabot.yml` for GitHub Actions versions — `actions/checkout@v4`
and `setup-node@v4` are floating tags today and should be pinned to commit
SHAs.

### 6.3 🌍 Harden the release path
Tag releases, attach a packed extension zip, and record what changed. Right now
there is no way to tell which commit corresponds to extension 2.2.0.

### 6.4 🌍 Bus factor
One maintainer. `docs/legacy/` holds the original Digital Society School
handover, which suggests this has already survived one transition — write down
what a second one would need.

---

## Sequencing

```
1.2 check Context/ licensing ──┐   (this week, regardless of anything else)
0.1 refresh model catalog ─────┤
0.3 version drift + CHANGELOG ─┤
                               ├── 2.1 privacy policy ── 2.2 store listing ──▶ SHIPPED
2.5 selector monitoring ───────┤                                                   │
2.6 Playwright on apps/demo ───┘                                                   │
                                                                                   ▼
                              4.1 CITATION + DOI ── 4.2 validation ──▶ CITABLE
                                                                                   │
                                            5.2 org dashboard ──▶ REVENUE ─────────┘
```

**If only three things get done:** refresh the model catalog (0.1), check
what is in `Context/` (1.2), and write the privacy policy so the extension can
ship (2.1). The first protects the product's core claim, the second is a
licensing and partner-trust question with a clock on it, and the third unblocks
every user who is not a developer.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Catalog staleness silently misreports a new frontier model | **Certain over time** | High — undermines the one claim the product makes | 0.1, CI staleness gate |
| Third-party material published without permission in `Context/` | Unknown — **needs checking** | High — licensing and partner trust | 1.2 |
| Site redesign silently breaks the extension | **High** — ten third-party sites | High — user sees a dead feature, not an error | 2.5, 2.6 |
| Store rejection for missing privacy policy | Certain if submitted as-is | Medium — delay only | 2.1 |
| Mobile app absorbs effort the extension needs | Medium | Medium | 3.1 — park it explicitly |
| Org dashboard erodes the privacy claim | Medium | High — privacy is the enterprise story | 5.2 — design the boundary first |
| Provider-published figures diverge from this engine | Medium | Medium | 4.2 validation, 0.2 review cadence |
| Bus factor of one | **Current state** | High | 6.1, 6.4 |

---

## Definition of done, for any new model in the catalog

1. Three benchmark points (`short`, `medium`, `long`) with means **and**
   standard deviations.
2. `data_source` honestly set to `measured`, `extrapolated` or `anchored`.
3. `host_key` resolves in `grids.json` — the engine rejects a model whose host
   has no grid entry at construction, and there is a test for it.
4. Any `provider_reported_anchor` records its **boundary**, because provider
   figures are scoped to flatter their own stacks.
5. The source is cited in `METHODOLOGY.md §9`.
6. `detectModelFromLabels` maps the provider's picker label to the new id.
7. `node scripts/sync-core.js` has been run and `npm test` passes.
