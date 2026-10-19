#!/usr/bin/env node
// Catalog gates (PLAN.md Steps 1 and 9). Every way models.json can break the
// rules, as readable messages:
//
//   1. schema v3: status, thinking mode, release date, source format
//   2. a current model was released on or after 2026-01-01
//   3. every source has a status and names the facts it supports
//   4. no current model's estimate rests only on search-only facts
//   5. no current model cites an arXiv id from the RESEARCH-2026 §3.1
//      deny-list
//   6. every superseded_by chain ends at a current model, or at an explicit
//      null for a history-only entry
//
// catalog.test.js runs these rules against models.json and against
// synthetic catalogs that break each one, so a rule with nothing to check
// today still provably bites. Hard-coded model ids in the apps are checked
// by check-apps.js.
//
// Run:  node scripts/check-catalog.js      (also part of `npm test`)
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { MODEL_STATUSES, THINKING_MODES } = require('../packages/core/src/calculator');

const root = path.join(__dirname, '..');

const CURRENT_FROM = '2026-01-01';
const SOURCE_STATUSES = ['fetched', 'search-only'];
const ISO_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

// What a source can vouch for. A source's `fact` lists these, comma
// separated: "params, precision, released".
const FACTS = ['name', 'released', 'params', 'precision', 'thinking', 'effort', 'tier', 'open_weight', 'status', 'pricing'];

// The facts each estimator's numbers rest on. A current entry needs a
// fetched source for every one, or it waits (PLAN.md Step 9). The plan names
// active parameters, thinking mode and tier; precision is added because the
// active-parameter estimator's GPU count depends on it (METHODOLOGY §2.5.1).
const ESTIMATE_FACTS = {
  'active-params': ['params', 'precision', 'thinking'],
  tier: ['tier', 'thinking']
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function factsOf(source) {
  return String(source.fact || '').split(',').map((f) => f.trim()).filter(Boolean);
}

/**
 * The arXiv ids in RESEARCH-2026 §3.1, read from the document itself so the
 * list has one home. Throws if the section or its id block is missing,
 * rather than silently checking against nothing.
 */
function readDenyList(markdown) {
  const start = markdown.indexOf('### 3.1 Do NOT add these citations');
  if (start < 0) throw new Error('RESEARCH-2026.md: section 3.1 "Do NOT add these citations" not found');
  const block = /```\n([\s\S]*?)```/.exec(markdown.slice(start));
  const ids = block ? block[1].match(/\b\d{4}\.\d{4,5}\b/g) : null;
  if (!ids || !ids.length) throw new Error('RESEARCH-2026.md §3.1: no arXiv ids found in its code block');
  return ids;
}

function loadDenyList() {
  return readDenyList(fs.readFileSync(path.join(root, 'docs', 'RESEARCH-2026.md'), 'utf8'));
}

/** Every way a catalog breaks the rules, as readable strings. */
function catalogProblems(data, { denyList = [] } = {}) {
  const problems = [];
  const byId = new Map(data.models.map((m) => [m.model_id, m]));
  const anyCurrent = data.models.some((m) => m.status === 'current');

  for (const m of data.models) {
    const id = m.model_id;
    if (!MODEL_STATUSES.includes(m.status)) problems.push(`${id}: status must be one of ${MODEL_STATUSES}`);
    if (!THINKING_MODES.includes(m.thinking)) problems.push(`${id}: thinking must be one of ${THINKING_MODES}`);
    if ('is_reasoning' in m || 'retired' in m) problems.push(`${id}: is_reasoning/retired are replaced by thinking/status`);
    if (m.released !== undefined && !ISO_DATE.test(m.released)) problems.push(`${id}: released must be an ISO date`);
    for (const s of m.sources || []) {
      if (!s.url || !SOURCE_STATUSES.includes(s.status) || !ISO_DATE.test(s.checked_on || '')) {
        problems.push(`${id}: every source needs a url, a status (${SOURCE_STATUSES}) and checked_on`);
      }
      const facts = factsOf(s);
      if (!facts.length) problems.push(`${id}: source ${s.url} must name the facts it supports (fact: one or more of ${FACTS})`);
      for (const f of facts) {
        if (!FACTS.includes(f)) problems.push(`${id}: source ${s.url} names unknown fact "${f}" (known: ${FACTS})`);
      }
    }
    if (m.open_weight && !(m.params && m.params.active_b > 0 && m.params.total_b >= m.params.active_b)) {
      problems.push(`${id}: an open-weight entry needs params.total_b >= params.active_b > 0`);
    }

    // superseded_by: an explicit null, or an id whose chain ends at a
    // current model or at an explicit null. Once current models exist,
    // every reference entry must say which.
    if (hasOwn(m, 'superseded_by')) {
      if (m.status === 'current' && m.superseded_by !== null) {
        problems.push(`${id}: a current model is not superseded; make it reference first`);
      } else if (m.superseded_by !== null) {
        const seen = new Set([id]);
        let next = m.superseded_by;
        while (next !== null) {
          if (typeof next !== 'string' || !byId.has(next)) {
            problems.push(`${id}: superseded_by chain reaches "${next}", which is not in the catalog`);
            break;
          }
          if (seen.has(next)) {
            problems.push(`${id}: superseded_by chain loops back to "${next}"`);
            break;
          }
          seen.add(next);
          const n = byId.get(next);
          if (n.status === 'current') break;
          if (!hasOwn(n, 'superseded_by')) {
            problems.push(`${id}: superseded_by chain stops at reference "${next}", which has no superseded_by of its own`);
            break;
          }
          next = n.superseded_by;
        }
      }
    } else if (m.status === 'reference' && anyCurrent) {
      problems.push(`${id}: a reference entry needs superseded_by: a successor's id, or null when it is history-only`);
    }

    if (m.status !== 'current') continue;
    if (!m.released || m.released < CURRENT_FROM) problems.push(`${id}: a current model must be released on or after ${CURRENT_FROM}`);
    if (!(m.sources || []).length) problems.push(`${id}: a current model needs sources`);
    // Benchmark points on a current entry must say which benchmark measured
    // them; otherwise they are invented numbers in fields that mean "measured".
    if (m.performance) {
      const src = m.performance_source;
      if (!src || !src.url || src.status !== 'fetched') {
        problems.push(`${id}: a current model's performance points must cite a fetched benchmark (performance_source)`);
      }
    } else if (!m.estimate) {
      problems.push(`${id}: a current model needs performance points or an estimate block`);
    }
    // An estimate rests on a few facts; each needs a page someone opened.
    if (m.estimate && hasOwn(ESTIMATE_FACTS, m.estimate.method)) {
      const fetched = new Set((m.sources || []).filter((s) => s.status === 'fetched').flatMap(factsOf));
      const missing = ESTIMATE_FACTS[m.estimate.method].filter((f) => !fetched.has(f));
      if (missing.length) {
        problems.push(`${id}: its ${m.estimate.method} estimate rests on facts no fetched source supports (${missing.join(', ')}). Fetch the primary page, or the entry waits`);
      }
    }
    // Never ship a citation nobody resolved to a document.
    const text = JSON.stringify(m);
    for (const arxiv of denyList) {
      if (text.includes(arxiv)) {
        problems.push(`${id}: cites arXiv ${arxiv}, on the RESEARCH-2026 §3.1 deny-list (never resolved to a document)`);
      }
    }
  }
  return problems;
}

// A quoted string that looks like a model id: a model family's name, a
// hyphen, then the rest ("gpt-6-sol", "muse-spark-open"), or OpenAI's
// o-series ("o3", "o4-mini"). Hostnames ("claude.ai") and DOM ids don't
// match. Add a family here when a new one joins the catalog.
const MODEL_FAMILIES = [
  'gpt', 'claude', 'gemini', 'gemma', 'llama', 'mistral', 'magistral', 'codestral', 'deepseek',
  'grok', 'muse', 'qwen', 'kimi', 'glm', 'phi', 'sonar', 'command', 'nova'
];
const MODEL_ID_LITERAL = new RegExp(
  `(['"\`])((?:${MODEL_FAMILIES.join('|')})-[a-z0-9][a-z0-9.-]*|o[0-9](?:-[a-z]+)?)\\1`, 'g');

/** Every model-id-looking string literal in a source file, with its line. */
function modelIdsIn(text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(MODEL_ID_LITERAL)) found.push({ id: m[2], line: i + 1 });
  });
  return found;
}

module.exports = {
  CURRENT_FROM, SOURCE_STATUSES, FACTS, ESTIMATE_FACTS, MODEL_FAMILIES,
  catalogProblems, readDenyList, loadDenyList, factsOf, modelIdsIn
};

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'core', 'src', 'data', 'models.json'), 'utf8'));
  const problems = catalogProblems(data, { denyList: loadDenyList() });
  if (problems.length) {
    console.error(`check-catalog: ${problems.length} problem(s) in models.json\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  const current = data.models.filter((m) => m.status === 'current').length;
  console.log(`check-catalog: ok (${data.models.length} entries, ${current} current)`);
}
