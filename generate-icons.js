#!/usr/bin/env node

const fs = require('fs');
const sharp = require('sharp');

async function generateIcons() {
  console.log('Generating PNG icons from SVG...');

  const svgBuffer = fs.readFileSync('./assets/leaf-icon.svg');

  try {
    // Generate 128x128 icon
    console.log('Generating icon128.png...');
    await sharp(svgBuffer)
      .resize(128, 128)
      .png()
      .toFile('./assets/icon128.png');

    // Generate 48x48 icon
    console.log('Generating icon48.png...');
    await sharp(svgBuffer)
      .resize(48, 48)
      .png()
      .toFile('./assets/icon48.png');

    // Generate 16x16 icon
    console.log('Generating icon16.png...');
    await sharp(svgBuffer)
      .resize(16, 16)
      .png()
      .toFile('./assets/icon16.png');

    console.log('✓ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
