#!/usr/bin/env node
// Packages apps/extension into dist/ecoprompt-coach-extension-<version>.zip
// with manifest.json at the zip root (Chrome Web Store layout).
// No npm dependencies: delegates to python3's zipfile (present on macOS/Linux).
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const extDir = path.join(root, 'apps', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const out = path.join(distDir, `ecoprompt-coach-extension-${manifest.version}.zip`);
if (fs.existsSync(out)) fs.unlinkSync(out);

// Pass TOP-LEVEL entries only: python's zipfile CLI stores plain file
// arguments under their basename (which would flatten assets/ and vendor/),
// but directory arguments keep their internal structure. manifest.json and
// friends land at the zip root either way — the Chrome Web Store layout.
const skip = new Set(['README.md', '.DS_Store']);
const entries = fs.readdirSync(extDir).filter((name) => !skip.has(name));

execFileSync('python3', ['-m', 'zipfile', '-c', out, ...entries], { cwd: extDir });
console.log(`packed ${entries.length} top-level entries -> ${path.relative(root, out)}`);
