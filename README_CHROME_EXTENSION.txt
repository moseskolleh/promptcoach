================================
HOW TO LOAD ECOPROMPT COACH EXTENSION IN CHROME
================================

STEP 1: EXTRACT THIS ZIP FILE
- Extract the ZIP file you downloaded
- You should see THIS FILE (README_CHROME_EXTENSION.txt) along with:
  - manifest.json
  - popup.html
  - background.js
  - content.js
  - assets folder (with icon files inside)

STEP 2: LOAD IN CHROME
1. Open Chrome
2. Go to: chrome://extensions/
3. Turn ON "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked" button
5. SELECT THE FOLDER containing this README and manifest.json
   - NOT the parent folder
   - NOT just the assets folder
   - The folder that has manifest.json in it

STEP 3: VERIFY
- You should see "EcoPrompt Coach" extension loaded
- If you see an error, check:
  a) Did you select the correct folder (the one with manifest.json)?
  b) Is there a manifest.json file in the folder you selected?
  c) Try closing Chrome completely and reopening

TROUBLESHOOTING:
If it says "Manifest file is missing or unreadable":
- You selected the wrong folder. Go back and select the folder that contains manifest.json
- Open the folder in File Explorer and verify you can see manifest.json file
- The folder structure should be:
  your-folder-name/
    manifest.json  <--- this file must be here
    popup.html
    background.js
    content.js
    assets/
      icon16.png
      icon48.png
      icon128.png

Need help? Check https://github.com/moseskolleh/promptcoach
