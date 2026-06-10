// EcoPrompt Coach Core — Relatable Conversions
//
// "0.001 kWh" means nothing to most people. Every impact figure is therefore
// expressed in everyday units first, with the technical number second.
// Conversion factors live in data/equivalents.json with sources; the engine
// picks the unit whose magnitude reads most naturally (target range 0.5–100).

'use strict';

function round(value) {
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  if (value >= 1) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function plural(n, singular, pluralForm) {
  return n === 1 ? singular : pluralForm || `${singular}s`;
}

/**
 * Pick the equivalence whose converted value lands closest to a "human"
 * magnitude. Each item: { perUnit, label(n), min?, max? } where perUnit is
 * the amount (same unit as `value`) represented by ONE of the everyday thing.
 */
function pickEquivalent(value, items) {
  let bestItem = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const n = value / item.perUnit;
    if (item.min !== undefined && n < item.min) continue;
    if (item.max !== undefined && n > item.max) continue;
    // Prefer counts near ~3 on a log scale (e.g. "4 minutes", "2 charges").
    const distance = Math.abs(Math.log10(Math.max(n, 1e-9)) - Math.log10(3));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestItem = { item, n };
    }
  }
  return bestItem;
}

function createConverters(equivalents) {
  const eq = equivalents && equivalents.factors ? equivalents.factors : {};

  // Defaults are used when equivalents.json doesn't override; all sourced in
  // docs/METHODOLOGY.md.
  const f = {
    phoneChargeWh: eq.phone_charge_wh ?? 15, // full smartphone charge
    ledBulbW: eq.led_bulb_w ?? 10, // modern LED bulb draw
    microwaveW: eq.microwave_w ?? 1000,
    laptopW: eq.laptop_w ?? 50,
    streamingWhPerMin: eq.streaming_wh_per_min ?? 1.3, // TV streaming, device+network
    kettleBoilWh: eq.kettle_boil_wh ?? 110, // boil 1L of water
    ebikeWhPerKm: eq.ebike_wh_per_km ?? 10,
    teaspoonMl: eq.teaspoon_ml ?? 5,
    espressoShotMl: eq.espresso_shot_ml ?? 30,
    glassMl: eq.glass_ml ?? 250,
    bottleMl: eq.bottle_ml ?? 500,
    toiletFlushL: eq.toilet_flush_l ?? 6,
    showerLPerMin: eq.shower_l_per_min ?? 10,
    carGPerKm: eq.car_g_per_km ?? 170, // average EU/US new passenger car
    breathGPerMin: eq.breath_g_per_min ?? 0.7, // human exhaled CO2 at rest
    treeGPerHour: eq.tree_g_per_hour ?? 2.4, // mature tree absorption (~21 kg/yr)
    emailG: eq.email_g ?? 0.3 // short email, network+device share
  };

  function energy(wh) {
    const candidates = [
      { perUnit: f.ledBulbW / 3600, label: (n) => `${round(n)} ${plural(round(n), 'second')} of an LED bulb`, max: 90 },
      { perUnit: f.ledBulbW / 60, label: (n) => `${round(n)} ${plural(round(n), 'minute')} of an LED bulb`, min: 1, max: 120 },
      { perUnit: f.microwaveW / 3600, label: (n) => `${round(n)} ${plural(round(n), 'second')} of a microwave`, min: 1, max: 90 },
      { perUnit: f.phoneChargeWh / 100, label: (n) => `${round(n)}% of a phone charge`, min: 1, max: 99 },
      { perUnit: f.phoneChargeWh, label: (n) => `${round(n)} full phone ${plural(Math.round(n), 'charge')}`, min: 1 },
      { perUnit: f.streamingWhPerMin, label: (n) => `${round(n)} ${plural(round(n), 'minute')} of video streaming`, min: 1, max: 600 },
      { perUnit: f.kettleBoilWh, label: (n) => `boiling ${round(n)} ${plural(round(n), 'kettle')} of water`, min: 0.5 },
      { perUnit: f.laptopW, label: (n) => `${round(n)} ${plural(round(n), 'hour')} of laptop use`, min: 0.5, max: 100 },
      { perUnit: f.ebikeWhPerKm, label: (n) => `riding an e-bike ${round(n)} km`, min: 0.5 }
    ];
    const pick = pickEquivalent(wh, candidates);
    const primary = pick ? pick.item.label(pick.n) : `${round(wh)} Wh`;
    const secondary = wh < 1 ? `${wh.toFixed(3)} Wh` : wh < 1000 ? `${wh.toFixed(2)} Wh` : `${(wh / 1000).toFixed(3)} kWh`;
    return { primary, secondary };
  }

  function water(ml) {
    const candidates = [
      { perUnit: 0.05, label: (n) => `${round(n)} ${plural(round(n), 'drop')} of water`, max: 60 },
      { perUnit: f.teaspoonMl, label: (n) => `${round(n)} ${plural(round(n), 'teaspoon')} of water`, min: 0.5, max: 30 },
      { perUnit: f.espressoShotMl, label: (n) => `${round(n)} espresso ${plural(round(n), 'shot')} of water`, min: 0.5, max: 30 },
      { perUnit: f.glassMl, label: (n) => `${round(n)} ${plural(round(n), 'glass', 'glasses')} of drinking water`, min: 0.5, max: 40 },
      { perUnit: f.bottleMl, label: (n) => `${round(n)} water ${plural(round(n), 'bottle')}`, min: 0.5, max: 60 },
      { perUnit: f.toiletFlushL * 1000, label: (n) => `${round(n)} toilet ${plural(round(n), 'flush', 'flushes')}`, min: 0.5, max: 100 },
      { perUnit: f.showerLPerMin * 1000, label: (n) => `${round(n)} ${plural(round(n), 'minute')} of showering`, min: 0.5 }
    ];
    const pick = pickEquivalent(ml, candidates);
    const primary = pick ? pick.item.label(pick.n) : `${round(ml)} mL`;
    const secondary = ml < 1000 ? `${ml.toFixed(1)} mL` : `${(ml / 1000).toFixed(2)} L`;
    return { primary, secondary };
  }

  function carbon(g) {
    const carMPerG = 1000 / f.carGPerKm;
    const candidates = [
      { perUnit: f.breathGPerMin, label: (n) => `${round(n)} ${plural(round(n), 'minute')} of breathing`, max: 30 },
      { perUnit: 1 / carMPerG, label: (n) => `driving a car ${round(n)} ${plural(round(n), 'meter')}`, min: 1, max: 900 },
      { perUnit: f.carGPerKm, label: (n) => `driving a car ${round(n)} km`, min: 0.9 },
      { perUnit: f.emailG, label: (n) => `sending ${Math.round(n)} short ${plural(Math.round(n), 'email')}`, min: 2, max: 500 },
      { perUnit: f.treeGPerHour, label: (n) => `${round(n)} ${plural(round(n), 'hour')} of one tree's CO₂ uptake`, min: 0.5, max: 500 },
      { perUnit: f.treeGPerHour * 24, label: (n) => `${round(n)} ${plural(round(n), 'day')} of one tree's CO₂ uptake`, min: 0.5 }
    ];
    const pick = pickEquivalent(g, candidates);
    const primary = pick ? pick.item.label(pick.n) : `${round(g)} g CO₂e`;
    const secondary = g < 1000 ? `${g.toFixed(2)} g CO₂e` : `${(g / 1000).toFixed(3)} kg CO₂e`;
    return { primary, secondary };
  }

  /**
   * All three comparisons for an impact object from ImpactEngine.
   */
  function forImpact(impact) {
    return {
      energy: energy(impact.energy.wh),
      water: water(impact.water.ml),
      carbon: carbon(impact.carbon.gCO2e)
    };
  }

  /**
   * Narrative summary for aggregated totals (dashboard / weekly recap), e.g.
   * "Your 142 queries this week used the energy of boiling 3.1 kettles…"
   */
  function forTotals(totals, periodLabel) {
    const e = energy(totals.energyWh);
    const w = water(totals.waterMl);
    const c = carbon(totals.carbonG);
    return {
      energy: e,
      water: w,
      carbon: c,
      sentence:
        `Your ${totals.queries} ${plural(totals.queries, 'query', 'queries')}` +
        (periodLabel ? ` ${periodLabel}` : '') +
        ` used the energy of ${e.primary} (${e.secondary}), ` +
        `the water of ${w.primary} (${w.secondary}), ` +
        `and emitted as much CO₂ as ${c.primary} (${c.secondary}).`
    };
  }

  return { energy, water, carbon, forImpact, forTotals, factors: f };
}

const ConversionsModule = { createConverters };

if (typeof window !== 'undefined') {
  window.EcoPromptCore = window.EcoPromptCore || {};
  Object.assign(window.EcoPromptCore, ConversionsModule);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConversionsModule;
}
