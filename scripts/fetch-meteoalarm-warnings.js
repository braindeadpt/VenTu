/**
 * Fetch MeteoAlarm (EUMETNET) warnings → public/data/warnings.json
 * (source: 'meteoalarm'). Secondary source — used as FALLBACK when the IPMA
 * open-data API is down (fetch-ipma-warnings.js calls tryMeteoAlarmFallback).
 *
 * Requires the free MeteoAlarm API token (METEOALARM_API_KEY) — see
 * docs/METEOALARM_API_KEY.md. Without it, or on failure, we keep the previous
 * warnings.json and exit 0: warnings never block the Open-Meteo pipeline.
 */

const fs = require('fs');
const path = require('path');
const { buildMeteoAlarmPayload } = require('./lib/meteoalarmWarnings.js');

const OUTPUT_PATH =
  process.env.IPMA_WARNINGS_OUTPUT_PATH || path.join(__dirname, '../public/data/warnings.json');
const MAX_STALE_HOURS = 6;

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

function getToken() {
  return process.env.METEOALARM_API_KEY?.trim() || null;
}

function writePayload(payload) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  const withWarnings = Object.keys(payload.spotWarnings ?? {}).length;
  console.log(`✅ MeteoAlarm warnings saved to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`📊 Active warnings: ${payload.warnings.length} · spots affected: ${withWarnings}/${parseSpotsFromFile().length} · source: meteoalarm`);
  return payload;
}

/**
 * Fallback entry used by fetch-ipma-warnings.js: tries MeteoAlarm when the
 * IPMA API failed. Returns true when the file was (re)written, false when
 * the fallback is not possible (no token or fetch failed).
 * @returns {Promise<boolean>}
 */
async function tryMeteoAlarmFallback() {
  const token = getToken();
  if (!token) {
    console.warn('   ℹ️ METEOALARM_API_KEY not set — skipping MeteoAlarm fallback.');
    return false;
  }
  console.log('⚠️  IPMA down — falling back to MeteoAlarm (EUMETNET)...');
  const payload = await buildMeteoAlarmPayload(token, parseSpotsFromFile());
  if (!payload.warnings.length) {
    console.warn('   MeteoAlarm OK but no active warnings — writing empty meteoalarm layer.');
  }
  writePayload(payload);
  return true;
}

async function run() {
  const token = getToken();
  if (!token) {
    console.warn('ℹ️ METEOALARM_API_KEY not set — run fetch-ipma-warnings.js (primary).');
    if (fs.existsSync(OUTPUT_PATH)) {
      console.warn('   Keeping previous warnings.json — pipeline continues.');
      return;
    }
    console.warn('   No previous warnings.json — continuing without warnings.');
    return;
  }
  try {
    await tryMeteoAlarmFallback();
  } catch (err) {
    console.error('❌ MeteoAlarm fetch failed:', err.message || err);
    if (fs.existsSync(OUTPUT_PATH)) {
      console.warn('⚠️ Keeping previous public/data/warnings.json — pipeline continues.');
    } else {
      console.warn('⚠️ No previous warnings.json — continuing without MeteoAlarm warnings.');
    }
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, tryMeteoAlarmFallback, parseSpotsFromFile, getToken };
