#!/usr/bin/env node
/**
 * Validates the freshly generated public/data files after the pipeline —
 * schema + TTL — before the commit/push (update-data.yml job `validate-data`).
 * No build: data guarantees only.
 *
 * Mode-aware: `full` runs also check the Open-Meteo TTL backstop (reusing the
 * STALE_* constants from scripts/lib/updateSchedule.js); `observations` runs
 * only check the fields that an obs run refreshes; `skip` does nothing.
 *
 * Usage:
 *   node scripts/validate-generated-data.js [--mode full|observations|skip]
 * Env: VENTU_MODE overrides --mode; VENTU_DATA_DIR overrides the data root
 * (used by tests — the default is ./public/data).
 */

const fs = require('fs');
const path = require('path');

const DATA =
  process.env.VENTU_DATA_DIR || path.join(__dirname, '..', 'public', 'data');

const args = process.argv.slice(2);
const fromArg = (args.find((a) => a.startsWith('--mode=')) || '').split('=')[1];
const MODE = ['full', 'observations', 'skip'].includes(fromArg || process.env.VENTU_MODE)
  ? fromArg || process.env.VENTU_MODE
  : 'full';

if (MODE === 'skip') {
  console.log('⏭  validate-generated-data: mode=skip — nothing to validate');
  process.exit(0);
}

const { STALE_FULL_HOURS_DAY, STALE_FULL_HOURS_NIGHT, getLisbonParts } = require('./lib/updateSchedule');

const errors = [];
const warnings = [];
const checks = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const check = (name, cond, detail) => {
  checks.push(name);
  if (!cond) fail(`${name}: ${detail}`);
};

const read = (p) => {
  const file = path.join(DATA, p);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const isIso = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s));
const ageHours = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;

// ── 1. pipeline-meta.json — the run ledger ──
const meta = read('pipeline-meta.json');
check('pipeline-meta', meta !== undefined, 'file missing');
if (meta !== undefined) {
  for (const k of ['lastRunAt', 'lastRunMode', 'observationsUpdatedAt', 'fullUpdatedAt', 'displayUpdatedAt']) {
    check(`pipeline-meta.${k}`, meta[k] !== undefined, `required key missing`);
  }
  check('pipeline-meta.lastRunMode', ['full', 'observations'].includes(meta.lastRunMode),
    `unexpected mode "${meta.lastRunMode}"`);
  for (const k of ['lastRunAt', 'observationsUpdatedAt', 'fullUpdatedAt', 'displayUpdatedAt']) {
    if (meta[k] !== undefined) {
      check(`pipeline-meta.${k}.iso`, isIso(meta[k]), `not an ISO timestamp: "${meta[k]}"`);
    }
  }
}

// ── 2. conditions.json — spot-slug → condition object ──
const conditions = read('conditions.json');
check('conditions', conditions !== undefined, 'file missing');
if (conditions !== undefined) {
  check('conditions.shape', typeof conditions === 'object' && conditions !== null && !Array.isArray(conditions),
    'must be an object keyed by spot slug');
  const slugs = Object.keys(conditions);
  check('conditions.nonEmpty', slugs.length > 0, 'no spots');
  const bad = slugs.filter((s) => {
    const v = conditions[s];
    return typeof v !== 'object' || v === null || typeof v.waveHeight !== 'number';
  });
  check('conditions.entries', bad.length === 0, `${bad.length} spot(s) without a numeric waveHeight`);
}

// ── 3. forecasts.json + forecasts/<slug>.json — hourly arrays ──
const forecasts = read('forecasts.json');
check('forecasts', forecasts !== undefined, 'file missing');
const FORECAST_MIN_HOURS = 24;
let forecastFiles = [];
if (fs.existsSync(path.join(DATA, 'forecasts'))) {
  forecastFiles = fs.readdirSync(path.join(DATA, 'forecasts'))
    .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}
if (forecasts !== undefined) {
  check('forecasts.shape', typeof forecasts === 'object' && !Array.isArray(forecasts), 'must be an object');
  const keys = Object.keys(forecasts);
  check('forecasts.nonEmpty', keys.length > 0, 'no spots');
  for (const k of keys) {
    const arr = forecasts[k];
    check(`forecasts.${k}.shape`, Array.isArray(arr) && arr.length >= FORECAST_MIN_HOURS,
      `expected array of ≥${FORECAST_MIN_HOURS} hours`);
    if (Array.isArray(arr)) {
      const bad = arr.filter((h) => !h || !isIso(h.time) || typeof h.waveHeight !== 'number' || typeof h.windSpeed !== 'number');
      check(`forecasts.${k}.entries`, bad.length === 0,
        `${bad.length} hour(s) missing time/waveHeight/windSpeed`);
    }
  }
  // split-file integrity: every key has a file and vice versa
  const noFile = keys.filter((k) => !forecastFiles.includes(k));
  const orphan = forecastFiles.filter((f) => !keys.includes(f));
  check('forecasts.splitFiles', noFile.length === 0 && orphan.length === 0,
    `${noFile.length} key(s) without file, ${orphan.length} file(s) without key`);
  for (const f of forecastFiles) {
    const arr = read(`forecasts/${f}.json`);
    check(`forecasts/${f}.shape`, Array.isArray(arr) && arr.length >= FORECAST_MIN_HOURS,
      `expected array of ≥${FORECAST_MIN_HOURS} hours`);
    if (Array.isArray(arr)) {
      const bad = arr.filter((h) => !h || !isIso(h.time) || typeof h.waveHeight !== 'number' || typeof h.windSpeed !== 'number');
      check(`forecasts/${f}.entries`, bad.length === 0,
        `${bad.length} hour(s) missing time/waveHeight/windSpeed`);
    }
  }
}

// ── 4. Cross-file integrity: conditions and forecasts cover the same spots ──
if (conditions !== undefined && forecasts !== undefined) {
  const cKeys = Object.keys(conditions);
  const fKeys = Object.keys(forecasts);
  const onlyC = cKeys.filter((k) => !fKeys.includes(k));
  const onlyF = fKeys.filter((k) => !cKeys.includes(k));
  check('crossFile.spotSets', onlyC.length === 0 && onlyF.length === 0,
    `spot set mismatch: ${onlyC.length} only in conditions, ${onlyF.length} only in forecasts`);
}

// ── 5. spots-index.json + spots-lite.json ──
const spotsIndex = read('spots-index.json');
check('spots-index', spotsIndex !== undefined, 'file missing');
if (spotsIndex !== undefined) {
  check('spots-index.generatedAt', isIso(spotsIndex.generatedAt), 'missing/invalid generatedAt');
  check('spots-index.spots', Array.isArray(spotsIndex.spots) && spotsIndex.spots.length > 0,
    'missing/empty spots array');
}
const spotsLite = read('spots-lite.json');
check('spots-lite', spotsLite !== undefined, 'file missing');
if (spotsLite !== undefined) {
  check('spots-lite.shape', Array.isArray(spotsLite) && spotsLite.length > 0, 'must be a non-empty array');
  const bad = spotsLite.filter((s) => !s || typeof s.slug !== 'string' || typeof s.name !== 'string');
  check('spots-lite.entries', bad.length === 0, `${bad.length} entr(ies) missing slug/name`);
}

// ── 6. ih-tides.json + ipma-station-map.json ──
const tides = read('ih-tides.json');
check('ih-tides', tides !== undefined, 'file missing');
if (tides !== undefined) {
  check('ih-tides.fetchedAt', isIso(tides.fetchedAt), 'missing/invalid fetchedAt');
  check('ih-tides.spotMapping', typeof tides.spotMapping === 'object' && tides.spotMapping !== null
    && Object.keys(tides.spotMapping).length > 0, 'missing/empty spotMapping');
}
const stationMap = read('ipma-station-map.json');
if (stationMap !== undefined) {
  check('ipma-station-map.shape', typeof stationMap === 'object' && stationMap !== null
    && Object.keys(stationMap).length > 0, 'must be a non-empty object');
}

// ── 7. dawn-patrol.json (separate workflow, validate if present) ──
const dawn = read('dawn-patrol.json');
if (dawn !== undefined) {
  check('dawn-patrol.generatedAt', isIso(dawn.generatedAt), 'missing/invalid generatedAt');
  check('dawn-patrol.spots', Array.isArray(dawn.spots), 'missing spots array');
}

// ── 8. TTL — freshness of what THIS run must have refreshed ──
// Both full and observations runs refresh: IH tides, spots index, observations.
// IH tides: warn-only if stale. fetch-ih-tides.js keeps the previous file and
// exits 0 so a multi-day IH outage (e.g. 2026-07-29, fetchedAt 14+ days old)
// must NOT brick Open-Meteo / obs. Schema checks above stay hard-fail.
const TTL_TIDES_H = 24;
const TTL_SPOTS_INDEX_H = 2.5;
const TTL_OBS_H = 2;
if (tides !== undefined && isIso(tides.fetchedAt)) {
  const age = ageHours(tides.fetchedAt);
  checks.push('ttl.ih-tides');
  if (age > TTL_TIDES_H) {
    warn(`ttl.ih-tides: fetchedAt ${age.toFixed(1)}h old (>${TTL_TIDES_H}h) — IH outage; schema OK, pipeline continues`);
  }
}
if (spotsIndex !== undefined && isIso(spotsIndex.generatedAt)) {
  check('ttl.spots-index', ageHours(spotsIndex.generatedAt) <= TTL_SPOTS_INDEX_H,
    `generatedAt ${ageHours(spotsIndex.generatedAt).toFixed(1)}h old (>${TTL_SPOTS_INDEX_H}h)`);
}
if (meta !== undefined && isIso(meta.observationsUpdatedAt)) {
  check('ttl.observations', ageHours(meta.observationsUpdatedAt) <= TTL_OBS_H,
    `observationsUpdatedAt ${ageHours(meta.observationsUpdatedAt).toFixed(1)}h old (>${TTL_OBS_H}h)`);
}
// Full runs only: the Open-Meteo backstop (same constants as the scheduler).
if (MODE === 'full' && meta !== undefined && isIso(meta.fullUpdatedAt)) {
  const { hour } = getLisbonParts();
  const isDaytime = hour >= 6 && hour <= 20;
  const max = isDaytime ? STALE_FULL_HOURS_DAY : STALE_FULL_HOURS_NIGHT;
  check('ttl.fullUpdatedAt', ageHours(meta.fullUpdatedAt) <= max,
    `fullUpdatedAt ${ageHours(meta.fullUpdatedAt).toFixed(1)}h old (>${max}h in ${isDaytime ? 'day' : 'night'})`);
}

// ── Report ──
if (warnings.length > 0) {
  console.warn(`⚠️ validate-generated-data (mode=${MODE}): ${warnings.length} warning(s)\n`);
  for (const w of warnings) console.warn(`  - ${w}`);
}
if (errors.length > 0) {
  console.error(`❌ validate-generated-data (mode=${MODE}): ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✅ validate-generated-data (mode=${MODE}): ${checks.length} checks OK — schema + TTL valid`);
