/**
 * Daily coherence verdict archive — ES×PT pair verdicts, one per day, kept
 * long enough to spot SEASONAL divergence patterns.
 *
 * Distinct from buoy-coherence-archive.json (which is the HOURLY pair store,
 * pruned to ARCHIVE_WINDOW_DAYS = 30 to give the accumulated verdict enough n
 * for one report). The daily archive is the verdict *history*: each run groups
 * the archived hourly pairs by UTC day, derives a per-day verdict per pair and
 * merges it (dedupe by day) into buoy-coherence-daily.json, which is pruned to
 * a LONG window. That way a divergence that only happens in, say, winter storm
 * season keeps a record even after the hourly pairs that produced it age out
 * of the rolling window — the seasonal signal survives.
 *
 * Shape of an archived day entry:
 *   { day: '2026-08-14',
 *     pairs: [{ codes: ['6200084','6201077'], pair: 'Cabo Silleiro × Porto',
 *               verdict: 'coherent', n: 4,
 *               meanAbsDeltaM: 0.4, meanDeltaM: 0.1 }] }
 *
 * `trend` is an aggregated rollup per pair (verdict counts + incoherent ratio)
 * so operators/About can see at a glance whether a pair has been locking over
 * weeks vs drifting apart.
 */

const fs = require('fs');
const path = require('path');
const { pairStats, verdictFor } = require('./buoyCoherence.js');

const DEFAULT_OUTPUT_PATH = path.join(__dirname, '../../public/data/buoy-coherence-daily.json');

/** Daily verdicts are kept for a season+ — much longer than the hourly window. */
const DAILY_WINDOW_DAYS = 180;
/** Min overlapping hours for a DAILY verdict (a single hour proves nothing). */
const MIN_DAILY_PAIRS = 3;

function emptyDailyArchive() {
  return { fetchedAt: null, windowDays: DAILY_WINDOW_DAYS, days: [] };
}

/** Read the daily archive (missing/corrupt → empty). */
function readDailyArchive(outputPath = DEFAULT_OUTPUT_PATH) {
  try {
    if (fs.existsSync(outputPath)) {
      const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      return {
        ...emptyDailyArchive(),
        ...raw,
        days: Array.isArray(raw.days) ? raw.days : [],
      };
    }
  } catch {
    /* corrupt — start fresh */
  }
  return emptyDailyArchive();
}

/** Write the daily archive atomically. */
function writeDailyArchive(archive, outputPath = DEFAULT_OUTPUT_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(archive, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, outputPath);
}

/**
 * Group the HOURLY archive rows by UTC day + pair and derive a per-day,
 * per-pair verdict (with its own min n). Returns a list of { day, pairs } —
 * one entry per day that has enough data to group, regardless of the verdict.
 * @param {object} archive hourly archive ({ pairs: Array<{ codes, hour, esHs, ptHs }> })
 * @param {{ minPairs?: number, okM?: number, badM?: number }} [opts]
 * @returns {Array<{ day: string, pairs: Array<{ codes: Array<string>, pair: string, verdict: string, n: number, meanAbsDeltaM: number, meanDeltaM: number }> }>}
 */
function deriveDailyVerdicts(archive, opts = {}) {
  const { minPairs = MIN_DAILY_PAIRS } = opts;
  // Aplica o floor DIÁRIO ao veredicto por dia (não o MIN_ACCUMULATED_PAIRS
  // da janela — um único dia raramente tem 10h sobrepostas).
  const verdictOpts = { ...opts, minPairs };
  const rowsByDayPair = new Map(); // `${day}|${codesKey}` -> Array<{a,b}>
  const metaByKey = new Map(); // `${day}|${codesKey}` -> { codes, pair }
  for (const p of archive?.pairs ?? []) {
    if (!p?.hour || !Array.isArray(p?.codes)) continue;
    const day = String(p.hour).slice(0, 10);
    const dayKey = `${day}|${p.codes.join('|')}`;
    if (!rowsByDayPair.has(dayKey)) {
      rowsByDayPair.set(dayKey, []);
      metaByKey.set(dayKey, {
        codes: p.codes,
        pair: typeof p.pair === 'string' && p.pair ? p.pair : p.codes.join(' × '),
      });
    }
    rowsByDayPair
      .get(dayKey)
      .push({ a: Number(p.esHs), b: Number(p.ptHs) });
  }

  const byDay = new Map(); // day -> Array<pair summary>
  for (const [dayKey, rows] of rowsByDayPair) {
    const sep = dayKey.indexOf('|');
    const day = dayKey.slice(0, sep);
    const stats = pairStats(rows);
    const summary = {
      ...metaByKey.get(dayKey),
      verdict: verdictFor(stats, verdictOpts),
      n: stats?.n ?? 0,
      meanAbsDeltaM: stats?.meanAbsDeltaM ?? null,
      meanDeltaM: stats?.meanDeltaM ?? null,
    };
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(summary);
  }

  return [...byDay.entries()]
    .map(([day, pairs]) => ({ day, pairs }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Merge newly derived daily verdicts into the daily archive — dedup by day
 * (the latest verdict for that day, derived from the most complete hourly
 * window, replaces the previous). Pairs within a day are keyed by codes.
 * @param {object} archive daily archive ({ days: Array<{ day, pairs }> })
 * @param {Array<{ day: string, pairs: Array<object> }>} newDays
 * @returns {number} days added/updated
 */
function mergeDailyVerdicts(archive, newDays) {
  if (!Array.isArray(newDays) || newDays.length === 0) return 0;
  const seen = new Map(); // day -> Map(codesKey -> pair)
  for (const d of archive.days ?? []) {
    if (!d?.day) continue;
    const byCodes = seen.get(d.day) ?? new Map();
    for (const p of d.pairs ?? []) {
      if (Array.isArray(p?.codes)) byCodes.set(p.codes.join('|'), p);
    }
    seen.set(d.day, byCodes);
  }
  let touched = 0;
  let latest = null;
  for (const d of newDays) {
    if (!d?.day) continue;
    const byCodes = seen.get(d.day) ?? new Map();
    for (const p of d.pairs ?? []) {
      if (!Array.isArray(p?.codes)) continue;
      const k = p.codes.join('|');
      byCodes.set(k, p);
      touched += 1;
    }
    seen.set(d.day, byCodes);
    if (!latest || d.day > latest) latest = d.day;
  }
  archive.days = [...seen.entries()]
    .map(([day, byCodes]) => ({ day, pairs: [...byCodes.values()] }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return touched;
}

/** Drop days outside the (long) daily window — by the day key. */
function pruneDailyArchive(archive, nowMs = Date.now(), windowDays = DAILY_WINDOW_DAYS) {
  const cutoff = nowMs - windowDays * 86_400_000;
  const cutoffDay = new Date(cutoff).toISOString().slice(0, 10);
  archive.days = archive.days.filter((d) => d.day >= cutoffDay);
}

/**
 * Aggregated rollup per pair over the daily window: verdict counts, total
 * days and the incoherent+review ratio (how often the pair drifts apart).
 * Keyed by codes.join('|').
 * @param {object} archive daily archive
 * @returns {Record<string, { pair: string, coherent: number, review: number, incoherent: number, insufficient: number, days: number, incoherentRatio: number }>}
 */
function buildDailyTrend(archive) {
  const trend = {};
  for (const d of archive.days ?? []) {
    for (const p of d.pairs ?? []) {
      if (!Array.isArray(p?.codes)) continue;
      const k = p.codes.join('|');
      const t = trend[k] ?? {
        pair: p.pair ?? k,
        coherent: 0,
        review: 0,
        incoherent: 0,
        insufficient: 0,
        days: 0,
        incoherentRatio: 0,
      };
      const v = p.verdict;
      if (v === 'coherent') t.coherent += 1;
      else if (v === 'review') t.review += 1;
      else if (v === 'incoherent') t.incoherent += 1;
      else t.insufficient += 1;
      t.days += 1;
      trend[k] = t;
    }
  }
  for (const t of Object.values(trend)) {
    const nonInsufficient = t.coherent + t.review + t.incoherent;
    t.incoherentRatio =
      nonInsufficient > 0 ? Math.round((t.incoherent / nonInsufficient) * 1000) / 1000 : 0;
  }
  return trend;
}

/**
 * Resolve the IH (Datawell) station whose wmo_id matches a PT WMO code — the
 * crosswalk that turns an ES×IH coherence pair into existence. Pure: input is
 * the IH station list keyed by idEst (as fetchBuoyStations returns), output is
 * the matching station or null.
 *
 * Example crosswalk (IH catalog → wmo_id): CSA92/D→6201077 (Porto/Leixões),
 * CSA82/D→6201079 (Faro) — exactly the PT codes used in the ES×PT pairs.
 * @param {Record<string, { wmoId?: number, idEst: number }>} stations keyed by idEst
 * @param {string | number} wmoCode PT WMO platform code (e.g. '6201077')
 * @returns {object | null} the IH station whose wmo_id === wmoCode
 */
function resolveIhStationForWmo(stations, wmoCode) {
  if (!stations || wmoCode == null) return null;
  const want = String(wmoCode);
  for (const st of Object.values(stations)) {
    if (st?.wmoId != null && String(st.wmoId) === want) return st;
  }
  return null;
}

/**
 * Map IH wave-series rows ({ date, hm0, ... }) into the coherence archive's
 * row shape ({ date, hs, lat, lon }), with hs = hm0 (altura significativa).
 * Drops rows without a finite hm0 or a parseable date. Pure.
 * @param {Array<{ date: string, hm0: number }>} rows IH series (newest last)
 * @param {{ lat: number, lon: number }} station the IH station (for distance)
 * @returns {Array<{ date: string, hs: number, lat: number, lon: number }>}
 */
function toIhCoherenceRows(rows, station) {
  if (!Array.isArray(rows) || !station) return [];
  const out = [];
  for (const r of rows) {
    const hm0 = Number(r?.hm0);
    // Rejeita sem hm0 finito OU negativo (altura física) — espelha o parse IH.
    if (!Number.isFinite(hm0) || hm0 < 0) continue;
    const t = new Date(r.date).getTime();
    if (!Number.isFinite(t)) continue;
    out.push({ date: new Date(t).toISOString(), hs: hm0, lat: station.lat, lon: station.lon });
  }
  return out;
}

/**
 * Build the ES×IH config entry a check-buoy-coherence run would feed the
 * archive, given the ES series + an IH station + its wave rows. Returns the
 * `{ a, b, ptSource: 'ih' }` fragment used by the merge/report loops, or null
 * when either side is missing. Pure and unit-testable (no network).
 * @param {object} esSeries series for the ES buoy ({ code, name, lat, lon, rows })
 * @param {object} station IH station ({ idEst, name, lat, lon })
 * @param {Array<{ date: string, hm0: number }>} ihRows IH wave series
 * @returns {object | null} config fragment, or null when unusable
 */
function buildIhCoherencePair(esSeries, station, ihRows) {
  if (!esSeries?.rows?.length || !station) return null;
  const rows = toIhCoherenceRows(ihRows, station);
  if (rows.length === 0) return null;
  return {
    a: {
      code: esSeries.code,
      name: esSeries.name ?? esSeries.code,
      lat: esSeries.lat,
      lon: esSeries.lon,
      rows: esSeries.rows,
    },
    b: {
      code: String(station.idEst),
      name: station.name ?? `IH ${station.idEst}`,
      lat: station.lat,
      lon: station.lon,
      rows,
    },
    ptSource: 'ih',
  };
}

/**
 * Count CONSECUTIVE trailing 'incoherent' days for a given ES×PT pair over
 * the daily archive (most recent first). When the pair has been incoherent for
 * N+ consecutive days, the national (IH) reading attached to spots that this
 * pair serves is also suspect — a persistent cross-border split suggests the
 * regional wave field is being read differently, not just today's ES route.
 * The merge uses this to attach a coherence warning (lowered confidence) to
 * the IH observedWave, instead of only gating the Spanish buoy.
 *
 * @param {object} daily daily archive ({ days: Array<{ day: string, pairs: Array<{ codes: Array<string>, verdict: string }> }> })
 * @param {Array<string>} codes e.g. ['6200084', '6201077']
 * @returns {{ days: number, firstDay: string | null, lastDay: string | null }}
 */
function consecutiveIncoherentDays(daily, codes) {
  if (!daily?.days || !Array.isArray(daily.days) || !Array.isArray(codes)) {
    return { days: 0, firstDay: null, lastDay: null };
  }
  const key = codes.map(String).join('|');
  const ordered = [...daily.days].sort((a, b) => b.day.localeCompare(a.day)); // mais recente primeiro
  let count = 0;
  let firstDay = null;
  let lastDay = null;
  for (const d of ordered) {
    const pair = (d.pairs ?? []).find((p) => Array.isArray(p?.codes) && p.codes.map(String).join('|') === key);
    if (!pair) break; // dia sem dados do par — interrompe a sequência
    if (pair.verdict !== 'incoherent') break;
    if (count === 0) lastDay = d.day;
    firstDay = d.day;
    count += 1;
  }
  return { days: count, firstDay, lastDay };
}

module.exports = {
  DAILY_WINDOW_DAYS,
  MIN_DAILY_PAIRS,
  DEFAULT_OUTPUT_PATH,
  emptyDailyArchive,
  readDailyArchive,
  writeDailyArchive,
  deriveDailyVerdicts,
  mergeDailyVerdicts,
  pruneDailyArchive,
  buildDailyTrend,
  resolveIhStationForWmo,
  toIhCoherenceRows,
  buildIhCoherencePair,
  consecutiveIncoherentDays,
};