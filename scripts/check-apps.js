#!/usr/bin/env node
// Dependency-free static checks for the browser apps, which have no unit
// tests of their own (they are plain scripts wired to HTML). Catches the
// classes of bug that slip through a JS-only test suite:
//
//   1. syntax errors in any app/script file        (node --check)
//   2. malformed JSON data / manifests             (JSON.parse)
//   3. extension manifest pointing at missing files
//   4. HTML <script src>/<link href> pointing at missing files
//   5. JS looking up element ids that the paired HTML doesn't define
//      ($('foo') / getElementById('foo') -> id="foo")
//   6. two classic scripts sharing one global scope (a page's <script> tags,
//      or a worker and its importScripts) declaring the same top-level name
//
// Run:  node scripts/check-apps.js      (also part of `npm test`)
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const problems = [];
let checks = 0;

function rel(p) {
  return path.relative(root, p);
}

function fail(msg) {
  problems.push(msg);
}

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Syntax: every .js under apps/, packages/, scripts/ must parse.
// ---------------------------------------------------------------------------
const jsFiles = ['apps', 'packages', 'scripts'].flatMap((d) =>
  walk(path.join(root, d), (f) => f.endsWith('.js'))
);
for (const file of jsFiles) {
  checks++;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    fail(`syntax error in ${rel(file)}:\n${String(err.stderr || err.message).trim()}`);
  }
}

// ---------------------------------------------------------------------------
// 2. JSON: every .json under apps/ and packages/ must parse.
// ---------------------------------------------------------------------------
const jsonFiles = ['apps', 'packages'].flatMap((d) =>
  walk(path.join(root, d), (f) => f.endsWith('.json'))
);
jsonFiles.push(path.join(root, 'package.json'));
const parsed = new Map();
for (const file of jsonFiles) {
  checks++;
  try {
    parsed.set(file, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    fail(`invalid JSON in ${rel(file)}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Extension manifest: every referenced file must exist.
// ---------------------------------------------------------------------------
const extDir = path.join(root, 'apps', 'extension');
const manifestPath = path.join(extDir, 'manifest.json');
const manifest = parsed.get(manifestPath);
if (manifest) {
  const refs = [];
  for (const cs of manifest.content_scripts || []) {
    refs.push(...(cs.js || []), ...(cs.css || []));
  }
  if (manifest.background && manifest.background.service_worker) {
    refs.push(manifest.background.service_worker);
  }
  if (manifest.action && manifest.action.default_popup) refs.push(manifest.action.default_popup);
  if (manifest.options_page) refs.push(manifest.options_page);
  for (const icons of [manifest.icons, manifest.action && manifest.action.default_icon]) {
    if (icons) refs.push(...Object.values(icons));
  }
  for (const ref of refs) {
    checks++;
    if (!fs.existsSync(path.join(extDir, ref))) {
      fail(`apps/extension/manifest.json references missing file: ${ref}`);
    }
  }
  if (manifest.manifest_version !== 3) fail('apps/extension/manifest.json is not MV3');
}

// ---------------------------------------------------------------------------
// 4 + 5. HTML pages: local script/style references resolve, and every
// element id the page's scripts look up exists in the page.
// ---------------------------------------------------------------------------
const htmlFiles = walk(path.join(root, 'apps'), (f) => f.endsWith('.html'));

function idsDefinedIn(html) {
  const ids = new Set();
  for (const m of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) ids.add(m[1]);
  return ids;
}

function idsLookedUpIn(js) {
  const ids = new Set();
  // $('id') — every app aliases document.getElementById as $ — and direct calls.
  for (const m of js.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)) ids.add(m[1]);
  for (const m of js.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) ids.add(m[1]);
  return ids;
}

for (const htmlPath of htmlFiles) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dir = path.dirname(htmlPath);
  const defined = idsDefinedIn(html);

  const localRefs = [];
  for (const m of html.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/g)) localRefs.push(m[1]);
  for (const m of html.matchAll(/<link[^>]+href\s*=\s*["']([^"']+)["']/g)) localRefs.push(m[1]);
  for (const m of html.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/g)) localRefs.push(m[1]);

  for (const ref of localRefs) {
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('#')) continue;
    checks++;
    const target = path.join(dir, ref.split('?')[0]);
    if (!fs.existsSync(target)) fail(`${rel(htmlPath)} references missing file: ${ref}`);
  }

  // Scripts that belong to this page: local, non-vendor <script src> files.
  const pageScripts = localRefs
    .filter((r) => r.endsWith('.js') && !r.includes('vendor/') && !/^(https?:)?\/\//.test(r))
    .map((r) => path.join(dir, r))
    .filter((p) => fs.existsSync(p));
  for (const script of pageScripts) {
    const js = fs.readFileSync(script, 'utf8');
    for (const id of idsLookedUpIn(js)) {
      checks++;
      if (!defined.has(id)) {
        fail(`${rel(script)} looks up #${id} but ${rel(htmlPath)} defines no element with that id`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Shared global scope. Classic scripts loaded on the same page, and a
// service worker plus everything it importScripts(), share ONE global
// lexical scope: a top-level const/let/class/function declared in two of
// them throws "Identifier has already been declared" and silently aborts the
// second script at load time. (The extension's badge worker shipped broken
// this way: `const { GRADE_BANDS } = …` collided with core's GRADE_BANDS.)
// ---------------------------------------------------------------------------
const IDENT = /^[A-Za-z_$][\w$]*$/;

function topLevelNames(js) {
  const names = new Set();
  const add = (n) => { if (IDENT.test(n)) names.add(n); };
  for (const line of js.split('\n')) {
    let m;
    if ((m = line.match(/^(?:const|let|var)\s+\{([^}]*)\}/))) {
      for (const part of m[1].split(',')) add(part.split(':').pop().split('=')[0].trim());
    } else if ((m = line.match(/^(?:const|let|var)\s+\[([^\]]*)\]/))) {
      for (const part of m[1].split(',')) add(part.split('=')[0].trim());
    } else if ((m = line.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/))) {
      add(m[1]);
    } else if ((m = line.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/))) {
      add(m[1]);
    } else if ((m = line.match(/^class\s+([A-Za-z_$][\w$]*)/))) {
      add(m[1]);
    }
  }
  return names;
}

function checkSharedScope(label, files) {
  const seen = new Map();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const name of topLevelNames(fs.readFileSync(file, 'utf8'))) {
      checks++;
      if (seen.has(name)) {
        fail(`${label}: top-level "${name}" is declared in both ${rel(seen.get(name))} and ${rel(file)} — they share one global scope, so the second script fails to load`);
      } else {
        seen.set(name, file);
      }
    }
  }
}

for (const htmlPath of htmlFiles) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dir = path.dirname(htmlPath);
  const scripts = [];
  for (const m of html.matchAll(/<script(?![^>]*type\s*=\s*["']module["'])[^>]+src\s*=\s*["']([^"']+)["']/g)) {
    if (!/^(https?:)?\/\//.test(m[1])) scripts.push(path.join(dir, m[1].split('?')[0]));
  }
  checkSharedScope(rel(htmlPath), scripts);
}
if (manifest && manifest.background && manifest.background.service_worker && manifest.background.type !== 'module') {
  const worker = path.join(extDir, manifest.background.service_worker);
  const imports = [];
  if (fs.existsSync(worker)) {
    for (const m of fs.readFileSync(worker, 'utf8').matchAll(/importScripts\(([^)]*)\)/g)) {
      for (const arg of m[1].matchAll(/["']([^"']+)["']/g)) imports.push(path.join(extDir, arg[1]));
    }
  }
  checkSharedScope(rel(worker) + ' (service worker + importScripts)', [...imports, worker]);
}
for (const cs of (manifest && manifest.content_scripts) || []) {
  checkSharedScope('apps/extension/manifest.json content_scripts', (cs.js || []).map((f) => path.join(extDir, f)));
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (problems.length) {
  console.error(`check-apps: ${problems.length} problem(s) after ${checks} checks\n`);
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  process.exit(1);
}
console.log(`check-apps: ok (${checks} checks, ${jsFiles.length} scripts, ${jsonFiles.length} JSON files, ${htmlFiles.length} pages)`);
