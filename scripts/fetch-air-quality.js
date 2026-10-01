/**
 * Fetch European AQI per spot from the Open-Meteo Air Quality API (CAMS).
 *
 *   https://air-quality-api.open-meteo.com/v1/air-quality
 *
 * Separate host + quota from the main forecast API — runs in the same
 * workflow step family as update-conditions but writes its own artifact so
 * an AQ outage can never block conditions.json. update-conditions.js merges
 * `airQualityIndex` into the current conditions when the file is fresh.
 *
 * Output: public/data/air-quality.json
 */

const path = require('path');
const { atomicWriteJson } = require('./lib/atomicWriteJson.js');
const { findCurrentHourIndex } = require('./lib/forecastConfidence.js');
const { spots } = require('./update-conditions.js');

const AQ_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OUTPUT_PATH =
  process.env.AIR_QUALITY_OUTPUT_PATH || path.join(__dirname, '../public/data/air-quality.json');
const MIN_REQUEST_INTERVAL = 150;
const MIN_COVERAGE = 0.95;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`🌫  VenTu — European AQI Open-Meteo (${spots.length} spots)`);
  const outSpots = {};
  let failed = 0;

  for (const spot of spots) {
    const url =
      `${AQ_API}?latitude=${spot.lat}&longitude=${spot.lon}` +
      `&hourly=european_aqi&timezone=Europe%2FLisbon&forecast_days=2`;
    try {
      const json = await fetchJson(url);
      const times = json?.hourly?.time;
      const series = json?.hourly?.european_aqi;
      if (!Array.isArray(times) || !Array.isArray(series)) throw new Error('empty hourly block');
      const i = Math.min(findCurrentHourIndex(times), series.length - 1);
      // Number(null) === 0 — null é «sem leitura», nunca AQI 0.
      const aqi = series[i] != null ? Number(series[i]) : NaN;
      if (!Number.isFinite(aqi)) throw new Error('aqi not finite at current hour');
      outSpots[spot.id] = { aqi: Math.round(aqi), at: times[i] };
    } catch (err) {
      failed += 1;
      console.warn(`  ✗ ${spot.id}: ${err.message}`);
    }
    await sleep(MIN_REQUEST_INTERVAL);
  }

  const coverage = Object.keys(outSpots).length / Math.max(spots.length, 1);
  if (coverage < MIN_COVERAGE) {
    console.error(
      `❌ Coverage ${(coverage * 100).toFixed(1)}% < ${MIN_COVERAGE * 100}% — ficheiro NÃO gravado.`,
    );
    process.exit(1);
  }

  atomicWriteJson(OUTPUT_PATH, {
    generatedAt: new Date().toISOString(),
    source: 'Open-Meteo Air Quality (CAMS European AQI)',
    sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
    spots: outSpots,
  });
  console.log(
    `✅ ${Object.keys(outSpots).length}/${spots.length} spots → ${OUTPUT_PATH}` +
      (failed ? ` (${failed} falhados)` : ''),
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
