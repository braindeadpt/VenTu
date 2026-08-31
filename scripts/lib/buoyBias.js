/**
 * Skill/bias layer — Open-Meteo (ERA5) vs IH Datawell Waverider buoys.
 *
 * Goal (ROADMAP C4b): measure how much the wave model errs against measured
 * buoy data and correct the per-region bias of the forecast, instead of
 * trusting the model blindly.
 *
 * Honest caveat (also recorded in wave-bias.json):
 * - The Open-Meteo Historical Marine API serves ERA5 reanalysis. `past_days`
 *   on the forecast endpoint returns the same ERA5 backfill, so true forecast
 *   skill (model run vs later truth) is NOT available from Open-Meteo today.
 * - We therefore measure MODEL bias (ERA5 vs buoy). The correction is applied
 *   to the best_match forecast as a first calibration step, gated behind
 *   VENTU_WAVE_BIAS_CORRECTION=1 and only when the sample is stable (N>=30)
 *   and the bias is material (|ME|>=0.15 m). Validate against the observed
 *   wave card before turning it on in production.
 */

const fs = require('fs');
const path = require('path');

const HISTORICAL_MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';

/** Minimum paired samples per buoy/region before the bias is usable (C4b: N≥30). */
const MIN_BIAS_N = 30;
/** Minimum |ME| (m) to bother correcting — below this it is model noise. */
const MIN_BIAS_M = 0.15;
/** Sanity cap: never apply a bigger correction than this (m). */
const MAX_BIAS_M = 1.5;
/** IH getDatawellData serves at most 15 days — keep margin. */
const BIAS_WINDOW_DAYS = 13;

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Parse spots from src/lib/spots.ts including `region` (needed for the
 * per-region bias table). Mirrors parseSpotsFromFile in fetch-ih-buoys.js.
 * @returns {Array<{ id: string, lat: number, lon: number, region?: string }>}
 */
function parseSpotsWithRegions() {
  const spotsPath = path.join(__dirname, '../../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');
  const spots = [];
  // Bloco por spot (region vem antes de lat/lon no ficheiro — regex de bloco).
  const blockRegex = /id:\s*['"]([^'"]+)['"]([\s\S]*?)\n\s*\},/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const body = match[2];
    const lat = body.match(/lat:\s*([0-9.\-]+)/);
    const lon = body.match(/lon:\s*([0-9.\-]+)/);
    const region = body.match(/region:\s*['"]([^'"]+)['"]/);
    if (!lat || !lon || !region) continue;
    spots.push({
      id: match[1],
      lat: parseFloat(lat[1]),
      lon: parseFloat(lon[1]),
      region: region[1],
    });
  }
  const seen = new Set();
  return spots.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

/**
 * Fetch the ERA5 hourly wave height series for a point and UTC date window.
 * @param {number} lat
 * @param {number} lon
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate YYYY-MM-DD
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Array<{ time: string, waveHeight: number }>>}
 */
async function fetchHistoricalWaveSeries(lat, lon, startDate, endDate, fetchImpl = fetch) {
  const url = `${HISTORICAL_MARINE_API}?${new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'wave_height',
    start_date: startDate,
    end_date: endDate,
    timezone: 'UTC',
  })}`;
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const time = data?.hourly?.time;
  const values = data?.hourly?.wave_height;
  if (!Array.isArray(time) || !Array.isArray(values)) return [];
  return time
    .map((t, i) => ({ time: String(t), waveHeight: Number(values[i]) }))
    .filter((r) => Number.isFinite(r.waveHeight) && r.waveHeight >= 0);
}

/**
 * Align buoy observations with the model series on the same UTC hour.
 * @param {Array<{ date: string, hm0: number }>} obsRows parsed IH rows
 * @param {Array<{ time: string, waveHeight: number }>} modelSeries ERA5 hourly
 * @returns {Array<{ time: string, observed: number, model: number }>}
 */
function alignPairs(obsRows, modelSeries) {
  const byHour = new Map();
  for (const r of modelSeries) byHour.set(r.time.slice(0, 13) + ':00', r.waveHeight);
  const pairs = [];
  for (const o of obsRows) {
    const hour = o.date.slice(0, 13) + ':00';
    const model = byHour.get(hour);
    if (model == null) continue;
    pairs.push({ time: hour, observed: o.hm0, model });
  }
  return pairs;
}

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - mx;
    const y = ys[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? null : num / denom;
}

/**
 * Bias/skill metrics over aligned pairs. ME = mean(observed - model), so a
 * positive ME means the model UNDERESTIMATES the wave height.
 * @param {Array<{ observed: number, model: number }>} pairs
 * @returns {{ n: number, me: number, mae: number, rmse: number, corr: number | null } | null}
 */
function computeBias(pairs) {
  if (!pairs || pairs.length === 0) return null;
  const n = pairs.length;
  const errs = pairs.map((p) => p.observed - p.model);
  const me = errs.reduce((a, b) => a + b, 0) / n;
  const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / n;
  const rmse = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / n);
  let corr = null;
  if (n >= 3) {
    corr = pearson(
      pairs.map((p) => p.observed),
      pairs.map((p) => p.model),
    );
  }
  return {
    n,
    me: round1(me),
    mae: round1(mae),
    rmse: round1(rmse),
    corr: corr == null ? null : round2(corr),
  };
}

/**
 * Pool per-buoy pairs by spot region (each spot inherits the bias of the buoy
 * it maps to, via the existing spot→buoy mapping).
 * @param {Array<{ id: string, region?: string }>} spots
 * @param {Record<string, { idEst: number, distanceKm: number }>} spotMapping spot.id → buoy
 * @param {Record<number, Array<{ observed: number, model: number }>>} pairsByBuoy idEst → pairs
 * @returns {Record<string, { n: number, me: number, mae: number, rmse: number, corr: number | null, buoys: number[] }>}
 */
function aggregateRegions(spots, spotMapping, pairsByBuoy) {
  const regionBuoys = {};
  for (const spot of spots) {
    const mapped = spotMapping?.[spot.id];
    if (!mapped || !spot.region || !pairsByBuoy?.[mapped.idEst]?.length) continue;
    (regionBuoys[spot.region] ??= new Set()).add(mapped.idEst);
  }
  const regions = {};
  for (const [region, buoyIds] of Object.entries(regionBuoys)) {
    const pairs = [];
    for (const id of buoyIds) pairs.push(...pairsByBuoy[id]);
    const stats = computeBias(pairs);
    if (stats) regions[region] = { ...stats, buoys: [...buoyIds] };
  }
  return regions;
}

/**
 * Apply the regional bias to the current conditions (mutates `current`).
 * Guarded: only when enabled, sample stable (N≥30) and bias material (|ME| in
 * [MIN_BIAS_M, MAX_BIAS_M]). Records the original value as waveHeightRaw and
 * returns the waveBias metadata (or null when nothing was corrected).
 * @param {{ waveHeight: number }} current spot conditions
 * @param {string | undefined} region spot region
 * @param {{ regions?: Record<string, { n: number, me: number }> } | null} waveBias wave-bias.json
 * @param {boolean} enabled VENTU_WAVE_BIAS_CORRECTION=1
 * @returns {null | { region: string, me: number, n: number, deltaM: number }}
 */
function applyWaveBias(current, region, waveBias, enabled) {
  if (!enabled || !waveBias?.regions || !region) return null;
  const bias = waveBias.regions[region];
  if (!bias || !Number.isFinite(bias.me) || bias.n < MIN_BIAS_N) return null;
  const meAbs = Math.abs(bias.me);
  if (meAbs < MIN_BIAS_M || meAbs > MAX_BIAS_M) return null;

  const raw = current.waveHeight;
  const corrected = Math.max(0.1, Math.round((raw + bias.me) * 10) / 10);
  const deltaM = Math.round((corrected - raw) * 10) / 10;
  if (Math.abs(deltaM) < 0.05) return null;

  current.waveHeightRaw = raw;
  current.waveHeight = corrected;
  return { region, me: bias.me, n: bias.n, deltaM };
}

module.exports = {
  HISTORICAL_MARINE_API,
  MIN_BIAS_N,
  MIN_BIAS_M,
  MAX_BIAS_M,
  BIAS_WINDOW_DAYS,
  parseSpotsWithRegions,
  fetchHistoricalWaveSeries,
  alignPairs,
  computeBias,
  aggregateRegions,
  applyWaveBias,
};
