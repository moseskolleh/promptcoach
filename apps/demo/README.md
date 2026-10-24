# EcoPrompt Coach — Demo Playground

Mock chat interfaces for testing the Chrome extension with real-world
prompts, without sending anything to a real AI model.

**Live:** <https://moseskolleh.github.io/promptcoach/demo/>

## What's here

| Page | Mimics | Composer DOM | Simulated model |
|---|---|---|---|
| `index.html` | — | landing page + instructions | — |
| `chatgpt.html` ("NovaChat") | ChatGPT | `contenteditable` div, `data-testid="send-button"` | `gpt-6-sol` |
| `claude.html` ("Clarion") | Claude | ProseMirror-like `contenteditable` | `claude-sonnet-5-5` |
| `gemini.html` ("Lumina") | Gemini | plain `<textarea>` | `gemini-3.8-flash` |
| `meta.html` ("Orbit") | meta.ai | Lexical-like `contenteditable` | `muse-spark-1.3` |
| `grok.html` ("Quasar") | Grok | plain `<textarea>`, `type="submit"` send | `grok-4.7` |

The skins deliberately vary the **composer DOM shape** so the
extension's input detection (`findPromptInput`), send detection, and pill
positioning are exercised the same way they are on the real sites. Replies
are canned and streamed word-by-word locally; the canned answers also respect
output budgets ("in 50 words" gets a short reply) so the coaching feels real.

Each page carries a `<meta name="ecoprompt-family" content="...">` hint
naming the provider it mimics, and a **model or mode switcher** in its header
with the site's 2026 labels. Cycle it to see the pill re-estimate:

| Page | Labels | What the extension reads |
|---|---|---|
| NovaChat | Instant · Medium · High · Extra High · Pro | GPT-6 Sol at that effort; Pro is GPT-6 Astra |
| Clarion | Sonnet 5.5 · Opus 5.5 · Haiku 5.5 · Fable 5.1, and an effort switch (Low … Max) | the model, at the effort shown |
| Lumina | Auto · 3.8 Flash · 3.5 Flash-Lite · 4 Argon | the model; Auto names none, so the page default |
| Orbit | Instant · Thinking · Contemplating | Muse Spark 1.3; Contemplating runs several agents (a floor) |
| Quasar | Fast · Expert · Heavy | Grok 4.7 at rising effort; Heavy is a team of agents (a floor) |

The extension reads the switcher's label exactly as it does on the real
sites. Mistral's Vibe shows only its default, Medium 3.5, and DeepSeek's
models are not in the catalog yet, so neither has a page; the detection tests
cover their labels (`packages/core/test/detection.test.js`).

A `<meta name="ecoprompt-model">` hint remains as the fallback on hostnames
the extension doesn't recognize (localhost, GitHub Pages); on real chat hosts
the hostname default always applies when no switcher is found, so pages can't
spoof it.

## Run it

```bash
# from the repo root — any static server works
npx serve apps/demo          # http://localhost:3000
# or
python3 -m http.server -d apps/demo 8000
```

Then load the extension (`chrome://extensions` → Developer mode → Load
unpacked → `apps/extension`) and open the demo. `http://localhost/*` and
`http://127.0.0.1/*` are already in the extension's manifest matches.

The deployed copy lives at `https://moseskolleh.github.io/promptcoach/demo/`
(published by `.github/workflows/deploy-pages.yml` on every push to `main`).

## Example prompt bank

`examples.js` groups real-world prompts by the coach feature they demo:
courtesy trimming, output budgets, zero-AI alternatives, quoted-text
protection, and task-type multipliers. Add new examples there — the drawer
renders whatever the file exports.
