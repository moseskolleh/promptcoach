# Catalog refresh runbook

The model catalog (`packages/core/src/data/models.json`) goes stale within
weeks. October 2026 alone saw:
- Claude Haiku 5.5 (Oct 7)
- GPT-6 becoming ChatGPT's default (Oct 7–8)
- Gemini 4 Argon reaching the API (Oct 13)
- Muse Spark Open (Oct 15)
- DeepSeek V4.1-Flash-1017 (Oct 17)

So the catalog is refreshed **monthly**, in the first week of the month,
and also whenever a lab ships a model a site's picker offers. Every refresh
lands as one pull request that lists its sources. This runbook is PLAN.md
Step 9.

## 1. Before you start: network access

Most facts have to come from a page someone actually opened. A fact seen
only in search results is `search-only`, and CI won't ship an estimate
that rests on one (section 4). So check first which vendor pages your
environment can reach.

On 2026-10-19 this repo's cloud environment could reach only Anthropic's and
GitHub's hosts:

| Reachable | Blocked |
|---|---|
| platform.claude.com, support.claude.com, www.anthropic.com, github.com, raw.githubusercontent.com | help.openai.com, platform.openai.com, openai.com, ai.google.dev, deepmind.google, blog.google, dev.meta.ai, ai.meta.com, x.ai, docs.x.ai, mistral.ai, docs.mistral.ai, api-docs.deepseek.com, huggingface.co, perplexity.ai, poe.com, arxiv.org |

That is why most non-Anthropic facts are `search-only` today.

To check again:

```sh
for h in help.openai.com ai.google.dev ai.meta.com docs.x.ai docs.mistral.ai \
         api-docs.deepseek.com huggingface.co perplexity.ai poe.com; do
  printf '%s ' "$h"; curl -sS -o /dev/null -m 12 -w '%{http_code}\n' "https://$h/" || echo blocked
done
```

To unblock a host, open the cloud environment's settings: the environment
menu in the session's title bar, then **Edit**. Under **Network access**,
add the host to **Allowed domains** and leave *Allow package managers*
ticked. The steps are at
<https://code.claude.com/docs/en/cloud-environments#network-access>.

Hosts worth allowing, and what each gives you:

| Provider | Hosts | What you read there |
|---|---|---|
| OpenAI | platform.openai.com, help.openai.com, openai.com | API model list and release dates; ChatGPT picker and effort labels |
| Google | ai.google.dev, deepmind.google, blog.google | Gemini API models; launch posts; app picker and thinking levels |
| Meta | ai.meta.com, dev.meta.ai, huggingface.co | Muse model cards; open-weight parameters and precision |
| xAI | x.ai, docs.x.ai | Grok models; Fast, Expert and Heavy |
| Mistral | mistral.ai, docs.mistral.ai, huggingface.co | Model list; open weights for Large 4 and Small |
| DeepSeek | api-docs.deepseek.com, huggingface.co | V4 models; Think levels; parameters and precision |
| Routers | perplexity.ai, poe.com | Default models, for the site defaults (PLAN.md Step 6) |

## 2. What to check, per provider

For each provider in the catalog, and each site in the extension's
manifest:

1. **The lineup.** Which models a user can pick today, by their API id and
   by the name the picker shows. Note any model that has gone.
2. **Release dates.** A `current` model must be released on or after
   2026-01-01.
3. **Thinking and effort.**
   - Does the model always think, decide for itself, offer it as a switch,
     or never think (`thinking`)?
   - Which effort labels does the app show (`effort_vocab`; see
     METHODOLOGY §2.5.7), and which one is the default (`default_effort`)?
4. **Open-weight models.** From the model card, read the total and active
   parameters and the precision the weights ship in (`params`).
5. **Closed models.** The tier, small or frontier, from how the provider
   positions the model. Cross-check against the price order within that
   provider, but never use price as an input (PLAN.md Step 2).
6. **The site's picker.** What each label resolves to, and the site's
   default (PLAN.md Step 6).

## 3. Making the change

- **A new model.** Add an entry with:
  - `status: "current"`, `released`, `thinking`, plus `effort_vocab` and
    `default_effort` where they apply;
  - `open_weight` and `params`, for an open-weight model;
  - an `estimate` block: `active-params` for open weights, or `tier` with
    its tier for a closed model;
  - `sources`: one row per page, `{ fact, url, status, checked_on }`.
- **What a source vouches for.** `fact` lists it, comma separated, from:
  `name, released, params, precision, thinking, effort, tier, open_weight,
  status, pricing`.
- **A model that's gone.** Set it to `status: "reference"` and point
  `superseded_by` at its successor, or `null` when it has none. Never
  delete it: stored history and share links still resolve it.
- **A renamed or removed id.** `check-apps` reports every place an app
  still hard-codes it: defaults, detection maps, demo pages. Fix those in
  the same PR.
- **Never cite** an arXiv id from RESEARCH-2026 §3.1. Nobody has resolved
  those ids to a document.
- Bump `_metadata.last_updated` and `_metadata.last_checked`.
- Run `npm test`, or `npm run check:catalog` for the catalog gates alone.

## 4. What CI checks, and how to fix each failure

`scripts/check-catalog.js` runs the catalog gates, and `scripts/check-apps.js`
checks the apps. Both run in CI and in `npm test`.

| Message | Fix |
|---|---|
| *a current model must be released on or after 2026-01-01* | It isn't current: make it `reference`. |
| *every source needs a url, a status … and checked_on* | Complete the source row. |
| *must name the facts it supports* / *names unknown fact* | Set `fact` from the list in section 3. |
| *its … estimate rests on facts no fetched source supports (…)* | Open the primary page and mark the source `fetched`. If you can't, the entry waits: leave it out of this refresh. |
| *cites arXiv …, on the RESEARCH-2026 §3.1 deny-list* | Remove the citation. |
| *superseded_by chain reaches … / loops back to … / stops at reference …* | Point the chain at a current model, or end it with `null`. |
| *a reference entry needs superseded_by* | Once any current model exists, every reference entry says what replaced it, or `null`. |
| *a current model is not superseded* | Make it `reference` first. |
| *model id "…" is not in models.json* (check-apps) | Use a catalog id in that file, or add the entry. |

The active-parameter estimate needs fetched `params` and `thinking`. A
stated `precision` needs a fetched source too; when a lab publishes none,
leave `params.precision` out and the estimate assumes 16 bits, which errs
high. The tier estimate needs fetched `tier` and `thinking`.

## 5. The pull request

Title it `Catalog refresh YYYY-MM`, or name the model for an off-cycle
refresh. The body lists:
- the models added, changed and moved to `reference`, with their
  `superseded_by`;
- a table of every source used: fact, URL, status, `checked_on`;
- what is still `search-only`, and therefore left out;
- which hosts were blocked, so the next refresh can try again.

## 6. Refresh log

| Date | PR | What changed |
|---|---|---|
| — | — | Not yet used for real. The first use is Mistral Large 4's open weights, expected Oct 27–31 2026 (search-only; sources conflict). It needs mistral.ai or huggingface.co to be reachable. |
