/**
 * One-off: validate Caparica/Guincho wind after METAR + ICON-EU merge.
 * Usage: node scripts/validate-coastal-wind.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const { WIND_MODELS, findCurrentHourIndex } = require('./lib/forecastConfidence.js');
const { blendWindAtIndex, readModelMap } = require('./lib/windBlend.js');
const { fetchMetarByIcao, buildMetarObservedForSpot } = require('./lib/metar.js');
const {
  fetchIpmaObservations,
  findLatestObservationForStation,
  buildObservedPayload,
  parseSpotsFromFile,
  MAX_STATION_DISTANCE_KM,
} = require('./lib/ipma.js');
const { pickBestObservation } = require('./lib/observationPick.js');

const MS_TO_KT = 1.94384;

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function weatherBundle(lat, lon) {
  const base =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&timezone=Europe/Lisbon&forecast_days=1&wind_speed_unit=ms`;
  const multi = `${base}&models=${WIND_MODELS.join(',')}`;
  const [best, models] = await Promise.all([fetchJson(base), fetchJson(multi)]);
  const i = findCurrentHourIndex(best.hourly.time);
  const wi = findCurrentHourIndex(models.hourly.time);
  const mean = best.hourly.wind_speed_10m[i] || 0;
  const gust = best.hourly.wind_gusts_10m[i] || 0;
  const dir = best.hourly.wind_direction_10m[i] || 0;
  const blend = blendWindAtIndex(
    mean,
    dir,
    gust,
    readModelMap(models.hourly, 'wind_speed_10m', WIND_MODELS, wi),
    readModelMap(models.hourly, 'wind_direction_10m', WIND_MODELS, wi),
    readModelMap(models.hourly, 'wind_gusts_10m', WIND_MODELS, wi),
  );
  const meanKt = mean * MS_TO_KT;
  const gustKt = gust * MS_TO_KT;
  let sessionKt = null;
  if (meanKt < 12 && gustKt >= 12 && gustKt / Math.max(meanKt, 0.4) >= 2) {
    sessionKt = Math.min(gustKt * 0.8, meanKt + (gustKt - meanKt) * 0.6);
    if (sessionKt <= meanKt + 0.5) sessionKt = null;
  }
  const iconRaw = models.hourly.wind_speed_10m_icon_eu?.[wi];
  return {
    meanKt: meanKt.toFixed(1),
    gustKt: gustKt.toFixed(1),
    blendKt: (blend.windSpeed * MS_TO_KT).toFixed(1),
    blendMethod: blend.method,
    sessionKt: sessionKt != null ? sessionKt.toFixed(1) : null,
    iconEu: iconRaw != null ? (iconRaw * MS_TO_KT).toFixed(1) : null,
    hour: best.hourly.time[i],
  };
}

const wanted = new Set([
  'nova-vaga',
  'guincho',
  'seixal-madeira',
  'machico',
  'ponta-delgada',
]);
const spots = parseSpotsFromFile(path.join(root, 'src/lib/spots.ts')).filter(
  (s) => wanted.has(s.slug) || wanted.has(s.id),
);
const map = JSON.parse(fs.readFileSync(path.join(root, 'public/data/ipma-station-map.json'), 'utf8'));

const [ipma, metar] = await Promise.all([
  fetchIpmaObservations().catch((e) => {
    console.warn('IPMA fail', e.message);
    return null;
  }),
  fetchMetarByIcao().catch((e) => {
    console.warn('METAR fail', e.message);
    return null;
  }),
]);

console.log('METAR airports:', metar ? Object.keys(metar).sort().join(', ') : 'none');

for (const spot of spots) {
  const mapping = map[spot.slug];
  let ipmaCand = null;
  if (mapping && ipma) {
    const tries = [
      {
        idEstacao: mapping.idEstacao,
        stationName: mapping.stationName,
        distanceKm: mapping.distanceKm,
      },
      ...(mapping.alternates || []),
    ];
    for (const t of tries) {
      if (t.distanceKm > MAX_STATION_DISTANCE_KM) continue;
      const obs = findLatestObservationForStation(ipma, t.idEstacao);
      if (obs) {
        ipmaCand = buildObservedPayload(obs, t.stationName, t.distanceKm);
        break;
      }
    }
  }
  const metarCand = buildMetarObservedForSpot(spot, metar);
  const picked = pickBestObservation(ipmaCand, null, metarCand);
  const w = await weatherBundle(spot.lat, spot.lon);

  console.log(`\n=== ${spot.slug} (${spot.lat}, ${spot.lon}) ===`);
  console.log(`forecast hour ${w.hour}`);
  console.log(
    `best_match ${w.meanKt} kt · gust ${w.gustKt} kt · ICON-EU ${w.iconEu} kt`,
  );
  console.log(
    `blend ${w.blendKt} kt (${w.blendMethod}) · session proxy ${w.sessionKt ?? 'n/a'}`,
  );
  console.log(
    'IPMA',
    ipmaCand
      ? `${ipmaCand.stationName} ${ipmaCand.windSpeedKt}kt @${ipmaCand.distanceKm}km`
      : 'none',
  );
  console.log(
    'METAR',
    metarCand
      ? `${metarCand.stationName} ${metarCand.windSpeedKt}kt @${metarCand.distanceKm}km`
      : 'none',
  );
  console.log(
    'PICKED',
    picked
      ? `${picked.source} ${picked.stationName} ${picked.windSpeedKt}kt`
      : 'none → blend/session/forecast',
  );
}
