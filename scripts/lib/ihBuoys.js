/**
 * IH Datawell Waverider buoys — measured wave data (ground truth for surf).
 *
 * Same IH host family as the tide gauges, but a DIFFERENT backend: the buoy
 * collections keep serving while the tide observations backend 500s
 * (incident 2026-08-13). This gives the observed layer a second independent
 * IH source for wave height/period/direction, not just wind.
 *
 * - Stations list: OGC API Features (free, no key) — Datawell Waverider
 *   (`buoys_datawell`) plus Fugro Oceanor Wavescan (`buoys_Fugro_oceanor_wavescan`,
 *   includes the active Nazaré Costeira buoy that has no Datawell equivalent).
 * - Wave time series: IH REST `getDatawellData` (free API key, X-API-KEY),
 *   keyed by id_est regardless of instrument family.
 *
 * Buoys are deep-water; swell height/period is coherent over long distances,
 * so the mapping radius is far larger than the wind-station radius (30 km).
 * The attach radius is still conservative and distanceKm is always reported
 * so the UI can stay honest ("boia Sines a 175 km").
 *
 * @see https://faq.hidrografico.pt/books/hidrografico/page/servico-de-dados-boias-datawell-waverider
 */

const { isIslandSpot, buoyMapKmFor, buoyAttachKmForMapping } = require('./islandSpots.js');

const DEFAULT_IH_API = 'https://ogcapi.hidrografico.pt';
const DEFAULT_WAVE_API = 'https://supportserver1.hidrografico.pt/geodata/buoys';
const DEFAULT_COLLECTIONS = ['buoys_datawell', 'buoys_Fugro_oceanor_wavescan'];

/** Nearest-buoy mapping radius (km). Generous: only ~3 mainland buoys. */
const MAX_BUOY_MAP_KM = 250;
/** Max distance to ATTACH a buoy reading to a spot (km). */
const MAX_BUOY_ATTACH_KM = 200;

/**
 * Typed error for IH key rejection (HTTP 401/403 on getDatawellData).
 *
 * A bad/expired key fails EVERY buoy request, so the pipeline must distinguish
 * "key rejeitada" (actionable: renew the secret) from a transient IH outage
 * (keep the previous file, exit 0). fetch-ih-buoys.js uses this to fail the
 * workflow early with a Telegram alert instead of silently writing
 * hasWaveData:false forever.
 */
class IhAuthError extends Error {
  /**
   * @param {number} status HTTP status (401 | 403)
   * @param {number} stationId idEst that first surfaced the rejection
   */
  constructor(status, stationId) {
    super(`IH API key rejected (HTTP ${status}) on getDatawellData for buoy ${stationId}`);
    this.name = 'IhAuthError';
    this.status = status;
    this.stationId = stationId;
  }
}

/** @param {unknown} err @returns {err is IhAuthError} */
function isIhAuthError(err) {
  return err instanceof IhAuthError || (err != null && err.name === 'IhAuthError');
}

/**
 * Typed error for a non-auth HTTP failure on the IH wave API (4xx/5xx other
 * than 401/403). Carries `status` so the pipeline can tell an upstream outage
 * (5xx, 408, 429) from a request/contract problem (other 4xx). The message
 * keeps the historical «HTTP <status> for buoy <id>» wording (logs/greps).
 */
class IhHttpError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {number | string} stationId idEst (or collection) that failed
   * @param {string} [message] override (station listing keeps «HTTP <status>»)
   */
  constructor(status, stationId, message) {
    super(message ?? `HTTP ${status} for buoy ${stationId}`);
    this.name = 'IhHttpError';
    this.status = status;
    this.stationId = stationId;
  }
}

/** Códigos de erro de rede (Node/undici) que contam como avaria transitória. */
const TRANSIENT_NET_CODE_RE =
  /^(ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE|UND_ERR_[A-Z_]+)$/;

/**
 * Is this a TRANSIENT upstream failure of the IH API — HTTP 5xx, 408/429,
 * timeout (AbortSignal.timeout → TimeoutError/AbortError) or a network-level
 * error (fetch failed, DNS, connection reset)? Auth rejection (401/403) and
 * other 4xx are NOT transient: they are actionable on our side.
 * @param {unknown} err
 * @returns {boolean}
 */
function isTransientIhError(err) {
  if (err == null || typeof err !== 'object') return false;
  if (isIhAuthError(err)) return false;
  const e = /** @type {any} */ (err);
  if (typeof e.status === 'number') {
    return e.status >= 500 || e.status === 408 || e.status === 429;
  }
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
  const code = String(e.code ?? e.cause?.code ?? '');
  if (TRANSIENT_NET_CODE_RE.test(code)) return true;
  if (e.cause && (e.cause.name === 'TimeoutError' || e.cause.name === 'AbortError')) return true;
  // undici: `TypeError: fetch failed` (causa de rede no .cause, nem sempre com code).
  if (e.name === 'TypeError' && /fetch failed|network|socket/i.test(String(e.message ?? ''))) return true;
  return false;
}

/**
 * Pure classification of one pipeline run of per-buoy wave fetches.
 *
 * `outcomes` is one entry per ACTIVE buoy: `{ idEst, result }` where `result`
 * is the Promise.allSettled outcome of fetchBuoyWave (fulfilled with a snapshot
 * or null = 2xx without series; rejected with the error).
 *
 * status:
 *   - 'no-key'          — no IH_API_KEY: nothing was fetched (stations only).
 *   - 'auth'            — ≥1 request rejected with 401/403 → FAIL (renew key).
 *   - 'no-active'       — key set but zero active buoys listed → FAIL.
 *   - 'ok'              — every active buoy returned a snapshot.
 *   - 'partial'         — ≥1 snapshot, others failed/empty → OK (as before).
 *   - 'upstream-outage' — zero snapshots and EVERY request failed with a
 *                         transient error (5xx/408/429/timeout/network) →
 *                         WARN, keep previous readings, job continues.
 *   - 'empty'           — zero snapshots and every request came back 2xx
 *                         without series → FAIL (the regression the gate in
 *                         verify-ih-buoy-layer.js was built for).
 *   - 'error'           — zero snapshots, any other mix (non-transient 4xx,
 *                         invalid JSON, 2xx-empty mixed with 5xx) → FAIL.
 *
 * `fail` says whether the job must fail on this outcome (verify step);
 * 'auth' is failed early by fetch-ih-buoys.js itself.
 *
 * @param {Array<{ idEst: number | string, result: PromiseSettledResult<object | null> }>} outcomes
 * @param {{ apiKeyConfigured?: boolean }} [opts]
 * @returns {{ status: 'no-key'|'auth'|'no-active'|'ok'|'partial'|'upstream-outage'|'empty'|'error',
 *            fail: boolean, active: number, ok: number, empty: number, transient: number, other: number,
 *            failures: Array<{ idEst: number | string, error: string, status?: number, transient: boolean }> }}
 */
function classifyWaveFetch(outcomes, opts = {}) {
  const apiKeyConfigured = opts.apiKeyConfigured !== false;
  const list = Array.isArray(outcomes) ? outcomes : [];
  const failures = [];
  let ok = 0;
  let empty = 0;
  let transient = 0;
  let other = 0;
  let auth = false;
  for (const { idEst, result } of list) {
    if (result?.status === 'fulfilled') {
      if (result.value) ok += 1;
      else empty += 1;
      continue;
    }
    const reason = result?.reason;
    if (isIhAuthError(reason)) auth = true;
    const isTransient = isTransientIhError(reason);
    if (isTransient) transient += 1;
    else other += 1;
    const status = typeof reason?.status === 'number' ? reason.status : undefined;
    failures.push({
      idEst,
      error: String(reason?.message ?? reason ?? 'unknown error').slice(0, 200),
      ...(status !== undefined ? { status } : {}),
      transient: isTransient,
    });
  }
  const active = list.length;
  const base = { active, ok, empty, transient, other, failures };
  if (!apiKeyConfigured) return { status: 'no-key', fail: false, ...base };
  if (auth) return { status: 'auth', fail: true, ...base };
  if (active === 0) return { status: 'no-active', fail: true, ...base };
  if (ok === active) return { status: 'ok', fail: false, ...base };
  if (ok > 0) return { status: 'partial', fail: false, ...base };
  if (transient === active) return { status: 'upstream-outage', fail: false, ...base };
  if (empty === active) return { status: 'empty', fail: true, ...base };
  return { status: 'error', fail: true, ...base };
}

/**
 * Max age (h) of a reading carried forward from the previous ih-buoys.json
 * during an IH outage. Same as the request window: a normal run never holds a
 * `latest` older than WAVE_WINDOW_HOURS, so an outage never shows older ones.
 */
const CARRY_FORWARD_MAX_AGE_HOURS = 24;

/**
 * Pure: carry the previous `latest` wave snapshots onto a (fresh or previous)
 * station catalogue during an IH upstream outage — KEEPING each reading's real
 * observation time (`latest.date`). The freshness gates downstream
 * (observedWaveForSpot 3 h, map dots, layer health) then treat them as what
 * they are: old readings, never fresh ones. Readings older than
 * CARRY_FORWARD_MAX_AGE_HOURS, in the future or invalid are dropped.
 *
 * @param {Record<string, object>} stations catalogue to write (copied, not mutated)
 * @param {object | null | undefined} prev previous ih-buoys.json
 * @param {{ nowMs?: number, maxAgeHours?: number }} [opts]
 * @returns {{ stations: Record<string, object>, kept: number, newestKeptReadingAt: string | null }}
 */
function carryForwardWaveReadings(stations, prev, opts = {}) {
  const { nowMs = Date.now(), maxAgeHours = CARRY_FORWARD_MAX_AGE_HOURS } = opts;
  const out = {};
  let kept = 0;
  let newestTs = -Infinity;
  for (const [id, st] of Object.entries(stations ?? {})) {
    const copy = { ...st };
    delete copy.latest;
    const prevLatest = prev?.stations?.[id]?.latest;
    if (
      prevLatest &&
      typeof prevLatest === 'object' &&
      isPlausibleHm0(prevLatest.hm0) &&
      isFreshObservation(prevLatest.date, nowMs, maxAgeHours)
    ) {
      copy.latest = { ...prevLatest };
      kept += 1;
      const t = new Date(prevLatest.date).getTime();
      if (t > newestTs) newestTs = t;
    }
    out[id] = copy;
  }
  return {
    stations: out,
    kept,
    newestKeptReadingAt: Number.isFinite(newestTs) ? new Date(newestTs).toISOString() : null,
  };
}
/** Buoy readings older than this are not attached (matches wind obs 3h). */
const MAX_OBS_AGE_HOURS = 3;
/** Time window (h) requested from getDatawellData — latest rows only. */
const WAVE_WINDOW_HOURS = 24;

/**
 * Physical plausibility ceiling for significant wave height hm0 (m).
 *
 * IH `getDatawellData` uses **99.99 as the fill value** for missing/QC-rejected
 * samples (seen live on 4/20/33/86 — 12 rows between 2026-09-03 and 2026-09-21).
 * Without a bound those rows are ingested as real observations and poison every
 * metric derived from the IH series: forecast-skill byBuoy blew up to
 * RMSE 9.6 m / corr 0.00 (vs RMSE 0.2 m / corr 0.92 on the keyless WMO route
 * for the same periods), wave-bias reported RMSE 10.1 m for BOND5, and a
 * 99.99 m reading could reach a spot's observedWave for 3 h — distorting the
 * real-time score. 25 m sits far above any measured sea state (the world
 * record Hs is ~19 m) and far below the 99.99 sentinel.
 */
const MAX_PLAUSIBLE_HM0_M = 25;
/** Same idea for the individual-wave hmax (m) — drop the field, keep the row. */
const MAX_PLAUSIBLE_HMAX_M = 40;

/**
 * Is this value a physically plausible significant wave height (m)?
 * Rejects non-finite, negative and fill/sentinel values (99.99…).
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlausibleHm0(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= MAX_PLAUSIBLE_HM0_M;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Normalise an OGC Feature into our internal station shape.
 * Accepts the OGC API schema (name/nrt) and the older WFS schema (nome/nrtd).
 * @param {object} feature GeoJSON feature from /collections/buoys_datawell/items
 * @param {string} [collection] source collection (buoys_datawell | buoys_Fugro_...)
 * @returns {object | null}
 */
function normalizeStation(feature, collection) {
  const p = feature?.properties ?? {};
  const idEst = Number(p.id_est);
  if (!Number.isFinite(idEst)) return null;
  const [lon, lat] = feature?.geometry?.coordinates ?? [NaN, NaN];
  const numLat = Number.isFinite(Number(p.lat)) ? Number(p.lat) : Number(lat);
  const numLon = Number.isFinite(Number(p.lon)) ? Number(p.lon) : Number(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) return null;
  return {
    idEst,
    name: String(p.name ?? p.nome ?? `Boia ${idEst}`),
    area: p.area != null ? String(p.area) : undefined,
    wmoId: p.wmo_id != null ? Number(p.wmo_id) : undefined,
    depth: p.depth != null ? Number(p.depth) : undefined,
    status: p.status != null ? String(p.status) : undefined,
    nrt: String(p.nrt ?? p.nrtd ?? ''),
    lat: numLat,
    lon: numLon,
    // Fugro Wavescan features use `last_data` instead of `last_sea`.
    lastPos: p.last_pos != null ? String(p.last_pos) : undefined,
    lastSea: p.last_sea != null ? String(p.last_sea) : p.last_data != null ? String(p.last_data) : undefined,
    // Instrument family for diagnostics/About: 'datawell' | 'fugro'.
    family: String(collection ?? '').toLowerCase().includes('fugro') ? 'fugro' : 'datawell',
  };
}

/**
 * Fetch the buoy station list from the IH OGC API (no key required).
 * @param {string} [apiBase]
 * @param {string[]} [collections]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ stations: Record<string, object>, sourceCollections: string[] }>}
 */
async function fetchBuoyStations(
  apiBase = DEFAULT_IH_API,
  collections = DEFAULT_COLLECTIONS,
  fetchImpl = fetch,
) {
  const stations = {};
  const sourceCollections = [];
  const errors = [];

  for (const col of collections) {
    const url = `${apiBase}/collections/${encodeURIComponent(col)}/items?limit=200&f=json`;
    try {
      const res = await fetchImpl(url, {
        headers: { Accept: 'application/geo+json, application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new IhHttpError(res.status, col, `HTTP ${res.status}`);
      const data = await res.json();
      const features = data?.features;
      if (!Array.isArray(features)) throw new Error('no features array');
      for (const f of features) {
        const st = normalizeStation(f, col);
        if (st) stations[st.idEst] = st;
      }
      sourceCollections.push(col);
    } catch (err) {
      errors.push({ col, err });
    }
  }

  if (Object.keys(stations).length === 0) {
    const detail = errors.map(({ col, err }) => `${col}: ${err.message}`).join('; ');
    const e = new Error(
      errors.length
        ? `All IH buoy collections failed — ${detail}`
        : 'IH buoy collections returned zero stations',
    );
    // upstreamOutage: TODAS as colecções falharam com erro transitório
    // (5xx/timeout/rede) — o fetch mantém o ficheiro anterior. Qualquer outro
    // caso (2xx com zero estações, 404, payload sem features) é «zero boias
    // listadas»: acionável, o pipeline falha.
    e.code = errors.length > 0 && errors.every(({ err }) => isTransientIhError(err))
      ? 'IH_UPSTREAM_OUTAGE'
      : 'IH_NO_BUOYS';
    throw e;
  }

  return { stations, sourceCollections };
}

/**
 * Extract rows from a getDatawellData response, whatever the wrapper.
 * The FAQ documents a row-shaped payload; be tolerant of array / data / features.
 * @param {unknown} json
 * @returns {Array<Record<string, unknown>>}
 */
function extractWaveRows(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const key of ['data', 'values', 'results', 'features']) {
      const v = json[key];
      if (Array.isArray(v)) {
        // Features carry properties payloads; rows carry raw key-values.
        return v.map((x) => (x && typeof x === 'object' && x.properties ? x.properties : x));
      }
    }
  }
  return [];
}

function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise one wave row. Uses the documented IH field names:
 * date, hm0 (Hs m), tp (peak period s), thtp (peak direction °), hmax, temp.
 * @param {Record<string, unknown>} row
 * @returns {{ date: string, hm0: number, tp?: number, thtp?: number, hmax?: number, temp?: number } | null}
 */
function parseWaveRow(row) {
  if (!row || typeof row !== 'object') return null;
  const hm0 = finiteNumber(row.hm0);
  if (hm0 == null || !isPlausibleHm0(hm0)) return null;
  const date = row.date != null ? String(row.date) : '';
  const parsed = new Date(date).getTime();
  if (!Number.isFinite(parsed)) return null;

  const out = { date: new Date(parsed).toISOString(), hm0 };
  const tp = finiteNumber(row.tp);
  const thtp = finiteNumber(row.thtp);
  const hmax = finiteNumber(row.hmax);
  const temp = finiteNumber(row.temp);
  if (tp != null && tp >= 0) out.tp = tp;
  if (thtp != null && thtp >= 0 && thtp <= 360) out.thtp = thtp;
  if (hmax != null && hmax >= 0 && hmax <= MAX_PLAUSIBLE_HMAX_M) out.hmax = hmax;
  if (temp != null) out.temp = temp;
  return out;
}

/**
 * Latest valid wave row from a getDatawellData response.
 * @param {unknown} json
 * @returns {{ date: string, hm0: number, tp?: number, thtp?: number, hmax?: number, temp?: number } | null}
 */
function pickLatestWave(json) {
  let best = null;
  for (const row of extractWaveRows(json)) {
    const parsed = parseWaveRow(row);
    if (!parsed) continue;
    if (!best || parsed.date > best.date) best = parsed;
  }
  return best;
}

/**
 * UTC window for getDatawellData (latest rows only).
 * @param {number} [hoursBack]
 * @param {number} [nowMs]
 * @returns {{ startDate: string, endDate: string }}
 */
function waveWindow(hoursBack = WAVE_WINDOW_HOURS, nowMs = Date.now()) {
  const end = new Date(nowMs);
  const start = new Date(nowMs - hoursBack * 3_600_000);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

/**
 * Build the getDatawellData request URL for one buoy (the key travels in the
 * X-API-KEY header, never in the query string — so this URL is safe to print
 * and to share with the user for a raw curl with their own key).
 * @param {number} stationId
 * @param {{ startDate: string, endDate: string }} [window]
 * @param {string} [waveBase]
 * @returns {string}
 */
function buildWaveRequestUrl(stationId, window, waveBase = DEFAULT_WAVE_API) {
  return `${waveBase}/getDatawellData?${new URLSearchParams({
    startDate: window.startDate,
    endDate: window.endDate,
    stationId: String(stationId),
  })}`;
}

/**
 * Fetch the latest wave snapshot for one buoy (requires X-API-KEY).
 * @param {string} apiKey
 * @param {number} stationId
 * @param {string} [waveBase]
 * @param {typeof fetch} [fetchImpl]
 * @param {{ startDate: string, endDate: string }} [window]
 * @returns {Promise<object | null>}
 */
async function fetchBuoyWave(
  apiKey,
  stationId,
  waveBase = DEFAULT_WAVE_API,
  fetchImpl = fetch,
  window = waveWindow(),
) {
  if (!apiKey) return null;
  const url = buildWaveRequestUrl(stationId, window, waveBase);
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'X-API-KEY': apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new IhAuthError(res.status, stationId);
  }
  if (!res.ok) throw new IhHttpError(res.status, stationId);
  const json = await res.json();
  return pickLatestWave(json);
}

/**
 * Fetch the FULL wave series for one buoy within [window] (requires X-API-KEY).
 * Same endpoint as fetchBuoyWave but returns ALL parsed rows (newest last),
 * used by the skill/bias layer (Open-Meteo vs IH).
 * @param {string} apiKey
 * @param {number} stationId
 * @param {string} [waveBase]
 * @param {typeof fetch} [fetchImpl]
 * @param {{ startDate: string, endDate: string }} [window]
 * @returns {Promise<Array<{ date: string, hm0: number, tp?: number, thtp?: number, hmax?: number, temp?: number }>>}
 */
async function fetchBuoyWaveSeries(
  apiKey,
  stationId,
  waveBase = DEFAULT_WAVE_API,
  fetchImpl = fetch,
  window = waveWindow(WAVE_WINDOW_HOURS),
) {
  if (!apiKey) return [];
  const url = buildWaveRequestUrl(stationId, window, waveBase);
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'X-API-KEY': apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new IhAuthError(res.status, stationId);
  }
  if (!res.ok) throw new IhHttpError(res.status, stationId);
  const json = await res.json();
  return extractWaveRows(json)
    .map((row) => parseWaveRow(row))
    .filter(Boolean);
}

/**
 * Freshness gate for a buoy reading (rejects stale, future and invalid).
 * @param {string} iso
 * @param {number} [nowMs]
 * @param {number} [maxHours]
 * @returns {boolean}
 */
function isFreshObservation(iso, nowMs = Date.now(), maxHours = MAX_OBS_AGE_HOURS) {
  if (typeof iso !== 'string' || !iso.trim()) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const ageHours = (nowMs - t) / 3_600_000;
  if (ageHours < 0) return false;
  return ageHours <= maxHours;
}

/**
 * Map spots to their nearest ACTIVE buoy (within maxKm). Mirrors fetch-ih-tides.
 * Inactive buoys are skipped so a spot near a dead buoy (e.g. Funchal) falls back
 * to the next live one (e.g. Caniçal) instead of getting no wave data.
 * @param {Array<{ id: string, lat: number, lon: number }>} spots
 * @param {Record<string, object>} stations keyed by idEst
 * @param {number} [maxKm]
 * @returns {Record<string, { idEst: number, stationTitle: string, area?: string, distanceKm: number }>}
 */
function mapSpotsToBuoys(spots, stations, maxKm = MAX_BUOY_MAP_KM) {
  const mapping = {};
  const active = Object.values(stations).filter(
    (s) => s.status !== 'inactive' && s.status !== 'inativa',
  );
  for (const spot of spots) {
    // Spots de arquipélago (Açores/Madeira): a única boia nacional viva do
    // arquipélago fica a 230–280 km — cap alargado (mesma ordem da ponte
    // Silleiro); a distância real fica no payload para a UI mostrar.
    const limit = buoyMapKmFor(spot, maxKm);
    let nearest = null;
    let nearestDist = Infinity;
    for (const station of active) {
      const dist = haversineKm(spot.lat, spot.lon, station.lat, station.lon);
      if (dist < nearestDist && dist <= limit) {
        nearestDist = dist;
        nearest = station;
      }
    }
    if (nearest) {
      mapping[spot.id] = {
        idEst: nearest.idEst,
        stationTitle: nearest.name,
        area: nearest.area,
        distanceKm: Math.round(nearestDist * 10) / 10,
        ...(isIslandSpot(spot) ? { island: true } : {}),
      };
    }
  }
  return mapping;
}

/**
 * Build the `observedWave` payload for a spot, if the mapped buoy has a fresh
 * reading within the attach radius. Distance is always included so the UI can
 * be honest about a deep-water buoy vs the beach line-up.
 * @param {{ idEst: number, distanceKm: number }} mapping
 * @param {object} station station with an optional `latest` wave snapshot
 * @param {{ maxKm?: number, maxAgeHours?: number, nowMs?: number }} [opts]
 * @returns {object | null}
 */
function observedWaveForSpot(mapping, station, opts = {}) {
  const {
    maxKm = MAX_BUOY_ATTACH_KM,
    maxAgeHours = MAX_OBS_AGE_HOURS,
    nowMs = Date.now(),
  } = opts;
  if (!mapping || !station) return null;
  // Spots de ilha (mapping.island): cap de attach alargado — ver mapSpotsToBuoys.
  if (mapping.distanceKm > buoyAttachKmForMapping(mapping, maxKm)) return null;
  const latest = station.latest;
  if (!latest || typeof latest !== 'object') return null;
  if (typeof latest.hm0 !== 'number' || !isPlausibleHm0(latest.hm0)) return null;
  if (!isFreshObservation(latest.date, nowMs, maxAgeHours)) return null;

  return {
    waveHeight: latest.hm0,
    wavePeriod: typeof latest.tp === 'number' ? latest.tp : undefined,
    waveDirection: typeof latest.thtp === 'number' ? latest.thtp : undefined,
    maxWaveHeight:
      typeof latest.hmax === 'number' && latest.hmax <= MAX_PLAUSIBLE_HMAX_M
        ? latest.hmax
        : undefined,
    waterTemp: typeof latest.temp === 'number' ? latest.temp : undefined,
    stationName: station.name,
    stationArea: station.area,
    distanceKm: mapping.distanceKm,
    observedAt: latest.date,
    source: 'ih-buoy',
  };
}

module.exports = {
  DEFAULT_IH_API,
  DEFAULT_WAVE_API,
  IhAuthError,
  isIhAuthError,
  IhHttpError,
  isTransientIhError,
  classifyWaveFetch,
  carryForwardWaveReadings,
  CARRY_FORWARD_MAX_AGE_HOURS,
  buildWaveRequestUrl,
  DEFAULT_COLLECTIONS,
  MAX_BUOY_MAP_KM,
  MAX_BUOY_ATTACH_KM,
  MAX_OBS_AGE_HOURS,
  WAVE_WINDOW_HOURS,
  MAX_PLAUSIBLE_HM0_M,
  MAX_PLAUSIBLE_HMAX_M,
  isPlausibleHm0,
  haversineKm,
  normalizeStation,
  fetchBuoyStations,
  extractWaveRows,
  parseWaveRow,
  pickLatestWave,
  waveWindow,
  fetchBuoyWave,
  fetchBuoyWaveSeries,
  isFreshObservation,
  mapSpotsToBuoys,
  observedWaveForSpot,
};
