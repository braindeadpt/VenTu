/**
 * Fetch monthly climatology per spot from NASA POWER (no key).
 *
 *   https://power.larc.nasa.gov/api/temporal/climatology/point
 *
 * One call per spot returns the 2001–2020 monthly/annual means (MERRA-2
 * baseline — a fixed climatological period, not a rolling window). Values:
 * WS10M wind (m/s), T2M air temp (°C), PRECTOTCORR precip (mm/day).
 *
 * This is a RARE refresh (the baseline only changes when NASA publishes a
 * new climatological period): run via `npm run data:climatology`, NOT part
 * of the ~3h `data:update` chain. Missing/failed spots are skipped — the
 * file still writes when coverage is ≥ 95%, like the main pipeline gate.
 *
 * Output: public/data/climatology.json → consumed by src/lib/climatology.ts
 * (SpotClimateCard on the spot page, «Clima do spot»).
 */

const path = require('path');
const { atomicWriteJson } = require('./lib/atomicWriteJson.js');
// Same parser the conditions pipeline uses — spots.ts stays the single
// source of truth (id/lat/lon). Requiring the module also prints its
// spot-count log line; it performs no fetches on import.
const { spots } = require('./update-conditions.js');

const POWER_API = 'https://power.larc.nasa.gov/api/temporal/climatology/point';
const PARAMETERS = 'WS10M,T2M,PRECTOTCORR';
const COMMUNITY = 'RE';
const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const OUTPUT_PATH =
  process.env.CLIMATOLOGY_OUTPUT_PATH || path.join(__dirname, '../public/data/climatology.json');
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

function monthly(param, key) {
  if (!param || typeof param !== 'object') return null;
  const out = [];
  for (const m of MONTH_KEYS) {
    const v = Number(param[m]);
    out.push(Number.isFinite(v) ? v : null);
  }
  // fill_value -999 means "no data" — a row of them is useless, not an array.
  return out.every((v) => v === null || v === -999) ? null : out;
}

function annual(param) {
  const v = Number(param?.ANN);
  return Number.isFinite(v) && v !== -999 ? v : null;
}

async function main() {
  console.log(`🛰  VenTu — climatologia NASA POWER (${spots.length} spots)`);
  const outSpots = {};
  let failed = 0;

  for (const spot of spots) {
    const url =
      `${POWER_API}?parameters=${PARAMETERS}&community=${COMMUNITY}` +
      `&longitude=${spot.lon}&latitude=${spot.lat}&format=JSON`;
    try {
      const json = await fetchJson(url);
      const p = json?.properties?.parameter ?? {};
      const wind = monthly(p.WS10M);
      const temp = monthly(p.T2M);
      const precip = monthly(p.PRECTOTCORR);
      if (!wind && !temp && !precip) throw new Error('empty parameter block');
      outSpots[spot.id] = {
        wind,
        temp,
        precip,
        windAnn: annual(p.WS10M),
        tempAnn: annual(p.T2M),
        precipAnn: annual(p.PRECTOTCORR),
      };
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
    source: 'NASA POWER (MERRA-2)',
    sourceUrl: 'https://power.larc.nasa.gov',
    baseline: '2001-01..2020-12',
    units: { wind: 'm/s', temp: '°C', precip: 'mm/day' },
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

module.exports = { monthly, annual };
