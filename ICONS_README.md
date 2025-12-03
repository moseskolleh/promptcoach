# Extension Icons

The Chrome extension requires icon files in the following sizes:
- 16x16 pixels (icon16.png)
- 48x48 pixels (icon48.png)
- 128x128 pixels (icon128.png)

## Current Status
⚠️ **Icon files are currently missing**. The extension will work but will use default Chrome icons.

## Creating Icons

### Option 1: Create Simple Icons
Use any image editor to create a simple icon with these specifications:
- Square format (16x16, 48x48, 128x128)
- Use the eco-friendly green color scheme (#4caf50, #8bc34a)
- Include the 🌱 seedling emoji or leaf symbol
- Save as PNG format

### Option 2: Use an Online Tool
1. Go to https://www.favicon-generator.org/ or similar
2. Upload a base image (like the EcoPrompt logo)
3. Generate icons in multiple sizes
4. Download and rename to icon16.png, icon48.png, icon128.png

### Option 3: Use Command Line (ImageMagick)
If you have ImageMagick installed:

```bash
# Create a simple green icon with text
convert -size 128x128 xc:#4caf50 -gravity center -pointsize 80 -fill white -annotate +0+0 "🌱" assets/icon128.png
convert assets/icon128.png -resize 48x48 assets/icon48.png
convert assets/icon128.png -resize 16x16 assets/icon16.png
```

## Placement
Place the icon files in the `assets/` directory:
- `assets/icon16.png`
- `assets/icon48.png`
- `assets/icon128.png`

## Note
The extension will load without icons, but having proper icons improves the user experience and makes the extension look professional in the Chrome toolbar and extensions page.
