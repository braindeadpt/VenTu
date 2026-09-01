/**
 * Real forecast skill — best_match vs IH buoys, accumulated over runs.
 *
 * On each full run this script:
 *   1. Reads forecasts.json (best_match wave_height per spot, Europe/Lisbon
 *      wall hours) and ih-buoys.json (stations + spot→buoy mapping).
 *   2. For every spot mapped to an ACTIVE buoy, archives the forecast hours
 *      ahead of `now` (up to MAX_FORECAST_LEAD_HOURS) with runAt = now.
 *   3. Fetches the buoy's recent hm0 observations (getDatawellData, needs
 *      IH_API_KEY) and archives them.
 *   4. Crosses forecasts with observations on the same Lisbon hour where the
 *      forecast was made BEFORE the target hour → genuine pairs with lead time.
 *   5. Computes ME/MAE/RMSE/corr (global + per buoy) over the accumulated
 *      archive and writes public/data/forecast-skill.json.
 *
 * This is TRUE forecast skill (model run vs later truth), distinct from
 * wave-bias.json which compares ERA5 reanalysis (a model bias).
 *
 * Since the last extension this also ingests the keyless WMO buoys
 * (Copernicus): the accumulated readings from wmo-bias-archive.json (written
 * by fetch-wave-bias.js) become observations, and the best_match forecasts of
 * the spots nearest to each buoy are archived with the WMO code as buoyId.
 * Two keyless platforms: WMO-ES (Silleiro/Villano/Cádiz/Bilbao/Peñas,
 * cross-border) and WMO-PT (Nazaré Costeira 6200199 — os spots da Costa de
 * Prata/Lisboa cruzam o best_match com as leituras WMO nacionais). Pares
 * formam mesmo sem IH_API_KEY.
 *
 * Graceful degradation (like the other IH scripts): without IH_API_KEY we
 * still archive forecasts (they will pair with observations once the key is
 * set); on failure we keep the previous file and exit 0 — never blocks the
 * Open-Meteo pipeline. EXCEPT for a rejected key: a 401/403 from getDatawellData
 * fails ALL the observation fetches at once (never a single-buoy fault), so it
 * is propagated as an IhAuthError and run() fails fast with a Telegram alert
 * (same fail-fast pattern as fetch-ih-buoys.js).
 */

const fs = require('fs');
const path = require('path');
const {
  fetchBuoyStations,
  fetchBuoyWaveSeries,
  mapSpotsToBuoys,
  waveWindow,
  DEFAULT_WAVE_API,
  DEFAULT_IH_API,
  DEFAULT_COLLECTIONS,
  isIhAuthError,
} = require('./lib/ihBuoys.js');
const { notifyIhAuthFailure } = require('./fetch-ih-buoys.js');
const {
  emptyArchive,
  readArchive,
  writeArchive,
  archiveForecastRun,
  archiveObservations,
  archiveWmoSkill,
  buildReport,
  pruneArchive,
  MAX_FORECAST_LEAD_HOURS,
  DEFAULT_OUTPUT_PATH,
} = require('./lib/forecastSkill.js');

const IH_API = process.env.IH_API_URL || DEFAULT_IH_API;
const WAVE_API = process.env.IH_BUOY_WAVE_API_URL || DEFAULT_WAVE_API;
const API_KEY = process.env.IH_API_KEY?.trim() || null;
const COLLECTIONS = (process.env.IH_BUOY_COLLECTIONS || DEFAULT_COLLECTIONS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUTPUT_PATH =
  process.env.FORECAST_SKILL_OUTPUT_PATH || DEFAULT_OUTPUT_PATH;
// Inputs env-overridable (testes hermeticos — mesmo padrão do merge/fetch-wave-bias).
const FORECASTS_PATH =
  process.env.FORECASTS_PATH || path.join(__dirname, '../public/data/forecasts.json');
const IH_BUOYS_PATH =
  process.env.IH_BUOYS_PATH || path.join(__dirname, '../public/data/ih-buoys.json');
const WMO_BIAS_ARCHIVE_PATH =
  process.env.WMO_BIAS_ARCHIVE_PATH || path.join(__dirname, '../public/data/wmo-bias-archive.json');
const WMO_BUOYS_PATH =
  process.env.WMO_BUOYS_PATH || path.join(__dirname, '../public/data/wmo-buoys.json');
/** Hours of buoy observations to fetch each run (matches NRT lag). */
const OBS_WINDOW_HOURS = 48;
/** Forecast hours to archive per run (ahead of now). */
const FORECAST_ARCHIVE_HOURS = 48;

function parseSpotsFromFile() {
  const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');
  const spots = [];
  const spotRegex = /id:\s*['"]([^'"]+)['"][^}]*lat:\s*([0-9.\-]+)[^}]*lon:\s*([0-9.\-]+)/g;
  let match;
  while ((match = spotRegex.exec(content)) !== null) {
    spots.push({ id: match[1], lat: parseFloat(match[2]), lon: parseFloat(match[3]) });
  }
  const seen = new Set();
  return spots.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function readJsonOrNull(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function fetchForecastSkill() {
  console.log('📈 Forecast skill — best_match vs IH buoys (real skill, not ERA5)...\n');

  const forecasts = readJsonOrNull(FORECASTS_PATH);
  if (!forecasts || typeof forecasts !== 'object') {
    console.warn('⚠️ forecasts.json missing — nothing to archive this run (keep previous forecast-skill.json).');
    return null;
  }
  const ihBuoys = readJsonOrNull(IH_BUOYS_PATH);
  if (!ihBuoys?.stations || !ihBuoys?.spotMapping) {
    console.warn('⚠️ ih-buoys.json missing — no buoy mapping to archive forecasts against.');
    return null;
  }

  const now = new Date();
  const nowMs = now.getTime();

  // ── Stations: active buoys (fresh list, no key needed) ──────────────────
  let stations = ihBuoys.stations;
  try {
    const result = await fetchBuoyStations(IH_API, COLLECTIONS);
    stations = result.stations;
  } catch (err) {
    console.warn(`⚠️ Buoy station refresh failed (${err.message}) — using archived stations.`);
  }
  const active = Object.values(stations).filter(
    (s) => s.status !== 'inactive' && s.status !== 'inativa',
  );
  const activeById = new Map(active.map((s) => [String(s.idEst), s]));
  console.log(`📍 ${Object.keys(stations).length} stations, ${active.length} active`);

  const spots = parseSpotsFromFile();
  const spotMapping = ihBuoys.spotMapping;
  const buoyNames = new Map(active.map((s) => [String(s.idEst), s.name]));

  // ── Archive best_match forecasts for mapped spots (ahead of now) ─────────
  // One forecast slot per buoy per hour: use the NEAREST mapped spot so the
  // forecast is the closest available proxy for the buoy location.
  const archive = readArchive(OUTPUT_PATH);
  archive.fetchedAt = now.toISOString();

  const nearestSpotByBuoy = new Map();
  for (const spot of spots) {
    const mapped = spotMapping[spot.id];
    if (!mapped || !activeById.has(String(mapped.idEst))) continue;
    const cur = nearestSpotByBuoy.get(mapped.idEst);
    if (!cur || mapped.distanceKm < cur.distanceKm) {
      nearestSpotByBuoy.set(mapped.idEst, { spotId: spot.id, distanceKm: mapped.distanceKm });
    }
  }

  let forecastRows = 0;
  const newForecasts = [];
  for (const [buoyId, { spotId }] of nearestSpotByBuoy) {
    const series = forecasts[spotId];
    if (!Array.isArray(series)) continue;
    const buoy = activeById.get(String(buoyId));
    for (const hour of series) {
      const targetMs = new Date(hour.time).getTime();
      if (!Number.isFinite(targetMs)) continue;
      const leadHours = (targetMs - nowMs) / 3_600_000;
      if (leadHours <= 0 || leadHours > FORECAST_ARCHIVE_HOURS) continue;
      const hm0 = Number(hour.waveHeight);
      if (!Number.isFinite(hm0) || hm0 < 0) continue;
      newForecasts.push({
        time: hour.time,
        hm0,
        runAt: now.toISOString(),
        buoyId,
        buoyName: buoyNames.get(String(buoyId)) ?? buoy?.name,
        origin: 'ih',
      });
      forecastRows += 1;
    }
  }
  archiveForecastRun(archive, newForecasts);
  console.log(`🗓️  Archived ${forecastRows} best_match forecast hours (${nearestSpotByBuoy.size} buoys, nearest spot each)`);

  // ── Archive buoy observations (needs key) ───────────────────────────────
  let obsRows = 0;
  if (API_KEY) {
    const window = waveWindow(OBS_WINDOW_HOURS);
    const results = await Promise.allSettled(
      active.map((s) =>
        fetchBuoyWaveSeries(API_KEY, s.idEst, WAVE_API, fetch, window).then((rows) => ({ s, rows })),
      ),
    );
    // Key rejeitada (401/403) falha TODAS as boias — nunca uma avaria de uma
    // só. Propagar como erro tipado: o run() falha cedo com alerta (fail-fast).
    for (const r of results) {
      if (r.status === 'rejected' && isIhAuthError(r.reason)) throw r.reason;
    }
    const newObs = [];
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value?.rows?.length) continue;
      for (const row of r.value.rows) {
        if (!Number.isFinite(row.hm0)) continue;
        newObs.push({
          time: row.date,
          hm0: row.hm0,
          buoyId: r.value.s.idEst,
          buoyName: r.value.s.name,
          origin: 'ih',
        });
        obsRows += 1;
      }
    }
    archiveObservations(archive, newObs);
    console.log(`🌊 Archived ${obsRows} buoy observation hours (${active.length} buoys, ${OBS_WINDOW_HOURS}h window)`);
  } else {
    console.log('   ℹ️ IH_API_KEY not set — no new observations this run (forecasts archived; pairs will form when the key is set).');
  }

  // ── ES buoys (Copernicus WMO, keyless) — observações acumuladas ─────────
  // O fetch-wave-bias.js acumula as leituras ES em wmo-bias-archive.json run a
  // run (o bucket público só guarda latest/<dia>). Aqui ingerimos essas
  // leituras como observações e arquivamos o best_match dos spots mais
  // próximos (Silleiro/Villano no NW, Cádiz no sul) — sem key, corre sempre.
  const wmoArchive = readJsonOrNull(WMO_BIAS_ARCHIVE_PATH);
  if (wmoArchive?.buoys && Object.keys(wmoArchive.buoys).length > 0) {
    const wmoBuoys = readJsonOrNull(WMO_BUOYS_PATH);
    const es = archiveWmoSkill(archive, {
      forecasts,
      spots,
      wmoArchive,
      wmoBuoys,
      nowMs,
      runAt: now.toISOString(),
      forecastArchiveHours: FORECAST_ARCHIVE_HOURS,
    });
    if (es.buoyCodes.length > 0) {
      console.log(
        `🇪🇸 Archived ${es.forecastRows} ES forecast hours (${es.mappedSpots} spots → ${es.buoyCodes.length} ES buoys: ${es.buoyCodes.join(', ')}) + ${es.obsRows} ES observation hours (keyless)`,
      );
    } else {
      console.log('   ℹ️ WMO archive has no usable readings yet — ES skill accumulates once fetch-wave-bias.js has readings.');
    }
  } else {
    console.log('   ℹ️ No WMO/ES archive yet — ES skill accumulates once fetch-wave-bias.js writes wmo-bias-archive.json.');
  }

  // ── Cross + stats + persist ─────────────────────────────────────────────
  pruneArchive(archive, nowMs);
  const report = buildReport(archive, nowMs);
  writeArchive({ ...archive, ...report, fetchedAt: now.toISOString() }, OUTPUT_PATH);

  console.log(`\n✅ Forecast skill saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  const byOrigin = report.pairCountByOrigin ?? { ih: 0, 'wmo-pt': 0, 'wmo-es': 0 };
  const calib = report.calibratedPairCount ?? 0;
  console.log(
    `📊 Pairs: ${report.pairCount} (IH ${byOrigin.ih} · WMO-PT ${byOrigin['wmo-pt'] ?? 0} · WMO-ES ${byOrigin['wmo-es'] ?? 0}, ${calib} da camada calibrada ES→PT)`,
  );
  if (report.stats) {
    const s = report.stats;
    console.log(
      `    ME ${s.me >= 0 ? '+' : ''}${s.me} m · MAE ${s.mae} m · ` +
        `RMSE ${s.rmse} m · r ${s.corr ?? '—'} · mean lead ${s.meanLeadHours}h`,
    );
  } else {
    console.log(`    ${report.pairCount} pairs so far — need ≥ ${report.minPairs} for stats (accumulating across runs).`);
  }
  return report;
}

/**
 * Estado da key no ficheiro do passo anterior (fetch-ih-buoys.js corre antes
 * no workflow) para gating da transição: se já estava `unauthorized`, a key já
 * foi reportada — não se avisa o Telegram a cada run decorrido.
 * @returns {boolean} true quando ih-buoys.json grava apiKeyStatus:'unauthorized'
 */
function readIhBuoysAuthState() {
  return readJsonOrNull(IH_BUOYS_PATH)?.apiKeyStatus === 'unauthorized';
}

async function run() {
  try {
    await fetchForecastSkill();
  } catch (err) {
    if (isIhAuthError(err)) {
      // Fail-early: key rejeitada — o passo falha cedo com alerta, em vez de o
      // skill IH degradar em silêncio (mesmo padrão do fetch-ih-buoys.js).
      err.previouslyUnauthorized = readIhBuoysAuthState();
      const res = await notifyIhAuthFailure(err, { layer: 'O skill do forecast (forecast-skill)' });
      if (res.notified) console.log('   Telegram: alerta enviado.');
      console.error(
        `::error::IH_API_KEY rejeitada (HTTP ${err.status ?? '?'}) no fetch-forecast-skill — skill IH desactivado. ` +
          `O workflow falhou cedo de propósito; renova a key (docs/IH_API_KEY.md).`,
      );
      process.exitCode = 1;
      return;
    }
    console.error('❌ Forecast skill fetch failed:', err.message || err);
    console.warn('⚠️ Keeping previous forecast-skill.json — pipeline continues.');
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  fetchForecastSkill,
  run,
  parseSpotsFromFile,
  FORECAST_ARCHIVE_HOURS,
  OBS_WINDOW_HOURS,
  OUTPUT_PATH,
};
