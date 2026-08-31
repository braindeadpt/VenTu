/**
 * Wind bias archive — model-vs-observed wind per station, accumulated over runs.
 *
 * The merge-observations step pairs, on every run, the forecast windSpeed (kt)
 * of each spot's row with the fresh observed windSpeedKt (IPMA / Ecowitt /
 * METAR) of the station serving that spot. Pairs accumulate here (dedupe per
 * station+spot+UTC hour, keep the latest reading) so ME/MAE/RMSE/n have enough
 * n to be honest — the same pattern as buoyCoherenceArchive/forecastSkill.
 *
 * The report lives in public/data/wind-bias.json. The merge attaches the
 * station's ME/n to each row (`windBias`) and the UI shows it on the wind
 * badge tooltip when the score uses observed wind (transparency for wind, the
 * same way wave-bias/forecast-skill label the wave correction).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT_PATH = path.join(__dirname, '../../public/data/wind-bias.json');

/** Keep the archive trimmed to this many days of pair history. */
const WIND_WINDOW_DAYS = 30;
/** Min pairs per station before ME/MAE/RMSE are reported (avoid noise). */
const MIN_PAIRS = 10;

/** Knots conversion from m/s (the forecast rows are stored in m/s). */
const MS_TO_KNOTS = 1.94384;

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Station identity key: source + (metarIcao ?? stationName). Two spots served
 * by the same station share the key, so their pairs pool into one bias.
 */
function stationKey(source, stationName, metarIcao) {
  return `${source}|${metarIcao || stationName || 'unknown'}`;
}

/** UTC hour bucket for dedupe (the forecast/observed are both "now" readings). */
function hourKeyOf(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 13);
}

/** Dedupe key: one pair per station+spot+hour. */
function pairKey(p) {
  return `${p.stationKey}|${p.spotId}|${p.hourKey}`;
}

/**
 * Empty archive shape.
 * @returns {{ fetchedAt: string|null, pairs: Array, stations: object, pairCount: number, lastPairs: Array }}
 */
function emptyArchive() {
  return { fetchedAt: null, pairs: [], stations: {}, pairCount: 0, lastPairs: [] };
}

/** Read the archive from disk (missing/corrupt → empty archive). */
function readArchive(outputPath = DEFAULT_OUTPUT_PATH) {
  try {
    if (fs.existsSync(outputPath)) {
      const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      return {
        ...emptyArchive(),
        ...raw,
        pairs: Array.isArray(raw.pairs) ? raw.pairs : [],
      };
    }
  } catch {
    /* corrupt archive — start fresh */
  }
  return emptyArchive();
}

/** Write the archive atomically. */
function writeArchive(archive, outputPath = DEFAULT_OUTPUT_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(archive, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, outputPath);
}

/**
 * Merge new pairs into the archive (dedupe by station+spot+hour, keep the
 * LATEST observedAt — the freshest reading for that hour wins).
 * @param {object} archive
 * @param {Array<{ stationKey: string, spotId: string, hourKey: string|null, observedAt: string, observedKt: number, forecastKt: number, source: string, stationName: string }>} newPairs
 */
function mergePairs(archive, newPairs) {
  const seen = new Map();
  for (const p of archive.pairs) {
    const key = pairKey(p);
    const existing = seen.get(key);
    if (!existing || new Date(p.observedAt) > new Date(existing.observedAt)) {
      seen.set(key, p);
    }
  }
  for (const p of newPairs) {
    if (!p.hourKey) continue;
    const key = pairKey(p);
    const existing = seen.get(key);
    if (!existing || new Date(p.observedAt) > new Date(existing.observedAt)) {
      seen.set(key, p);
    }
  }
  archive.pairs = [...seen.values()];
}

/** Trim pairs outside the window (by observedAt). */
function pruneArchive(archive, nowMs = Date.now(), windowDays = WIND_WINDOW_DAYS) {
  const cutoff = nowMs - windowDays * 86_400_000;
  archive.pairs = archive.pairs.filter((p) => {
    const t = new Date(p.observedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

/**
 * ME/MAE/RMSE/n per station over pairs. ME = mean(observed − forecast) in kt:
 * positive ME means the model UNDERESTIMATES wind at that station (same sign
 * convention as wave-bias). Only stations with n ≥ MIN_PAIRS are reported.
 * @param {Array} pairs
 * @returns {Record<string, { station: string, source: string, n: number, me: number, mae: number, rmse: number, lastUpdated: string|null }>}
 */
function buildStationStats(pairs) {
  const byStation = new Map();
  for (const p of pairs) {
    if (!byStation.has(p.stationKey)) {
      byStation.set(p.stationKey, { pairs: [], source: p.source, station: p.stationName });
    }
    byStation.get(p.stationKey).pairs.push(p);
  }
  const stats = {};
  for (const [key, entry] of byStation) {
    const errs = entry.pairs.map((p) => p.observedKt - p.forecastKt);
    const n = errs.length;
    if (n < MIN_PAIRS) continue;
    const me = errs.reduce((a, b) => a + b, 0) / n;
    const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / n;
    const rmse = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / n);
    let lastUpdated = null;
    for (const p of entry.pairs) {
      if (!lastUpdated || new Date(p.observedAt) > new Date(lastUpdated)) {
        lastUpdated = p.observedAt;
      }
    }
    stats[key] = {
      station: entry.station,
      source: entry.source,
      n,
      me: round1(me),
      mae: round1(mae),
      rmse: round1(rmse),
      lastUpdated,
    };
  }
  return stats;
}

/** Build the full public report shape (what the UI/audit reads). */
function buildReport(archive, nowMs = Date.now()) {
  const stations = buildStationStats(archive.pairs);
  archive.stations = stations;
  archive.pairCount = archive.pairs.length;
  archive.lastPairs = archive.pairs.slice(-10).reverse().map((p) => ({
    stationKey: p.stationKey,
    station: p.stationName,
    spotId: p.spotId,
    hourKey: p.hourKey,
    observedAt: p.observedAt,
    observedKt: p.observedKt,
    forecastKt: p.forecastKt,
  }));
  return {
    fetchedAt: archive.fetchedAt,
    windowDays: WIND_WINDOW_DAYS,
    minPairs: MIN_PAIRS,
    pairCount: archive.pairCount,
    stations: archive.stations,
    lastPairs: archive.lastPairs,
  };
}

module.exports = {
  DEFAULT_OUTPUT_PATH,
  WIND_WINDOW_DAYS,
  MIN_PAIRS,
  MS_TO_KNOTS,
  stationKey,
  hourKeyOf,
  emptyArchive,
  readArchive,
  writeArchive,
  mergePairs,
  pruneArchive,
  buildStationStats,
  buildReport,
};
