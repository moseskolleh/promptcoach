// EcoPrompt Coach — query history, v2 (PLAN.md Step 11).
//
// Each send is stored as the inputs that produced its number, plus the
// figures they gave. Ids and numbers only, never the prompt's text:
//
//   { v: 2, ts, host, modelId, modelSource, effort, taskType, inTokens,
//     outTokensEst, outTokensObs, convKey, flags, region, embodied,
//     energyWh, waterMl, carbonG, grade, lowWh?, highWh? }
//
// Rows live in one key per local calendar day ('h:2026-10-27'), and
// 'agg:daily' keeps each day's totals, so a send touches two small keys and
// the Impact tab reads one. Totals outlive rows: retention drops old rows,
// never their totals. Rows from before v2 are kept as `v: 1`: their figures
// stand, as there are no inputs to re-score them from.
//
// Only the service worker writes, through one queue, so tabs can't clobber
// each other's sends. Pages read.
'use strict';

(function (root) {
  const Core = root.EcoPromptCore;

  const AGG_KEY = 'agg:daily';
  const DAY_PREFIX = 'h:';
  const SALT_KEY = 'hist:salt';
  const LEGACY_KEY = 'eco_history';
  const LEGACY_DONE_KEY = 'hist:legacyMigrated';
  const GRADES = ['A', 'B', 'C', 'D', 'E'];

  const pad = (n) => String(n).padStart(2, '0');
  const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const isCount = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  // Hosts, model ids, effort and task names: short tokens, never free text.
  const isToken = (x) => typeof x === 'string' && x.length > 0 && x.length <= 80 && /^[\w.:-]+$/.test(x);

  /** The local calendar date of ts, as 'YYYY-MM-DD'. */
  function dateOf(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const dayKey = (date) => DAY_PREFIX + date;

  /** What an impact adds to a day: the fields aggregateImpacts reads. */
  function figuresOf(impact) {
    const figures = {
      energyWh: impact.energy.wh,
      waterMl: impact.water.ml,
      carbonG: impact.carbon.gCO2e,
      grade: impact.grade.grade
    };
    const range = impact.energy.range;
    if (range) {
      figures.lowWh = range.lowWh;
      figures.highWh = range.highWh;
    }
    return figures;
  }

  /**
   * The estimateImpact request for a send's inputs. The content script
   * prices a send with it and re-scoring prices the stored row with it, so
   * the same catalog gives the same number.
   */
  function requestFor(inputs) {
    const task = Core.TASK_TYPES && Core.TASK_TYPES[inputs.taskType];
    const flags = inputs.flags || {};
    return Core.impactRequest({
      modelId: inputs.modelId,
      inTokens: inputs.inTokens,
      outTokens: isCount(inputs.outTokensObs) ? inputs.outTokensObs : inputs.outTokensEst,
      taskMultiplier: task ? task.energyMultiplier : 1,
      effort: inputs.effort,
      thinkingOn: !!flags.thinkingOn,
      multiAgent: !!flags.multiAgent,
      region: inputs.region,
      embodied: inputs.embodied
    });
  }

  /** A v2 row from a send's inputs and its impact. */
  function makeEntry(inputs, impact) {
    return sanitize({
      v: 2,
      ts: inputs.ts,
      host: inputs.host,
      modelId: inputs.modelId,
      modelSource: inputs.modelSource || null,
      effort: inputs.effort || null,
      taskType: inputs.taskType || 'GENERAL',
      inTokens: inputs.inTokens,
      outTokensEst: inputs.outTokensEst,
      // Read off the reply once Step 18's response observer lands.
      outTokensObs: null,
      // Set by the writer from the page's address, which is never stored.
      convKey: null,
      flags: inputs.flags || {},
      region: inputs.region || 'default',
      embodied: inputs.embodied !== false,
      ...figuresOf(impact)
    });
  }

  /**
   * A row with exactly the known fields, or null when it isn't one. Whatever
   * a sender adds beyond them, text included, is dropped here.
   */
  function sanitize(e) {
    if (!isObject(e) || e.v !== 2) return null;
    const ok = Number.isFinite(e.ts) && e.ts > 0 &&
      isToken(e.host) && isToken(e.modelId) &&
      isCount(e.inTokens) && isCount(e.outTokensEst) &&
      isCount(e.energyWh) && isCount(e.waterMl) && isCount(e.carbonG) &&
      GRADES.includes(e.grade);
    if (!ok) return null;
    const row = {
      v: 2,
      ts: e.ts,
      host: e.host,
      modelId: e.modelId,
      modelSource: isToken(e.modelSource) ? e.modelSource : null,
      effort: isToken(e.effort) ? e.effort : null,
      taskType: isToken(e.taskType) ? e.taskType : 'GENERAL',
      inTokens: e.inTokens,
      outTokensEst: e.outTokensEst,
      outTokensObs: isCount(e.outTokensObs) ? e.outTokensObs : null,
      convKey: typeof e.convKey === 'string' && /^[0-9a-f]{16}$/.test(e.convKey) ? e.convKey : null,
      flags: {
        multiAgent: !!(isObject(e.flags) && e.flags.multiAgent),
        thinkingOn: !!(isObject(e.flags) && e.flags.thinkingOn)
      },
      region: isToken(e.region) ? e.region : 'default',
      embodied: e.embodied !== false,
      energyWh: e.energyWh,
      waterMl: e.waterMl,
      carbonG: e.carbonG,
      grade: e.grade
    };
    if (isCount(e.lowWh)) {
      row.lowWh = e.lowWh;
      row.highWh = isCount(e.highWh) && e.highWh >= e.lowWh ? e.highWh : null;
    }
    return row;
  }

  /** A pre-v2 record as a v1 row: its figures only, or null. */
  function legacyRow(e) {
    if (!isObject(e) || !Number.isFinite(e.ts) || e.ts <= 0) return null;
    const row = {
      v: 1,
      ts: e.ts,
      host: isToken(e.host) ? e.host : null,
      modelId: isToken(e.modelId) ? e.modelId : null,
      energyWh: isCount(e.energyWh) ? e.energyWh : 0,
      waterMl: isCount(e.waterMl) ? e.waterMl : 0,
      carbonG: isCount(e.carbonG) ? e.carbonG : 0,
      grade: GRADES.includes(e.grade) ? e.grade : null
    };
    if (isCount(e.lowWh)) {
      row.lowWh = e.lowWh;
      row.highWh = isCount(e.highWh) && e.highWh >= e.lowWh ? e.highWh : null;
    }
    return row;
  }

  /** A v2 row's figures re-estimated with this engine; null for a v1 row or an unknown model. */
  function rescoreRow(row, engine) {
    if (!row || row.v !== 2) return null;
    const impact = engine.estimateImpact(requestFor(row));
    return impact ? figuresOf(impact) : null;
  }

  /** The conversation part of a page address: origin and path, no query or fragment. */
  function conversationUrl(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch (err) {
      return null;
    }
  }

  /** A promise-shaped store over a chrome.storage area. */
  function chromeStore(area) {
    return {
      get: (keys) => area.get(keys),
      set: (items) => area.set(items),
      remove: (keys) => area.remove(keys)
    };
  }

  /**
   * The single writer. Every change goes through one queue, in arrival
   * order, so each job reads what the one before it wrote.
   */
  function createWriter(store) {
    let chain = Promise.resolve();
    const queue = (job) => {
      const run = chain.then(job);
      chain = run.catch(() => {}); // a failed job doesn't stop the next
      return run;
    };

    let salt = null;
    async function conversationKey(url) {
      const conv = conversationUrl(url);
      if (!conv) return null;
      if (!salt) {
        const got = await store.get([SALT_KEY]);
        salt = typeof got[SALT_KEY] === 'string' ? got[SALT_KEY] : null;
        if (!salt) {
          const bytes = new Uint8Array(16);
          root.crypto.getRandomValues(bytes);
          salt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
          await store.set({ [SALT_KEY]: salt });
        }
      }
      const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${conv}`));
      return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function allDayKeys() {
      const everything = await store.get(null);
      return Object.keys(everything).filter((k) => k.startsWith(DAY_PREFIX));
    }

    return {
      /** Append one send. `pageUrl` becomes the convKey hash and is not kept. */
      record(entry, pageUrl) {
        const row = sanitize(entry);
        if (!row) return Promise.reject(new Error('not a history entry'));
        return queue(async () => {
          if (pageUrl) row.convKey = await conversationKey(pageUrl);
          const date = dateOf(row.ts);
          const got = await store.get([dayKey(date), AGG_KEY]);
          const rows = Array.isArray(got[dayKey(date)]) ? got[dayKey(date)] : [];
          rows.push(row);
          const agg = isObject(got[AGG_KEY]) ? got[AGG_KEY] : {};
          agg[date] = Core.aggregateImpacts([agg[date], row]);
          await store.set({ [dayKey(date)]: rows, [AGG_KEY]: agg });
          return row;
        });
      },

      /**
       * Move the pre-v2 'eco_history' array into day keys as v1 rows, once.
       * The marker is written with the rows, so a crash before the old key
       * is removed can't add them twice.
       */
      migrateLegacy() {
        return queue(async () => {
          const got = await store.get([LEGACY_KEY, LEGACY_DONE_KEY]);
          if (!(LEGACY_KEY in got)) return 0;
          if (got[LEGACY_DONE_KEY]) {
            await store.remove([LEGACY_KEY]);
            return 0;
          }
          const byDate = {};
          for (const e of Array.isArray(got[LEGACY_KEY]) ? got[LEGACY_KEY] : []) {
            const row = legacyRow(e);
            if (row) (byDate[dateOf(row.ts)] = byDate[dateOf(row.ts)] || []).push(row);
          }
          const dates = Object.keys(byDate);
          const current = await store.get([...dates.map(dayKey), AGG_KEY]);
          const agg = isObject(current[AGG_KEY]) ? current[AGG_KEY] : {};
          const out = { [LEGACY_DONE_KEY]: true };
          let moved = 0;
          for (const date of dates) {
            const rows = [...byDate[date], ...(Array.isArray(current[dayKey(date)]) ? current[dayKey(date)] : [])]
              .sort((a, b) => a.ts - b.ts);
            moved += byDate[date].length;
            out[dayKey(date)] = rows;
            agg[date] = Core.aggregateImpacts(rows);
          }
          out[AGG_KEY] = agg;
          await store.set(out);
          await store.remove([LEGACY_KEY]);
          return moved;
        });
      },

      /**
       * Re-estimate every v2 row from its inputs with this engine's catalog,
       * and rebuild each day's totals. v1 rows keep their figures; a day
       * whose rows retention dropped keeps its totals.
       */
      rescore(engine) {
        return queue(async () => {
          const everything = await store.get(null);
          const agg = isObject(everything[AGG_KEY]) ? everything[AGG_KEY] : {};
          const out = {};
          let rescored = 0;
          let kept = 0;
          for (const [key, rows] of Object.entries(everything)) {
            if (!key.startsWith(DAY_PREFIX) || !Array.isArray(rows)) continue;
            const next = rows.map((row) => {
              const figures = rescoreRow(row, engine);
              if (!figures) {
                kept += 1;
                return row;
              }
              rescored += 1;
              const { lowWh, highWh, ...rest } = row; // the new figures say whether there is a range
              return { ...rest, ...figures };
            });
            out[key] = next;
            agg[key.slice(DAY_PREFIX.length)] = Core.aggregateImpacts(next);
          }
          out[AGG_KEY] = agg;
          await store.set(out);
          const daysWithoutRows = Object.keys(agg).filter((d) => !(dayKey(d) in everything)).length;
          return { rescored, kept, daysWithoutRows };
        });
      },

      /** Drop the rows of days before the last `days` (totals stay). 0 keeps everything. */
      prune(days, now = Date.now()) {
        if (!(days > 0)) return Promise.resolve(0);
        return queue(async () => {
          const d = new Date(now);
          const cutoff = dayKey(dateOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - days + 1).getTime()));
          const old = (await allDayKeys()).filter((k) => k < cutoff);
          if (old.length) await store.remove(old);
          return old.length;
        });
      },

      /** Remove every row and total. */
      clear() {
        return queue(async () => {
          await store.remove([...(await allDayKeys()), AGG_KEY]);
        });
      }
    };
  }

  /** Totals for the dates from..to ('YYYY-MM-DD', inclusive) of an agg:daily object. */
  function totalsBetween(agg, from, to) {
    const days = isObject(agg) ? Object.keys(agg).filter((d) => d >= from && d <= to).map((d) => agg[d]) : [];
    return Core.aggregateImpacts(days);
  }

  /** Every stored row, oldest first: for export, not for the dashboard. */
  async function allRows(store) {
    const everything = await store.get(null);
    const rows = [];
    for (const [key, value] of Object.entries(everything)) {
      if (key.startsWith(DAY_PREFIX) && Array.isArray(value)) rows.push(...value);
    }
    return rows.sort((a, b) => a.ts - b.ts);
  }

  root.EcoPromptHistory = Object.freeze({
    AGG_KEY,
    DAY_PREFIX,
    LEGACY_KEY,
    dateOf,
    dayKey,
    figuresOf,
    requestFor,
    makeEntry,
    sanitize,
    rescoreRow,
    conversationUrl,
    chromeStore,
    createWriter,
    totalsBetween,
    allRows
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
