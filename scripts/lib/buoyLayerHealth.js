/**
 * Buoy layer health (server side) — mirror of src/lib/buoyLayerHealth.ts so
 * the pipeline can record the SAME status the UI derives into
 * pipeline-meta.json, for workflow logs and diagnostics.
 *
 * IH status values:
 *   - 'no-key' — IH_API_KEY not configured in the pipeline (stations only).
 *   - 'down'   — key configured but the IH wave API returned no snapshots.
 *   - 'stale'  — snapshots exist but every active reading is older than the
 *                freshness gate (3h IH); the UI card would hide itself.
 *   - 'ok'     — fresh readings available.
 *
 * WMO status values (keyless Copernicus fallback):
 *   - 'down'   — no file, no buoys, or hasWaveData false (fallback dead).
 *   - 'stale'  — buoys exist but every reading is older than the 6h gate.
 *   - 'ok'     — at least one fresh reading.
 */
const fs = require('fs');
const path = require('path');

/** Max age (h) before a snapshot counts as stale — mirrors the data layer. */
const BUOY_READING_MAX_AGE_HOURS = 3;
/** WMO/Copernicus gate is wider (6h) because NRT ingestion lags hours. */
const WMO_READING_MAX_AGE_HOURS = 6;

function isoAgeHours(iso, nowMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

/**
 * Pure derivation — same rules as the client (testable without fetch/disk).
 * @param {object | null | undefined} file parsed ih-buoys.json
 * @param {number} [nowMs]
 * @returns {'ok' | 'no-key' | 'down' | 'stale'}
 */
function deriveBuoyLayerStatus(file, nowMs = Date.now()) {
  if (!file || !file.stations) return 'no-key';
  if (file.apiKeyConfigured === false) return 'no-key';
  if (!file.hasWaveData) return 'down';

  // Snapshots exist — are any of them fresh? Use the newest reading across
  // active stations (inactive buoys with old lastSea must not trigger).
  let newest = Infinity;
  for (const st of Object.values(file.stations)) {
    if (st.status === 'inactive' || st.status === 'inativa') continue;
    const age = isoAgeHours(st.latest?.date ?? st.lastSea, nowMs);
    if (age !== null && age >= 0 && age < newest) newest = age;
  }
  if (!Number.isFinite(newest)) return 'down';
  return newest <= BUOY_READING_MAX_AGE_HOURS ? 'ok' : 'stale';
}

/**
 * Pure WMO/Copernicus derivation (keyless fallback) — mirrors the client.
 * @param {object | null | undefined} file parsed wmo-buoys.json
 * @param {number} [nowMs]
 * @returns {'ok' | 'down' | 'stale'}
 */
function deriveWmoLayerStatus(file, nowMs = Date.now()) {
  if (!file || !file.buoys) return 'down';
  if (!file.hasWaveData) return 'down';

  let newest = Infinity;
  for (const buoy of Object.values(file.buoys)) {
    const age = isoAgeHours(buoy.latest?.date, nowMs);
    if (age !== null && age >= 0 && age < newest) newest = age;
  }
  if (!Number.isFinite(newest)) return 'down';
  return newest <= WMO_READING_MAX_AGE_HOURS ? 'ok' : 'stale';
}

/**
 * Newest reading timestamp across WMO buoys (for diagnostics).
 */
function newestWmoReadingAt(file) {
  let newestTs = -Infinity;
  for (const buoy of Object.values(file?.buoys ?? {})) {
    const t = new Date(buoy.latest?.date).getTime();
    if (Number.isFinite(t) && t > newestTs) newestTs = t;
  }
  return Number.isFinite(newestTs) && newestTs > -Infinity
    ? new Date(newestTs).toISOString()
    : undefined;
}

/**
 * Load ih-buoys.json + wmo-buoys.json from the pipeline output dir and derive
 * the layer health (both sources), for pipeline-meta.json and logs.
 * @param {string} [rootDir]
 * @param {number} [nowMs]
 * @returns {{ status: 'ok'|'no-key'|'down'|'stale', apiKeyConfigured: boolean,
 *            hasWaveData: boolean, newestReadingAt?: string,
 *            wmo: { status: 'ok'|'down'|'stale', hasWaveData: boolean,
 *                   newestReadingAt?: string } } | null}
 *         null when ih-buoys.json is absent (first run before the buoy fetch).
 */
function loadBuoyLayerStatus(rootDir = path.join(__dirname, '..', '..'), nowMs = Date.now()) {
  const filePath = path.join(rootDir, 'public', 'data', 'ih-buoys.json');
  let file;
  try {
    file = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }

  const status = deriveBuoyLayerStatus(file, nowMs);
  // Newest active reading (same walk as the derivation) for diagnostics.
  let newestReadingAt;
  {
    let newestTs = -Infinity;
    for (const st of Object.values(file.stations ?? {})) {
      if (st.status === 'inactive' || st.status === 'inativa') continue;
      const t = new Date(st.latest?.date ?? st.lastSea).getTime();
      if (Number.isFinite(t) && t > newestTs) newestTs = t;
    }
    if (Number.isFinite(newestTs) && newestTs > -Infinity) {
      newestReadingAt = new Date(newestTs).toISOString();
    }
  }

  // WMO fallback — same walk as the client. Missing file → 'down'.
  let wmoFile;
  try {
    wmoFile = JSON.parse(fs.readFileSync(path.join(rootDir, 'public', 'data', 'wmo-buoys.json'), 'utf-8'));
  } catch {
    wmoFile = null;
  }
  const wmoStatus = deriveWmoLayerStatus(wmoFile, nowMs);
  const wmo = {
    status: wmoStatus,
    hasWaveData: wmoFile?.hasWaveData === true,
    ...(newestWmoReadingAt(wmoFile) ? { newestReadingAt: newestWmoReadingAt(wmoFile) } : {}),
  };

  return {
    status,
    apiKeyConfigured: file.apiKeyConfigured === true,
    hasWaveData: file.hasWaveData === true,
    ...(newestReadingAt ? { newestReadingAt } : {}),
    wmo,
  };
}

module.exports = {
  BUOY_READING_MAX_AGE_HOURS,
  WMO_READING_MAX_AGE_HOURS,
  deriveBuoyLayerStatus,
  deriveWmoLayerStatus,
  loadBuoyLayerStatus,
};
