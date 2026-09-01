/**
 * Real forecast skill — best_match forecast vs IH buoy, archived over runs.
 *
 * The existing wave-bias.json compares ERA5 reanalysis against buoys (a MODEL
 * bias, not forecast skill — the forecast endpoint has no archived runs). This
 * layer instead archives, on every full run:
 *   - the best_match wave_height forecast for future hours (from forecasts.json),
 *     tagged with `runAt` (the instant the forecast was made);
 *   - the IH buoy hm0 observations for those same hours as they arrive.
 *
 * A pair is only formed when the forecast was made BEFORE the target hour
 * (leadTimeHours > 0), so ME/RMSE measure genuine forecast skill with lead,
 * not nowcasting.
 *
 * Time handling: forecasts.json uses Europe/Lisbon wall hours (no offset) and
 * the IH API serves UTC. Both are normalised to the same Lisbon wall hour key
 * (YYYY-MM-DDTHH) — the same convention as src/lib/openMeteoTime.ts — while
 * runAt/observedAt keep real instants for lead-time and pruning maths.
 *
 * The archive lives in public/data/forecast-skill.json (same graceful
 * degradation as wave-bias: no key / failure → keep previous, exit 0).
 */

const fs = require('fs');
const path = require('path');
const { mapSpotsToNearestBuoy } = require('./wmoBiasArchive.js');
const { wmoOriginForWmoCode } = require('./copernicusBuoys.js');

const DEFAULT_OUTPUT_PATH = path.join(__dirname, '../../public/data/forecast-skill.json');

/** Keep the archive trimmed to this many days of pair history. */
const SKILL_WINDOW_DAYS = 30;
/** Min pairs before per-buoy/global stats are reported (avoid noise). */
const MIN_PAIRS = 10;
/** Max forecast lead (h) — farther out is pure noise. */
const MAX_FORECAST_LEAD_HOURS = 168; // 7 days — matches forecast_days.
/** Forecast hours to archive per run (ahead of now) — matches the script. */
const FORECAST_ARCHIVE_HOURS = 48;

const LISBON_TZ = 'Europe/Lisbon';

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/** Format an instant (Date) as a Lisbon wall hour key: YYYY-MM-DDTHH. */
function lisbonHourKeyFromDate(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}`;
}

/**
 * Normalise any ISO string to a Lisbon wall hour key.
 * Handles both UTC ISO (from IH) and offset-less Lisbon local (from
 * forecasts.json — `new Date(iso)` then reformat in Lisbon is a no-op there).
 */
function hourKey(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return lisbonHourKeyFromDate(new Date(t));
}

/**
 * Real UTC instant (ms) for a Lisbon wall hour key. Needed for lead-time maths
 * across DST. Iterative approach: guess UTC, read back Lisbon wall, adjust.
 */
function hourKeyToUtcMs(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key);
  if (!m) return NaN;
  const [, y, mo, d, h] = m;
  const wallKey = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h));
  const read = (ms) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: LISBON_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ms));
    const pick = (type) => parts.find((p) => p.type === type)?.value ?? '00';
    return Date.UTC(Number(pick('year')), Number(pick('month')) - 1, Number(pick('day')), Number(pick('hour')));
  };
  // Iterative: guess UTC, read back the Lisbon wall hour, correct by the gap
  // between the read-back wall time and the target wall key (+1h in WEST).
  // Converges in ≤2 iterations for real hours; never drifts past the offset.
  let guess = wallKey;
  for (let i = 0; i < 3; i++) {
    const err = read(guess) - wallKey;
    if (err === 0) break;
    guess -= err;
  }
  return guess;
}

/**
 * Empty archive shape.
 * @returns {{ fetchedAt: string|null, forecasts: Array, observations: Array, pairs: Array, stats: object|null, byBuoy: object }}
 */
function emptyArchive() {
  return {
    fetchedAt: null,
    forecasts: [],
    observations: [],
    pairs: [],
    stats: null,
    byOrigin: { ih: null, 'wmo-pt': null, 'wmo-es': null },
    byBuoy: {},
    pairCountByOrigin: { ih: 0, 'wmo-pt': 0, 'wmo-es': 0 },
    calibratedPairCount: 0,
  };
}

/** Read the archive from disk (missing/corrupt → empty archive). */
function readArchive(outputPath = DEFAULT_OUTPUT_PATH) {
  try {
    if (fs.existsSync(outputPath)) {
      const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      return {
        ...emptyArchive(),
        ...raw,
        forecasts: Array.isArray(raw.forecasts) ? raw.forecasts : [],
        observations: Array.isArray(raw.observations) ? raw.observations : [],
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
 * Merge a forecast run into the archive (dedupe by Lisbon hour key, keep the
 * EARLIEST runAt — that is the real lead-time forecast, not a nowcast).
 * @param {object} archive
 * @param {Array<{ time: string, hm0: number, runAt: string, buoyId: number, buoyName?: string }>} newForecasts
 */
/** Dedupe key: one forecast slot per buoy per Lisbon hour. */
function forecastKey(f) {
  return `${f.buoyId}|${hourKey(f.time)}`;
}

function archiveForecastRun(archive, newForecasts) {
  const seen = new Map();
  for (const f of archive.forecasts) {
    const key = forecastKey(f);
    const existing = seen.get(key);
    if (!existing || new Date(f.runAt) < new Date(existing.runAt)) {
      seen.set(key, { ...f, hourKey: hourKey(f.time) });
    }
  }
  for (const f of newForecasts) {
    const key = forecastKey(f);
    const existing = seen.get(key);
    if (!existing || new Date(f.runAt) < new Date(existing.runAt)) {
      seen.set(key, { ...f, hourKey: hourKey(f.time) });
    }
  }
  archive.forecasts = [...seen.values()];
}

/**
 * Merge buoy observations (dedupe by hour key, keep the LATEST reading).
 * @param {object} archive
 * @param {Array<{ time: string, hm0: number, buoyId: number, buoyName?: string }>} newObs
 */
/** Dedupe key: one observation slot per buoy per Lisbon hour. */
function observationKey(o) {
  return `${o.buoyId}|${hourKey(o.time)}`;
}

function archiveObservations(archive, newObs) {
  const seen = new Map();
  for (const o of archive.observations) {
    const key = observationKey(o);
    const existing = seen.get(key);
    if (!existing || new Date(o.time) > new Date(existing.time)) {
      seen.set(key, { ...o, hourKey: hourKey(o.time) });
    }
  }
  for (const o of newObs) {
    const key = observationKey(o);
    const existing = seen.get(key);
    if (!existing || new Date(o.time) > new Date(existing.time)) {
      seen.set(key, { ...o, hourKey: hourKey(o.time) });
    }
  }
  archive.observations = [...seen.values()];
}

/**
 * Attach the accumulated per-buoy skill to an observed wave row so the UI can
 * show the bias correction transparently («corrigido pela boia X · ME +0.2 m
 * (n=47)» and the card's «Skill desta boia: ME/MAE/RMSE (n)»). Reads
 * forecast-skill.json byBuoy (keyed by IH idEst or WMO string code). Only the
 * stats that are finite are attached — a byBuoy entry with just me/n still works.
 * @param {object|null} observedWave row from observedWaveForSpot
 * @param {Record<string, { me?: number, n?: number, mae?: number, rmse?: number, corr?: number, meanLeadHours?: number }> | undefined} byBuoy forecast-skill.json byBuoy
 * @param {string | number | undefined} buoyId IH station idEst / WMO code
 * @returns {object|null} observedWave with `skill` attached (or unchanged)
 */
function attachWaveSkill(observedWave, byBuoy, buoyId) {
  if (!observedWave || !byBuoy || buoyId == null) return observedWave;
  const skill = byBuoy[String(buoyId)];
  if (!skill || !Number.isFinite(skill.me) || !Number.isFinite(skill.n)) {
    return observedWave;
  }
  // Origem do skill: do arquivo (byBuoy.origin) ou derivada da fonte da row
  // (ih-buoy → 'ih'; wmo-buoy → 'wmo-es'). Permite à UI destacar quando o
  // ME/n vem de uma boia ES (Copernicus, sem key) e não do IH.
  const origin =
    skill.origin === 'ih' || skill.origin === 'wmo-pt' || skill.origin === 'wmo-es'
      ? skill.origin
      : observedWave?.source === 'wmo-buoy'
        ? 'wmo-es'
        : observedWave?.source === 'wmo-copernicus'
          ? 'wmo-pt'
          : 'ih';
  const out = { ...observedWave, skill: { me: skill.me, n: skill.n, origin } };
  for (const k of ['mae', 'rmse', 'corr', 'meanLeadHours']) {
    if (Number.isFinite(skill[k])) out.skill[k] = skill[k];
  }
  if (typeof skill.buoyName === 'string' && skill.buoyName) out.skill.buoyName = skill.buoyName;
  return out;
}

/**
 * Cross archived forecasts with observations into genuine pairs.
 * A pair exists when both sides cover the same Lisbon hour AND the forecast
 * was made before the target hour (leadTimeHours > 0). Forecasts too far out
 * are dropped. Pairs are deduped by hour key. Each pair carries `origin`
 * ('ih' | 'wmo-es') so stats can be split by platform, not only mixed.
 * Legacy rows without origin are derived from the buoyId type (numeric IH
 * idEst vs string WMO platform code).
 * @param {object} archive
 * @param {{ nowMs?: number }} [opts]
 * @returns {Array<{ hourKey: string, buoyId: number, buoyName?: string, origin: string, forecastHm0: number, observedHm0: number, leadTimeHours: number }>}
 */
function crossPairs(archive, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const obsByKey = new Map();
  for (const o of archive.observations) {
    const key = observationKey(o);
    if (key) obsByKey.set(key, o);
  }

  const pairs = [];
  const seen = new Set();
  for (const f of archive.forecasts) {
    const key = forecastKey(f);
    if (seen.has(key)) continue;
    const obs = obsByKey.get(key);
    if (!obs) continue;
    const targetMs = hourKeyToUtcMs(hourKey(f.time));
    const runMs = new Date(f.runAt).getTime();
    if (!Number.isFinite(targetMs) || !Number.isFinite(runMs)) continue;
    const leadHours = (targetMs - runMs) / 3_600_000;
    if (leadHours <= 0 || leadHours > MAX_FORECAST_LEAD_HOURS) continue;
    if (targetMs > nowMs) continue; // hour still in the future — no truth yet
    if (!Number.isFinite(f.hm0) || !Number.isFinite(obs.hm0)) continue;

    pairs.push({
      hourKey: hourKey(f.time),
      buoyId: obs.buoyId,
      buoyName: f.buoyName ?? obs.buoyName,
      origin:
        f.origin ??
        obs.origin ??
        (typeof obs.buoyId === 'number' ? 'ih' : wmoOriginForWmoCode(String(obs.buoyId))),
      forecastHm0: round2(f.hm0),
      observedHm0: round2(obs.hm0),
      leadTimeHours: round1(leadHours),
    });
    seen.add(key);
  }

  pairs.sort((a, b) => a.hourKey.localeCompare(b.hourKey));
  return pairs;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
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
 * ME/MAE/RMSE/corr over pairs. ME = mean(observed − forecast): positive ME
 * means the forecast UNDERESTIMATES (same sign convention as wave-bias).
 */
function computeSkillStats(pairs) {
  if (!pairs || pairs.length === 0) return null;
  const n = pairs.length;
  const errs = pairs.map((p) => p.observedHm0 - p.forecastHm0);
  const me = errs.reduce((a, b) => a + b, 0) / n;
  const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / n;
  const rmse = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / n);
  const corr = pearson(
    pairs.map((p) => p.observedHm0),
    pairs.map((p) => p.forecastHm0),
  );
  const meanLead = pairs.every((p) => Number.isFinite(p.leadTimeHours))
    ? pairs.reduce((a, p) => a + p.leadTimeHours, 0) / n
    : null;

  return {
    n,
    me: round2(me),
    mae: round2(mae),
    rmse: round2(rmse),
    corr: corr == null ? null : round2(corr),
    meanLeadHours: meanLead == null ? null : round1(meanLead),
  };
}

/**
 * Recompute stats from pairs: global (mixed), per-platform and per-buoy.
 * The mixed total alone hides how each platform behaves — byOrigin splits
 * IH (Datawell, keyed) from WMO-ES (Copernicus, keyless).
 * @returns {{ overall: object|null, byOrigin: object, byBuoy: Record<number, object> }}
 */
function buildStats(pairs) {
  const overall = computeSkillStats(pairs);
  const originOf = (p) => p.origin ?? (typeof p.buoyId === 'number' ? 'ih' : 'wmo-es');
  const byBuoy = {};
  const byBuoyId = new Map();
  for (const p of pairs) {
    if (!byBuoyId.has(p.buoyId)) {
      byBuoyId.set(p.buoyId, {
        buoyId: p.buoyId,
        buoyName: p.buoyName ?? `buoy ${p.buoyId}`,
        origin: originOf(p),
      });
    }
    byBuoyId.get(p.buoyId).pairs = byBuoyId.get(p.buoyId).pairs || [];
    byBuoyId.get(p.buoyId).pairs.push(p);
  }
  for (const entry of byBuoyId.values()) {
    const stats = computeSkillStats(entry.pairs);
    if (stats && stats.n >= MIN_PAIRS) {
      byBuoy[entry.buoyId] = { ...stats, buoyName: entry.buoyName, origin: entry.origin };
    }
  }
  const byOrigin = { ih: null, 'wmo-pt': null, 'wmo-es': null };
  for (const origin of Object.keys(byOrigin)) {
    byOrigin[origin] = computeSkillStats(pairs.filter((p) => originOf(p) === origin));
  }
  return { overall, byOrigin, byBuoy };
}

/**
 * Archive keyless WMO buoy skill into the forecast-skill archive.
 *
 * The Copernicus NRT bucket only keeps `latest/<day>` (no dated history), so
 * fetch-wave-bias.js accumulates the keyless WMO readings in
 * wmo-bias-archive.json run after run. This function ingests those accumulated
 * readings AND archives the best_match forecasts of the spots nearest to each
 * buoy — one forecast slot per buoy per hour, the nearest mapped spot as the
 * location proxy (same convention as the IH path). Two keyless platforms:
 * WMO-ES (Silleiro/Villano/Cádiz/Bilbao/Peñas, cross-border) and WMO-PT
 * (Nazaré Costeira 6200199, nacional — os spots da Costa de Prata/Lisboa).
 * A origem por boia vem de wmoOriginForWmoCode (`'wmo-pt'` para a PT,
 * `'wmo-es'` para as outras).
 *
 * Pair formation reuses crossPairs: the forecast archived today for hour T
 * pairs with the reading for T once it lands in the WMO archive. BuoyId is the
 * WMO platform code (string) — no collision with the numeric IH idEst keys.
 *
 * @param {object} archive forecast-skill archive (mutated like the other archive* helpers)
 * @param {{
 *   forecasts: Record<string, Array<{ time: string, waveHeight: number }>>,
 *   spots: Array<{ id: string, lat: number, lon: number }>,
 *   wmoArchive: { buoys: Record<string, { name?: string, lat?: number, lon?: number, readings?: Array<{ date: string, hm0: number }> }> } | null,
 *   wmoBuoys?: { buoys: Record<string, { name?: string, lat?: number, lon?: number }> } | null,
 *   nowMs: number,
 *   runAt: string,
 *   maxKm?: number,
 *   forecastArchiveHours?: number,
 * }} inputs
 * @returns {{ forecastRows: number, obsRows: number, buoyCodes: Array<string>, mappedSpots: number }}
 */
function archiveWmoSkill(archive, inputs) {
  const {
    forecasts,
    spots,
    wmoArchive,
    wmoBuoys = null,
    nowMs,
    runAt,
    maxKm = 250,
    forecastArchiveHours = FORECAST_ARCHIVE_HOURS,
  } = inputs;
  const buoys =
    wmoArchive && wmoArchive.buoys && typeof wmoArchive.buoys === 'object'
      ? wmoArchive.buoys
      : {};

  // Só participam boias com leituras acumuladas e posição conhecida.
  const live = {};
  for (const [code, e] of Object.entries(buoys)) {
    if (!Array.isArray(e.readings) || e.readings.length === 0) continue;
    const cat = wmoBuoys?.buoys?.[code];
    const lat = Number.isFinite(cat?.lat) ? cat.lat : e.lat;
    const lon = Number.isFinite(cat?.lon) ? cat.lon : e.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    live[code] = { name: cat?.name ?? e.name ?? `WMO ${code}`, lat, lon };
  }
  const buoyCodes = Object.keys(live);
  if (buoyCodes.length === 0) {
    return { forecastRows: 0, obsRows: 0, buoyCodes: [], mappedSpots: 0 };
  }

  const mapping = mapSpotsToNearestBuoy(spots, live, maxKm);
  // Um slot de previsão por boia por hora — o spot mais próximo (proxy igual ao IH).
  const nearestByBuoy = new Map();
  for (const [spotId, m] of Object.entries(mapping)) {
    const cur = nearestByBuoy.get(m.idEst);
    if (!cur || m.distanceKm < cur.distanceKm) {
      nearestByBuoy.set(m.idEst, { spotId, distanceKm: m.distanceKm });
    }
  }

  let forecastRows = 0;
  const newForecasts = [];
  for (const [code, { spotId }] of nearestByBuoy) {
    const series = forecasts[spotId];
    if (!Array.isArray(series)) continue;
    for (const hour of series) {
      const targetMs = new Date(hour.time).getTime();
      if (!Number.isFinite(targetMs)) continue;
      const leadHours = (targetMs - nowMs) / 3_600_000;
      if (leadHours <= 0 || leadHours > forecastArchiveHours) continue;
      const hm0 = Number(hour.waveHeight);
      if (!Number.isFinite(hm0) || hm0 < 0) continue;
      newForecasts.push({
        time: hour.time,
        hm0,
        runAt,
        buoyId: code,
        buoyName: live[code].name,
        origin: wmoOriginForWmoCode(code),
      });
      forecastRows += 1;
    }
  }
  archiveForecastRun(archive, newForecasts);

  let obsRows = 0;
  const newObs = [];
  for (const [code, e] of Object.entries(buoys)) {
    if (!live[code]) continue;
    const origin = wmoOriginForWmoCode(code);
    for (const r of e.readings ?? []) {
      if (!Number.isFinite(r.hm0) || r.hm0 < 0) continue;
      newObs.push({
        time: r.date,
        hm0: r.hm0,
        buoyId: code,
        buoyName: live[code].name,
        origin,
      });
      obsRows += 1;
    }
  }
  archiveObservations(archive, newObs);

  return { forecastRows, obsRows, buoyCodes, mappedSpots: nearestByBuoy.size };
}

/** Trim the archive to SKILL_WINDOW_DAYS (forecasts/obs/pairs outside window). */
function pruneArchive(archive, nowMs = Date.now(), windowDays = SKILL_WINDOW_DAYS) {
  const cutoff = nowMs - windowDays * 86_400_000;
  const inWindow = (iso) => {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= cutoff;
  };
  archive.forecasts = archive.forecasts.filter((f) => inWindow(f.runAt));
  archive.observations = archive.observations.filter((o) => inWindow(o.time));
  archive.pairs = archive.pairs.filter((p) => inWindow(hourKeyToUtcMs(p.hourKey)));
}

function pairOriginOf(p) {
  return (
    p.origin ??
    (typeof p.buoyId === 'number' ? 'ih' : wmoOriginForWmoCode(String(p.buoyId)))
  );
}

/**
 * Build the full public report shape (what the UI/audit reads). Besides the
 * mixed `pairCount`, exposes counters so the dashboard can distinguish the
 * platforms at a glance, even below MIN_PAIRS:
 * - `pairCountByOrigin` — pairs per platform (IH Datawell keyed vs WMO-ES
 *   Copernicus keyless), always present with zeros;
 * - `calibratedPairCount` — pairs whose observed reading comes from a Spanish
 *   buoy (origin 'wmo-es'): these are the readings that, when attached to a PT
 *   spot in the observedWave layer, go through the ES→PT cross-border
 *   calibration to the PT reference. The skill archive itself keeps the raw
 *   hm0 (never the calibrated value) — the counter is about the pipeline
 *   treatment, so the dashboard can tell which pairs feed a calibrated layer.
 */
function buildReport(archive, nowMs = Date.now()) {
  const pairs = crossPairs(archive, { nowMs });
  archive.pairs = pairs;
  const stats = buildStats(pairs);
  archive.stats = stats.overall;
  archive.byOrigin = stats.byOrigin;
  archive.byBuoy = stats.byBuoy;

  const pairCountByOrigin = { ih: 0, 'wmo-pt': 0, 'wmo-es': 0 };
  let calibratedPairCount = 0;
  for (const p of pairs) {
    const origin = pairOriginOf(p);
    if (Object.prototype.hasOwnProperty.call(pairCountByOrigin, origin)) {
      pairCountByOrigin[origin] += 1;
    }
    if (origin === 'wmo-es') calibratedPairCount += 1;
  }
  archive.pairCountByOrigin = pairCountByOrigin;
  archive.calibratedPairCount = calibratedPairCount;

  // As últimas previsões arquivadas, também separadas por origem — a mesma
  // amostra de `lastPairs` mas filtrada por plataforma, para o dashboard poder
  // auditar visualmente como cada plataforma (IH keyed vs WMO-ES keyless)
  // evolui dia a dia, em vez de só ler o total misto.
  const LAST = 10;
  const lastBy = (origin) =>
    pairs.filter((p) => pairOriginOf(p) === origin).slice(-LAST).reverse();
  const lastPairsByOrigin = {
    ih: lastBy('ih'),
    'wmo-pt': lastBy('wmo-pt'),
    'wmo-es': lastBy('wmo-es'),
  };

  return {
    fetchedAt: archive.fetchedAt,
    windowDays: SKILL_WINDOW_DAYS,
    minPairs: MIN_PAIRS,
    pairCount: pairs.length,
    pairCountByOrigin,
    calibratedPairCount,
    stats: stats.overall,
    byOrigin: stats.byOrigin,
    byBuoy: stats.byBuoy,
    lastPairs: pairs.slice(-10).reverse(),
    lastPairsByOrigin,
  };
}

module.exports = {
  SKILL_WINDOW_DAYS,
  MIN_PAIRS,
  MAX_FORECAST_LEAD_HOURS,
  FORECAST_ARCHIVE_HOURS,
  LISBON_TZ,
  lisbonHourKeyFromDate,
  hourKey,
  hourKeyToUtcMs,
  emptyArchive,
  readArchive,
  writeArchive,
  archiveForecastRun,
  archiveObservations,
  archiveWmoSkill,
  attachWaveSkill,
  crossPairs,
  computeSkillStats,
  buildStats,
  pruneArchive,
  buildReport,
  pairOriginOf,
  DEFAULT_OUTPUT_PATH,
};
