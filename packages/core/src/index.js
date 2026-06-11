// EcoPrompt Coach Core — entry point (Node / bundlers)
// Browser consumers load calculator.js / analyzer.js / conversions.js as
// plain scripts; everything attaches to window.EcoPromptCore.

'use strict';

const calculator = require('./calculator');
const analyzer = require('./analyzer');
const conversions = require('./conversions');

const models = require('./data/models.json');
const grids = require('./data/grids.json');
const equivalents = require('./data/equivalents.json');

/**
 * Convenience factory: engine + converters wired to the bundled datasets.
 */
function createDefaultEngine() {
  const engine = new calculator.ImpactEngine({ models, grids, equivalents });
  const converters = conversions.createConverters(equivalents);
  return { engine, converters };
}

module.exports = {
  ...calculator,
  ...analyzer,
  ...conversions,
  data: { models, grids, equivalents },
  createDefaultEngine
};
