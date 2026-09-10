# EcoPrompt Coach — Demo Playground

Mock chat interfaces for testing the Chrome extension with real-world
prompts, without sending anything to a real AI model.

**Live:** <https://moseskolleh.github.io/promptcoach/demo/>

## What's here

| Page | Mimics | Composer DOM | Simulated model |
|---|---|---|---|
| `index.html` | — | landing page + instructions | — |
| `chatgpt.html` ("NovaChat") | ChatGPT | `contenteditable` div, `data-testid="send-button"` | `gpt-5` |
| `claude.html` ("Clarion") | Claude | ProseMirror-like `contenteditable` | `claude-4.5-sonnet` |
| `gemini.html` ("Lumina") | Gemini | plain `<textarea>` | `gemini-2.5-flash` |

The three skins deliberately use **different composer DOM shapes** so the
extension's input detection (`findPromptInput`), send detection, and pill
positioning are exercised the same way they are on the real sites. Replies
are canned and streamed word-by-word locally; the canned answers also respect
output budgets ("in 50 words" gets a short reply) so the coaching feels real.

Each page carries a `<meta name="ecoprompt-family" content="...">` hint
naming the provider it mimics, and a **model switcher** in its header (cycle
it to see the pill re-estimate: "ChatGPT 5" → "ChatGPT 5 Thinking" is ~30×).
The extension reads the switcher's label exactly as it does on the real
sites. A `<meta name="ecoprompt-model">` hint remains as the fallback on
hostnames the extension doesn't recognize (localhost, GitHub Pages); on real
chat hosts the hostname default always applies when no switcher is found, so
pages can't spoof it.

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
