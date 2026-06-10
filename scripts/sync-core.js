#!/usr/bin/env node
// Copies the shared core (scripts + data) into each app's vendor/ directory.
// The extension and web app load these as plain scripts — no bundler needed.
// Run after any change in packages/core:  node scripts/sync-core.js
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const coreSrc = path.join(root, 'packages', 'core', 'src');
const targets = [
  path.join(root, 'apps', 'extension', 'vendor'),
  path.join(root, 'apps', 'web', 'vendor')
];

const scripts = ['calculator.js', 'analyzer.js', 'conversions.js'];
const dataFiles = ['models.json', 'grids.json', 'equivalents.json'];

for (const target of targets) {
  fs.mkdirSync(path.join(target, 'data'), { recursive: true });
  for (const f of scripts) {
    fs.copyFileSync(path.join(coreSrc, f), path.join(target, f));
  }
  for (const f of dataFiles) {
    fs.copyFileSync(path.join(coreSrc, 'data', f), path.join(target, 'data', f));
  }
  console.log(`synced core -> ${path.relative(root, target)}`);
}
