#!/usr/bin/env node
// Generates the extension/web icon set from an inline SVG design.
// Brand: white leaf on the EcoPrompt green gradient, rounded square.
// Run: node scripts/make-icons.js   (requires: npm i --no-save sharp)
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');

// Full design (48px and up): leaf with stem and a center vein.
const fullSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10B981"/>
      <stop offset="1" stop-color="#047857"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="128" height="128" rx="28" fill="url(#bg)"/>
  <!-- leaf body: two arcs meeting at tip (top) and base (bottom) -->
  <path d="M64 22
           C 92 38 100 62 92 84
           C 86 100 74 106 64 108
           C 54 106 42 100 36 84
           C 28 62 36 38 64 22 Z"
        fill="#FFFFFF"/>
  <!-- center vein + side veins, cut out of the leaf in brand green -->
  <path d="M64 30 L64 108" stroke="#059669" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M64 52 L46 66 M64 52 L82 66 M64 74 L48 86 M64 74 L80 86"
        stroke="#059669" stroke-width="4.5" stroke-linecap="round" fill="none"/>
</svg>`;

// Simplified design for 16px: oversized solid leaf, no veins (they turn to
// mush) — at toolbar size the white shape must dominate the tile.
const tinySvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10B981"/>
      <stop offset="1" stop-color="#047857"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="128" height="128" rx="24" fill="url(#bg)"/>
  <path d="M64 6
           C 108 28 120 62 108 90
           C 99 112 78 122 64 124
           C 50 122 29 112 20 90
           C 8 62 20 28 64 6 Z"
        fill="#FFFFFF"/>
</svg>`;

const outDir = path.join(__dirname, '..', 'apps', 'extension', 'assets');

async function main() {
  const jobs = [
    { svg: fullSvg, size: 128, file: 'icon128.png' },
    { svg: fullSvg, size: 48, file: 'icon48.png' },
    { svg: tinySvg, size: 16, file: 'icon16.png' }
  ];
  for (const { svg, size, file } of jobs) {
    const out = path.join(outDir, file);
    await sharp(Buffer.from(svg), { density: 384 })
      .resize(size, size)
      .png()
      .toFile(out);
    console.log(`wrote ${path.relative(process.cwd(), out)} (${size}x${size})`);
  }
  // Keep the brand SVG in sync for HTML use (popup header, web favicon).
  fs.writeFileSync(path.join(outDir, 'leaf-icon.svg'), fullSvg.trim() + '\n');
  fs.writeFileSync(
    path.join(__dirname, '..', 'apps', 'web', 'favicon.svg'),
    fullSvg.trim() + '\n'
  );
  console.log('wrote leaf-icon.svg + web favicon.svg');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
