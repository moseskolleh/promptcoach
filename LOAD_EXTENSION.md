# HOW TO LOAD THE EXTENSION

## IMPORTANT: You MUST have the latest code

1. **DELETE** the old `promptcoach-main` folder from your Downloads
2. **Download fresh** from: https://github.com/moseskolleh/promptcoach/archive/refs/heads/claude/fix-extension-manifest-018wciL7o91Q83PWavHQirA1.zip
3. **Extract** the ZIP file
4. The folder should contain these files:
   - manifest.json (with icons field)
   - assets/icon16.png
   - assets/icon48.png
   - assets/icon128.png

## Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top-right)
3. Click "Load unpacked"
4. Select the extracted folder (the one with manifest.json inside)

## If it still fails

Run this check - open manifest.json and verify it contains:
```
"icons": {
  "16": "assets/icon16.png",
  "48": "assets/icon48.png",
  "128": "assets/icon128.png"
},
```

If icons field is missing = you have old code, re-download.
