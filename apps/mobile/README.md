# EcoPrompt Coach — Mobile App (structure)

This directory is the **planned structure** for the mobile app (iOS +
Android), as a skeleton — screens, services, and navigation are stubbed with
typed interfaces and TODOs, ready to be implemented. Nothing here is built
or published yet; it documents the architecture so implementation can start
immediately.

## Stack decision

- **Expo (React Native, TypeScript)** — one codebase for both platforms,
  OTA updates, and the fastest path to stores for a small team.
- **`@ecoprompt/core` reuse** — the exact same calculation engine that powers
  the extension and web app is plain CommonJS with zero dependencies, so the
  mobile app imports it directly through the npm workspace
  (`packages/core`). One source of truth for all numbers on every platform.
- **AsyncStorage** for history + prompt library (same shapes as the
  extension's `chrome.storage` records, enabling future sync).
- **React Navigation** bottom tabs: Coach · Compare · Impact · Library ·
  Settings.

## Mobile-specific product hooks (why a mobile app at all)

1. **Share-sheet intake** — share any text from any app (including the
   ChatGPT/Claude/Gemini apps) into EcoPrompt Coach to analyze it before
   sending (`src/services/shareTarget.ts`).
2. **Keyboard-adjacent quick check** — a lightweight "analyze clipboard"
   action and home-screen widget showing today's eco-grade.
3. **Weekly recap notifications** — local notification with the relatable
   weekly sentence ("Your 142 queries this week ≈ boiling 4 kettles").

## File map

```
apps/mobile/
├── App.tsx                     # entry: providers + navigation container
├── app.json                    # Expo config (name, icons, scheme)
├── package.json                # dependency manifest (not installed here)
├── tsconfig.json
└── src/
    ├── theme.ts                # shared design tokens (same palette as web/extension)
    ├── navigation/index.tsx    # bottom-tab navigator
    ├── screens/
    │   ├── CoachScreen.tsx     # prompt input → live impact + tips
    │   ├── CompareScreen.tsx   # model comparison for the same prompt
    │   ├── ImpactScreen.tsx    # personal dashboard (totals, streaks, recap)
    │   ├── LibraryScreen.tsx   # saved sustainable prompts
    │   └── SettingsScreen.tsx  # default model/region/effort, embodied toggle
    ├── components/
    │   ├── GradeBadge.tsx      # A–E letter badge
    │   ├── MetricCard.tsx      # relatable primary + technical secondary
    │   └── TipCard.tsx         # coaching tip with priority accent
    └── services/
        ├── engine.ts           # singleton wrapper around @ecoprompt/core
        ├── storage.ts          # AsyncStorage: history + library + settings
        └── shareTarget.ts      # share-sheet / deep-link intake
```

## Getting it running (when implementation starts)

```bash
npx create-expo-app@latest --template blank-typescript  # or use this skeleton
cd apps/mobile
npm install
npx expo start
```

Then implement screens against `src/services/engine.ts` — the API is
identical to the web app's (`estimateImpact`, `compareModels`,
`analyzePrompt`, `createConverters`), so most rendering logic can be ported
from `apps/web/app.js`.
