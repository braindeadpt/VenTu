/**
 * Probe the live observations Cloudflare Worker (GET /obs).
 * Used by scripts/check-obs-worker.js and the API Keys Health workflow.
 */

const DEFAULT_OBS_WORKER_URL = 'https://ventu-observations.busntech-net.workers.dev';
const PROBE_LAT = 41.18;
const PROBE_LON = -8.7;

function resolveObsWorkerBase(raw) {
  const s = String(raw || '').trim();
  if (!s) return DEFAULT_OBS_WORKER_URL;
  return s.replace(/\/+$/, '');
}

function buildObsProbeUrl(base) {
  const u = new URL(`${resolveObsWorkerBase(base)}/obs`);
  u.searchParams.set('lat', String(PROBE_LAT));
  u.searchParams.set('lon', String(PROBE_LON));
  return u.toString();
}

function buildHealthUrl(base) {
  return `${resolveObsWorkerBase(base)}/health`;
}

/**
 * @param {unknown} body
 * @returns {{ ok: boolean, reason?: string, source?: string }}
 */
function evaluateObsPayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'body is not an object' };
  }
  const observed = /** @type {{ observed?: unknown }} */ (body).observed;
  if (observed === null) {
    return { ok: false, reason: 'observed is null at the Porto probe (expected a station)' };
  }
  if (!observed || typeof observed !== 'object') {
    return { ok: false, reason: 'missing observed object' };
  }
  const o = /** @type {Record<string, unknown>} */ (observed);
  const source = o.source;
  if (source !== 'ipma' && source !== 'ecowitt' && source !== 'metar') {
    return { ok: false, reason: `unexpected source ${JSON.stringify(source)}` };
  }
  const kt = Number(o.windSpeedKt);
  if (!Number.isFinite(kt)) {
    return { ok: false, reason: 'windSpeedKt is not a number' };
  }
  return { ok: true, source: String(source) };
}

module.exports = {
  DEFAULT_OBS_WORKER_URL,
  PROBE_LAT,
  PROBE_LON,
  resolveObsWorkerBase,
  buildObsProbeUrl,
  buildHealthUrl,
  evaluateObsPayload,
};
