#!/usr/bin/env node
// Writes reference-estimates.json: what the engine says for every reference
// (pre-2026) catalog entry across prompt shapes, efforts and the long-context
// clamp. catalog.test.js checks the engine still says exactly this, so moving
// entries between catalog statuses can never silently change an old number.
//
// Regenerate ONLY when a reference number is meant to change, and say why in
// docs/METHODOLOGY.md:  node packages/core/test/fixtures/make-reference-snapshot.js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ImpactEngine } = require('../../src/calculator');

const SHAPES = [[0, 0], [100, 300], [150, 400], [1000, 1000], [10000, 1500], [200000, 500]];
const EFFORTS = ['low', 'standard', 'high'];

function snapshot(engine, ids) {
  const out = {};
  for (const id of ids) {
    out[id] = [];
    for (const [inputTokens, outputTokens] of SHAPES) {
      for (const reasoningEffort of EFFORTS) {
        const r = engine.estimateImpact({ modelId: id, inputTokens, outputTokens, options: { reasoningEffort } });
        out[id].push({
          in: inputTokens,
          out: outputTokens,
          effort: reasoningEffort,
          wh: r.energy.wh,
          minWh: r.energy.confidence.minWh,
          maxWh: r.energy.confidence.maxWh,
          ml: r.water.ml,
          g: r.carbon.gCO2e,
          grade: r.grade.grade,
          provisional: !!r.grade.provisional
        });
      }
    }
  }
  return out;
}

module.exports = { SHAPES, EFFORTS, snapshot };

if (require.main === module) {
  const data = path.join(__dirname, '..', '..', 'src', 'data');
  const models = JSON.parse(fs.readFileSync(path.join(data, 'models.json'), 'utf8'));
  const grids = JSON.parse(fs.readFileSync(path.join(data, 'grids.json'), 'utf8'));
  const engine = new ImpactEngine({ models, grids });
  const ids = models.models
    .filter((m) => (m.status || 'reference') === 'reference')
    .map((m) => m.model_id);
  const file = path.join(__dirname, 'reference-estimates.json');
  fs.writeFileSync(file, JSON.stringify(snapshot(engine, ids), null, 1) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), file)} (${ids.length} models)`);
}
