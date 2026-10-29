// EcoPrompt Coach Core — entry point (Node / bundlers)
// Browser consumers load the core bundle (scripts/sync-core.js) as a plain
// script; everything attaches to window.EcoPromptCore.

'use strict';

const calculator = require('./calculator');
const analyzer = require('./analyzer');
const conversions = require('./conversions');
const present = require('./present');

const models = require('./data/models.json');
const grids = require('./data/grids.json');
const equivalents = require('./data/equivalents.json');
// Coefficients worked out once from the catalog by scripts/sync-core.js
// (PLAN.md Step 13); a test keeps them equal to a fresh fit.
const precomputed = require('./data/precomputed.json');

/**
 * Convenience factory: engine + converters wired to the bundled datasets,
 * starting from the precomputed coefficients instead of fitting.
 */
function createDefaultEngine() {
  const engine = new calculator.ImpactEngine({ models, grids, equivalents, precomputed });
  const converters = conversions.createConverters(equivalents);
  return { engine, converters };
}

module.exports = {
  ...calculator,
  ...analyzer,
  ...conversions,
  ...present,
  data: { models, grids, equivalents },
  createDefaultEngine
};
