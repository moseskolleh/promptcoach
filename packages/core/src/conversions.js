// EcoPrompt Coach Core — Relatable Conversions
//
// "0.001 kWh" means nothing to most people. Every impact figure is therefore
// expressed in everyday units first, with the technical number second.
// Conversion factors live in data/equivalents.json with sources; the engine
// picks the unit whose magnitude reads most naturally (target range 0.5–100).

'use strict';

function round(value) {
  if (value >= 100) return Math.round(value);
  if (value >= 1) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function plural(n, singular, pluralForm) {
  return n === 1 ? singular : pluralForm || `${singular}s`;
}

/** Wh as a short technical figure: 0.052 Wh, 1.23 Wh, 16.7 Wh, 1.20 kWh. */
function formatWh(wh) {
  if (wh >= 1000) return `${(wh / 1000).toFixed(2)} kWh`;
  if (wh >= 10) return `${wh.toFixed(1)} Wh`;
  if (wh >= 1) return `${wh.toFixed(2)} Wh`;
  return `${wh.toFixed(3)} Wh`;
}

/**
 * Two formatted ends as one range, sharing the unit when both ends have it:
 * "0.520 Wh" and "16.7 Wh" make "0.520–16.7 Wh". A missing high end is a
 * floor, "≥ 0.520 Wh".
 */
function joinRange(lowText, highText) {
  if (highText === null || highText === undefined) return `≥ ${lowText}`;
  if (lowText === highText) return lowText;
  const lo = /^(\S+) (.+)$/.exec(lowText);
  const hi = /^(\S+) (.+)$/.exec(highText);
  if (lo && hi && lo[2] === hi[2]) return `${lo[1]}–${hi[1]} ${lo[2]}`;
  return `${lowText} – ${highText}`;
}

function formatWhRange(lowWh, highWh) {
  return joinRange(formatWh(lowWh), highWh === null ? null : formatWh(highWh));
}

// What each estimator is called on screen (PLAN.md Step 8).
const METHOD_CHIPS = {
  tier: 'estimated · tier',
  'active-params': 'estimated · from parameters'
};

/**
 * How to label an impact from ImpactEngine.estimateImpact (PLAN.md Step 8).
 * A measured or benchmarked model keeps its single number and grade. A model
 * nobody has measured shows its range, its method, a grade range whenever the
 * range crosses a band, and "likely high": the estimates are built from 2025
 * models on 2025 hardware, the chosen direction of error (PLAN.md Step 2).
 *
 * whText is the figure to show: the range for a model that thinks, "≥ …" for
 * a floor, the point otherwise (with rangeText beside it). gradeLow and
 * gradeHigh are for colour; gradeHigh is null for a floor.
 */
function describeImpact(impact) {
  const grade = impact.grade;
  const range = impact.energy.range;
  if (!range) {
    const wh = impact.energy.wh;
    return {
      estimated: false,
      method: null,
      methodChip: null,
      rangeOnly: false,
      floor: false,
      lowWh: wh,
      highWh: wh,
      whText: formatWh(wh),
      rangeText: null,
      gradeText: grade.grade,
      gradeLow: grade.grade,
      gradeHigh: grade.grade,
      gradeLabel: `Eco-grade ${grade.grade}`,
      note: null,
      noteReason: null
    };
  }
  const low = grade.range.low;
  const high = grade.range.high;
  const method = impact.estimate ? impact.estimate.method : null;
  const rangeText = formatWhRange(range.lowWh, range.highWh);
  const thinks = !!(impact.estimate && impact.estimate.thinkingTokens && impact.estimate.thinkingTokens.highTokens > 0);
  let gradeText;
  let gradeLabel;
  if (range.floor) {
    gradeText = `≥ ${low}`;
    gradeLabel = `Eco-grade ${low} or worse`;
  } else if (low === high) {
    gradeText = low;
    gradeLabel = `Eco-grade ${low}`;
  } else {
    gradeText = `${low}–${high}`;
    gradeLabel = `Eco-grade ${low} to ${high}`;
  }
  return {
    estimated: true,
    method,
    methodChip: METHOD_CHIPS[method] || 'estimated',
    rangeOnly: range.rangeOnly,
    floor: range.floor,
    lowWh: range.lowWh,
    highWh: range.highWh,
    whText: range.rangeOnly ? rangeText : formatWh(impact.energy.wh),
    rangeText,
    gradeText,
    gradeLow: low,
    gradeHigh: high,
    gradeLabel,
    note: 'likely high',
    noteReason: range.floor
      ? 'Several agents answer at once and nobody publishes how many, so this is one agent\'s least.'
      : thinks
        ? 'Hidden thinking is priced from 2025 models on 2025 hardware; newer hardware likely costs less.'
        : 'Built from 2025 models on 2025 hardware; newer hardware likely costs less.'
  };
}

/**
 * What can honestly be said when `better` replaces `worse` on the same
 * query. Two single numbers give a percentage, as compareModels does. With
 * an estimate on either side, a percentage only when better's dearest end
 * is below worse's cheapest, and then "at least" that much; overlapping
 * ranges give "probably less", never a number (PLAN.md Step 27).
 * Returns null when there is no saving to claim.
 *
 * @returns {{claim: 'percent'|'probably', percentage: number|null, atLeast: boolean, energyWh: number|null}|null}
 */
function savingClaim(better, worse) {
  const a = describeImpact(better);
  const b = describeImpact(worse);
  if (!a.estimated && !b.estimated) {
    const aWh = better.energy.wh;
    const bWh = worse.energy.wh;
    if (!(bWh > 0) || aWh >= bWh) return null;
    return {
      claim: 'percent',
      // Never round a real saving up to "100% less energy".
      percentage: Math.min(aWh > 0 ? 99 : 100, Math.round(((bWh - aWh) / bWh) * 100)),
      atLeast: false,
      energyWh: bWh - aWh
    };
  }
  // A floor has no dearest end, so nothing is certain about it.
  if (a.highWh !== null && b.lowWh > 0 && a.highWh < b.lowWh) {
    const percentage = Math.floor(((b.lowWh - a.highWh) / b.lowWh) * 100);
    if (percentage > 0) return { claim: 'percent', percentage, atLeast: true, energyWh: b.lowWh - a.highWh };
  }
  if (!a.floor && better.energy.wh < worse.energy.wh) {
    return { claim: 'probably', percentage: null, atLeast: false, energyWh: null };
  }
  return null;
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

/**
 * A range in one everyday unit, "1.9–60 seconds of a microwave", or null
 * when no unit fits. Both ends must count at least one of the thing and stay
 * within the unit's max, so a range never reads "0.4–12 minutes" or
 * "43–1080 seconds"; of the units that fit, the centre nearest ~3 wins.
 */
function pickRangeLabel(low, high, items) {
  let best = null;
  for (const item of items) {
    const nLow = low / item.perUnit;
    const nHigh = high / item.perUnit;
    if (nLow < Math.max(1, item.min ?? 1)) continue;
    if (item.max !== undefined && nHigh > item.max) continue;
    const label = rangeLabel(item, nLow, nHigh);
    if (!label) continue;
    const distance = Math.abs(Math.log10(Math.sqrt(nLow * nHigh)) - Math.log10(3));
    if (!best || distance < best.distance) best = { label, distance };
  }
  return best ? best.label : null;
}

/**
 * An item's label at the high end with its number widened to the range:
 * "100 minutes of an LED bulb" becomes "3.1–100 minutes of an LED bulb".
 * Labels round with round() or Math.round(); the low end follows suit.
 */
function rangeLabel(item, nLow, nHigh) {
  const text = item.label(nHigh);
  for (const fmt of [round, Math.round]) {
    const hi = String(fmt(nHigh));
    const lo = String(fmt(nLow));
    const at = new RegExp(`(^|\\s)${hi.replace('.', '\\.')}(?=[\\s%])`).exec(text);
    if (!at) continue;
    if (lo === hi) return text;
    const start = at.index + at[1].length;
    return `${text.slice(0, start)}${lo}–${hi}${text.slice(start + hi.length)}`;
  }
  return null;
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

  // Every candidate has min >= 1 except the smallest unit of each
  // dimension, whose label handles sub-unit values ("under a second"), so
  // the picker never produces "0.5 kettles" or "0.05 minutes".
  function energyCandidates() {
    return [
      { perUnit: f.ledBulbW / 3600, label: (n) => (n < 1 ? 'under a second of an LED bulb' : `${round(n)} ${plural(round(n), 'second')} of an LED bulb`), max: 90 },
      { perUnit: f.ledBulbW / 60, label: (n) => `${round(n)} ${plural(round(n), 'minute')} of an LED bulb`, min: 1, max: 120 },
      { perUnit: f.microwaveW / 3600, label: (n) => `${round(n)} ${plural(round(n), 'second')} of a microwave`, min: 1, max: 90 },
      { perUnit: f.phoneChargeWh / 100, label: (n) => `${round(n)}% of a phone charge`, min: 1, max: 99 },
      { perUnit: f.phoneChargeWh, label: (n) => `${round(n)} full phone ${plural(Math.round(n), 'charge')}`, min: 1 },
      { perUnit: f.streamingWhPerMin, label: (n) => `${round(n)} ${plural(round(n), 'minute')} of video streaming`, min: 1, max: 600 },
      { perUnit: f.kettleBoilWh, label: (n) => `boiling ${round(n)} ${plural(round(n), 'kettle')} of water`, min: 1 },
      { perUnit: f.laptopW / 60, label: (n) => `${round(n)} ${plural(round(n), 'minute')} of laptop use`, min: 1, max: 120 },
      { perUnit: f.laptopW, label: (n) => `${round(n)} ${plural(round(n), 'hour')} of laptop use`, min: 1, max: 100 },
      { perUnit: f.ebikeWhPerKm / 1000, label: (n) => `riding an e-bike ${round(n)} ${plural(round(n), 'meter')}`, min: 50, max: 999 },
      { perUnit: f.ebikeWhPerKm, label: (n) => `riding an e-bike ${round(n)} km`, min: 1 }
    ];
  }

  function energy(wh) {
    const pick = pickEquivalent(wh, energyCandidates());
    const primary = pick ? pick.item.label(pick.n) : `${round(wh)} Wh`;
    const secondary = wh < 1 ? `${wh.toFixed(3)} Wh` : wh < 1000 ? `${wh.toFixed(2)} Wh` : `${(wh / 1000).toFixed(3)} kWh`;
    return { primary, secondary };
  }

  function waterCandidates() {
    return [
      { perUnit: 0.05, label: (n) => (n < 1 ? 'less than a drop of water' : `${Math.round(n)} ${plural(Math.round(n), 'drop')} of water`), max: 100 },
      { perUnit: f.teaspoonMl, label: (n) => `${round(n)} ${plural(round(n), 'teaspoon')} of water`, min: 1, max: 30 },
      { perUnit: f.espressoShotMl, label: (n) => `${round(n)} espresso ${plural(round(n), 'shot')} of water`, min: 1, max: 30 },
      { perUnit: f.glassMl, label: (n) => `${round(n)} ${plural(round(n), 'glass', 'glasses')} of drinking water`, min: 1, max: 40 },
      { perUnit: f.bottleMl, label: (n) => `${round(n)} water ${plural(round(n), 'bottle')}`, min: 1, max: 60 },
      { perUnit: f.toiletFlushL * 1000, label: (n) => `${round(n)} toilet ${plural(round(n), 'flush', 'flushes')}`, min: 1, max: 100 },
      { perUnit: f.showerLPerMin * 1000, label: (n) => `${round(n)} ${plural(round(n), 'minute')} of showering`, min: 1 }
    ];
  }

  function water(ml) {
    const pick = pickEquivalent(ml, waterCandidates());
    const primary = pick ? pick.item.label(pick.n) : `${round(ml)} mL`;
    const secondary = ml < 1000 ? `${ml.toFixed(1)} mL` : `${(ml / 1000).toFixed(2)} L`;
    return { primary, secondary };
  }

  function carbonCandidates() {
    const carMPerG = 1000 / f.carGPerKm;
    return [
      { perUnit: f.breathGPerMin / 60, label: (n) => (n < 1 ? 'under a second of breathing' : `${round(n)} ${plural(round(n), 'second')} of breathing`), max: 90 },
      { perUnit: f.breathGPerMin, label: (n) => `${round(n)} ${plural(round(n), 'minute')} of breathing`, min: 1, max: 30 },
      { perUnit: 1 / carMPerG, label: (n) => `driving a car ${round(n)} ${plural(round(n), 'meter')}`, min: 1, max: 999 },
      { perUnit: f.carGPerKm, label: (n) => `driving a car ${round(n)} km`, min: 1 },
      { perUnit: f.emailG, label: (n) => `sending ${Math.round(n)} short ${plural(Math.round(n), 'email')}`, min: 2, max: 500 },
      { perUnit: f.treeGPerHour, label: (n) => `${round(n)} ${plural(round(n), 'hour')} of one tree's CO₂ uptake`, min: 1, max: 48 },
      { perUnit: f.treeGPerHour * 24, label: (n) => `${round(n)} ${plural(round(n), 'day')} of one tree's CO₂ uptake`, min: 1 }
    ];
  }

  function carbon(g) {
    const pick = pickEquivalent(g, carbonCandidates());
    const primary = pick ? pick.item.label(pick.n) : `${round(g)} g CO₂e`;
    const secondary = g < 1000 ? `${g.toFixed(2)} g CO₂e` : `${(g / 1000).toFixed(3)} kg CO₂e`;
    return { primary, secondary };
  }

  /**
   * A range in everyday units: "between … and …", or "at least …" when the
   * high end is null. Equal ends read as the single figure.
   */
  function inRange(convert, low, high) {
    const lo = convert(low);
    if (high === null) return { primary: `at least ${lo.primary}`, secondary: joinRange(lo.secondary, null) };
    const hi = convert(high);
    const secondary = joinRange(lo.secondary, hi.secondary);
    if (lo.primary === hi.primary) return { primary: lo.primary, secondary };
    const oneUnit = pickRangeLabel(low, high, convert.candidates());
    return { primary: oneUnit || `between ${lo.primary} and ${hi.primary}`, secondary };
  }

  energy.candidates = energyCandidates;
  water.candidates = waterCandidates;
  carbon.candidates = carbonCandidates;

  // "about 4 minutes", but never "about under a second".
  const about = (text) => (/^(under|less than) /.test(text) ? text : `about ${text}`);

  const energyRange = (lowWh, highWh) => inRange(energy, lowWh, highWh);
  const waterRange = (lowMl, highMl) => inRange(water, lowMl, highMl);
  const carbonRange = (lowG, highG) => inRange(carbon, lowG, highG);

  /**
   * All three comparisons for an impact object from ImpactEngine. A model
   * nobody has measured always shows its range: "between … and …" when it
   * thinks, "at least …" for a floor, and "about …" with the range as the
   * technical figure otherwise (PLAN.md Step 8). `times` repeats the same
   * query, for "25 queries a day".
   */
  function forImpact(impact, times = 1) {
    const k = Number.isFinite(times) && times > 0 ? times : 1;
    const range = impact.energy.range;
    if (!range) {
      return {
        energy: energy(impact.energy.wh * k),
        water: water(impact.water.ml * k),
        carbon: carbon(impact.carbon.gCO2e * k)
      };
    }
    const dims = [
      ['energy', energy, impact.energy.wh, range.lowWh, range.highWh],
      ['water', water, impact.water.ml, impact.water.range.lowMl, impact.water.range.highMl],
      ['carbon', carbon, impact.carbon.gCO2e, impact.carbon.range.lowG, impact.carbon.range.highG]
    ];
    const out = {};
    for (const [key, convert, rawPoint, rawLow, rawHigh] of dims) {
      const point = rawPoint * k;
      const low = rawLow * k;
      const high = rawHigh === null ? null : rawHigh * k;
      const r = inRange(convert, low, high);
      out[key] = range.rangeOnly
        ? r
        : { primary: about(convert(point).primary), secondary: r.secondary };
    }
    return out;
  }

  /**
   * Narrative summary for aggregated totals (dashboard / weekly recap), e.g.
   * "Your 142 queries this week used the energy of boiling 3.1 kettles…"
   */
  function forTotals(totals, periodLabel) {
    // With an estimate among them, the totals are a range too.
    const r = totals.range;
    const e = r ? energyRange(r.lowWh, r.highWh) : energy(totals.energyWh);
    const w = r ? waterRange(r.lowMl, r.highMl) : water(totals.waterMl);
    const c = r ? carbonRange(r.lowG, r.highG) : carbon(totals.carbonG);
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

  return { energy, water, carbon, energyRange, waterRange, carbonRange, forImpact, forTotals, factors: f };
}

const ConversionsModule = { createConverters, describeImpact, savingClaim, formatWh, formatWhRange, METHOD_CHIPS };

if (typeof globalThis !== 'undefined') {
  globalThis.EcoPromptCore = globalThis.EcoPromptCore || {};
  Object.assign(globalThis.EcoPromptCore, ConversionsModule);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConversionsModule;
}
