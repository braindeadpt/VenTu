/**
 * MeteoAlarm (EUMETNET) weather warnings — secondary source, fallback when
 * the IPMA open-data API is down.
 *
 * Particulars use MeteoGate (`METEOGATE_API_KEY`, query `apikey`):
 *
 *   GET https://api.meteogate.eu/warnings/collections/warnings/locations/PT
 *       ?datetime=<now-24h>/<now>&language=pt-PT
 *
 * (`datetime` is the sent window and must be < 24 h; HTTP 204 = no features.)
 * Re-users may still use the direct EDR (`METEOALARM_API_KEY`, Bearer):
 *
 *   GET https://api.meteoalarm.org/edr/v1/collections/warnings/locations/PT?active=true
 *
 * Both return a GeoJSON FeatureCollection; each Feature's geometry is the warning
 * area bounding box and its `links` point to the full CAP Oasis 1.2 payload
 * (JSON, signed URLs, fetchable without auth).
 * Warning metadata (event, severity, awareness_type/level, onset, expires,
 * areaDesc) is read from that CAP payload, normalised to the SAME shape as
 * the IPMA layer so the UI, badges and Dawn Patrol work unchanged — only the
 * `source` field differs ('meteoalarm' vs 'ipma').
 *
 * Spot → warning mapping is point-in-bounding-box (bbox of the warning area),
 * coarser than the IPMA district-centroid mapping but safe for warnings
 * (over-covering beats missing a warning).
 *
 * @see https://api.meteoalarm.org/edr/v1/faq
 * @see docs/METEOALARM_API_KEY.md
 */

const EDR_BASE = 'https://api.meteoalarm.org/edr/v1';
const WARNINGS_URL = `${EDR_BASE}/collections/warnings/locations`;
/** Public MeteoGate gateway (same EDR collection, `apikey` query). */
const METEOGATE_EDR_BASE = 'https://api.meteogate.eu/warnings';
const METEOGATE_WARNINGS_URL = `${METEOGATE_EDR_BASE}/collections/warnings/locations`;
/** Sent-window must be strictly under 24 h (MeteoGate `sent_range` rule). */
const METEOGATE_SENT_WINDOW_MS = 24 * 3600 * 1000 - 1000;
/** MeteoAlarm location code for Portugal (MQTT topics use warnings-PT). */
const PT_LOCATION = 'PT';
/** Language for CAP descriptions; falls back gracefully when unsupported. */
const CAP_LANGUAGE = 'pt-PT';

/** Same water-sport relevant types as the IPMA layer (keeps UI identical). */
const WATER_SPORT_TYPES = new Set([
  'Agitação Marítima',
  'Vento',
  'Trovoada',
  'Precipitação',
  'Nevoeiro',
]);

/**
 * EUMETNET MeteoAlarm awareness_type codes → our PT type names.
 * @see https://api-test.meteoalarm.org/edr/v1 (CAP parameters docs)
 */
const AWARENESS_TYPE_MAP = {
  1: 'Vento',
  2: 'Neve',
  3: 'Trovoada',
  4: 'Nevoeiro',
  5: 'Tempo Quente',
  6: 'Tempo Frio',
  7: 'Agitação Marítima',
  8: 'Incêndio Rural',
  9: 'Avalanches',
  10: 'Precipitação',
  11: 'Precipitação',
  12: 'Precipitação',
  13: 'Agitação Marítima',
  14: 'Agitação Marítima',
  15: 'Agitação Marítima',
  16: 'Nevoeiro',
  17: 'Tempo Quente',
  18: 'Tempo Frio',
  19: 'Neve',
  20: 'Neve',
  21: 'Vento',
  22: 'Agitação Marítima',
  25: 'Trovoada',
  26: 'Trovoada',
  27: 'Vento',
  28: 'Tempo Frio',
  29: 'Neve',
};

/** CAP severity → our level. Minor is dropped (matches IPMA "green skipped"). */
const CAP_SEVERITY_TO_LEVEL = {
  Extreme: 'red',
  Severe: 'orange',
  Moderate: 'yellow',
  Minor: null,
  Unknown: 'yellow',
};

/** awareness_level parameter → our level (2=yellow, 3=orange, 4=red). */
const CAP_AWARENESS_LEVEL_MAP = { 1: null, 2: 'yellow', 3: 'orange', 4: 'red' };

function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Prefer MeteoGate (particulars) over the direct EDR Bearer (re-users).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ mode: 'meteogate' | 'meteoalarm', key: string } | null}
 */
function resolveWarningsAuth(env = process.env) {
  const gate = env.METEOGATE_API_KEY?.trim();
  if (gate) return { mode: 'meteogate', key: gate };
  const alarm = env.METEOALARM_API_KEY?.trim();
  if (alarm) return { mode: 'meteoalarm', key: alarm };
  return null;
}

/**
 * @param {string | { mode: 'meteogate' | 'meteoalarm', key: string } | null | undefined} tokenOrAuth
 * @returns {{ mode: 'meteogate' | 'meteoalarm', key: string } | null}
 */
function normalizeAuth(tokenOrAuth) {
  if (tokenOrAuth && typeof tokenOrAuth === 'object' && tokenOrAuth.key) {
    return tokenOrAuth;
  }
  if (typeof tokenOrAuth === 'string' && tokenOrAuth.trim()) {
    return { mode: 'meteoalarm', key: tokenOrAuth.trim() };
  }
  return null;
}

/** ISO interval `start/end` covering the last ~24 h (exclusive of a full day). */
function sentDatetimeRange(nowMs = Date.now()) {
  const end = new Date(nowMs);
  const start = new Date(nowMs - METEOGATE_SENT_WINDOW_MS);
  return `${start.toISOString()}/${end.toISOString()}`;
}

function redactAuthFromUrl(url) {
  return String(url).replace(/([?&]apikey=)[^&]*/gi, '$1REDACTED');
}

/** Leading integer from CAP `awareness_*` values (`"7"` or `"7; coastalevent"`). */
function parseAwarenessCode(value) {
  if (value == null) return undefined;
  const m = String(value).trim().match(/^(\d+)/);
  return m ? m[1] : String(value).trim();
}

/**
 * EDR Feature → CAP payload URL (signed, fetchable without auth).
 * Prefers the JSON link; falls back to hubLink.
 * @param {object} feature GeoJSON feature from the locations query
 * @returns {string | null}
 */
function capJsonUrl(feature) {
  const links = Array.isArray(feature?.links) ? feature.links : [];
  for (const l of links) {
    if ((l?.rel === 'json' || l?.type?.includes('json')) && typeof l?.href === 'string') {
      return l.href;
    }
  }
  if (typeof feature?.properties?.hubLink === 'string') return feature.properties.hubLink;
  return null;
}

/**
 * Flatten a CAP `parameter`/`geocode` array into a map.
 * CAP entries are { valueName, value } — accept both camel and Oasis keys.
 * @param {Array<Record<string, unknown>> | undefined} entries
 * @returns {Record<string, string>}
 */
function capParamMap(entries) {
  const out = {};
  for (const e of entries ?? []) {
    const name = e?.valueName ?? e?.value_name;
    const value = e?.value;
    if (typeof name === 'string' && value !== undefined) out[name] = String(value);
  }
  return out;
}

/**
 * Normalise one CAP alert into our warning shape.
 * @param {object} cap CAP Oasis 1.2 payload (JSON)
 * @param {object} feature EDR feature (for alertId/OBJECTID fallback ids)
 * @param {string} [language] requested CAP language
 * @returns {object | null}
 */
function capToWarning(cap, feature, language = CAP_LANGUAGE) {
  if (!cap || typeof cap !== 'object') return null;
  const infos = Array.isArray(cap.info) ? cap.info : [];
  let info = infos[0];
  if (language && infos.length > 1) {
    const localized = infos.find((i) => i?.language === language);
    if (localized) info = localized;
  }
  if (!info || typeof info !== 'object') return null;

  const areas = Array.isArray(info.area) ? info.area : [];
  const area = areas[0] ?? {};
  const params = {
    ...capParamMap(info.parameter),
    ...capParamMap(area?.parameter),
  };

  const awarenessType = parseAwarenessCode(
    params.awareness_type ?? params['awareness-type'] ?? params.type,
  );
  const awarenessLevel = parseAwarenessCode(
    params.awareness_level ?? params['awareness-level'],
  );

  const type =
    (awarenessType !== undefined ? AWARENESS_TYPE_MAP[String(awarenessType)] : undefined) ||
    (typeof info.event === 'string' ? info.event : undefined);
  if (!type) return null;

  // Minor/green → skipped (same as the IPMA layer dropping green).
  if (typeof info.severity === 'string' && info.severity === 'Minor') return null;
  if (awarenessLevel !== undefined && String(awarenessLevel) === '1') return null;

  const severityLevel =
    typeof info.severity === 'string' ? CAP_SEVERITY_TO_LEVEL[info.severity] ?? 'yellow' : null;
  const level = awarenessLevel !== undefined
    ? CAP_AWARENESS_LEVEL_MAP[String(awarenessLevel)] ?? severityLevel ?? 'yellow'
    : severityLevel ?? 'yellow';
  if (!level) return null;

  const areaCode =
    (typeof area?.areaDesc === 'string' ? area.areaDesc : null) ||
    (typeof feature?.properties?.alertId === 'string' ? feature.properties.alertId : null) ||
    (typeof feature?.id === 'string' ? feature.id : null) ||
    'PT';

  return {
    areaCode: String(areaCode),
    areaLabel:
      (typeof area?.areaDesc === 'string' ? area.areaDesc : null) ||
      (typeof feature?.properties?.countryCode === 'string' ? feature.properties.countryCode : null) ||
      'PT',
    type: String(type),
    level: String(level),
    text:
      (typeof info?.description === 'string' && info.description.trim()
        ? info.description.trim()
        : typeof info?.headline === 'string' && info.headline.trim()
          ? info.headline.trim()
          : '') || '',
    startTime:
      typeof info?.onset === 'string' ? new Date(info.onset).toISOString() : undefined,
    endTime:
      typeof info?.expires === 'string' ? new Date(info.expires).toISOString() : undefined,
    relevant: WATER_SPORT_TYPES.has(String(type)),
  };
}

/**
 * Point-in-polygon for a GeoJSON Polygon ring (ray casting, lon/lat order).
 * The EDR warning geometry is a bounding box polygon, so a simple bbox check
 * would do — this handles both exact polygons and boxes.
 * @param {{ lat: number, lon: number }} point
 * @param {object} feature
 * @returns {boolean}
 */
function pointInFeature(point, feature) {
  if (
    !point ||
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lon)
  ) return false;
  const rings = feature?.geometry?.coordinates;
  if (!Array.isArray(rings) || rings.length === 0) return false;
  const ring = rings[0];
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Fetch one page of EDR features for a location.
 * A string token is treated as a direct MeteoAlarm Bearer (tests / re-users).
 * @param {string | { mode: 'meteogate' | 'meteoalarm', key: string }} tokenOrAuth
 * @param {string} [location]
 * @param {number} [page]
 * @param {typeof fetch} [fetchImpl]
 * @param {{ nowMs?: number }} [opts]
 * @returns {Promise<object[]>} features
 */
async function fetchFeaturesPage(tokenOrAuth, location = PT_LOCATION, page = 1, fetchImpl = fetch, opts = {}) {
  const auth = normalizeAuth(tokenOrAuth);
  if (!auth) throw new Error('MeteoAlarm/MeteoGate: missing API key');
  const nowMs = opts.nowMs ?? Date.now();
  const base = auth.mode === 'meteogate' ? METEOGATE_WARNINGS_URL : WARNINGS_URL;
  const u = new URL(`${base}/${encodeURIComponent(location)}`);
  u.searchParams.set('language', CAP_LANGUAGE);
  u.searchParams.set('page', String(page));
  if (auth.mode === 'meteogate') {
    u.searchParams.set('datetime', sentDatetimeRange(nowMs));
    u.searchParams.set('apikey', auth.key);
  } else {
    u.searchParams.set('active', 'true');
  }
  const headers = { Accept: 'application/geo+json, application/json' };
  if (auth.mode === 'meteoalarm') headers.Authorization = `Bearer ${auth.key}`;
  const res = await fetchImpl(u.toString(), { headers });
  if (res.status === 204) return [];
  if (res.status === 401 || res.status === 403) {
    throw new Error(`MeteoAlarm HTTP ${res.status} — token inválido ou sem permissão`);
  }
  if (!res.ok) throw new Error(`MeteoAlarm HTTP ${res.status} para ${redactAuthFromUrl(u.toString())}`);
  const data = await res.json();
  return Array.isArray(data?.features) ? data.features : [];
}

/**
 * Fetch ALL active warnings for Portugal (paginated, cap 10 pages).
 * @param {string} token
 * @param {{ fetchImpl?: typeof fetch, nowMs?: number }} [opts]
 * @returns {Promise<Array<{ feature: object, cap: object | null, url: string | null }>>}
 */
async function fetchPortugalWarnings(token, opts = {}) {
  const { fetchImpl = fetch, nowMs = Date.now() } = opts;
  const items = [];
  for (let page = 1; page <= 10; page++) {
    const features = await fetchFeaturesPage(token, PT_LOCATION, page, fetchImpl, { nowMs });
    for (const f of features) {
      items.push({ feature: f, cap: null, url: capJsonUrl(f) });
    }
    if (features.length < 100) break; // last page
  }

  const results = await Promise.allSettled(
    items.map(async (item) => {
      if (!item.url) return { ...item, cap: null };
      const res = await fetchImpl(item.url, {
        headers: { Accept: 'application/json', 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)' },
      });
      if (!res.ok) throw new Error(`CAP HTTP ${res.status}`);
      return { ...item, cap: await res.json() };
    }),
  );

  const out = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out.push(r.value);
    else {
      out.push({ ...items[i], cap: null });
      console.warn(`  ⚠️ MeteoAlarm CAP ${items[i].url?.slice(0, 60)}…: ${r.reason?.message ?? r.reason}`);
    }
  });
  return out;
}

/**
 * Build the final warnings.json payload from MeteoAlarm data.
 * Shape matches the IPMA layer + `source: 'meteoalarm'`.
 * @param {string} token
 * @param {Array<{ id: string, lat: number, lon: number }>} spots
 * @param {{ fetchImpl?: typeof fetch, nowMs?: number }} [opts]
 * @returns {Promise<{ source: 'meteoalarm', fetchedAt: string, warnings: object[], spotWarnings: Record<string, object[]> }>}
 */
async function buildMeteoAlarmPayload(token, spots, opts = {}) {
  const { nowMs = Date.now() } = opts;
  const items = await fetchPortugalWarnings(token, opts);

  // Warning + the feature whose bbox covers the spot (pre-parsed once).
  const warnings = [];
  for (const { feature, cap } of items) {
    if (!cap) continue;
    const w = capToWarning(cap, feature, CAP_LANGUAGE);
    if (!w) continue;
    const expires = w.endTime ? new Date(w.endTime).getTime() : Infinity;
    if (expires < nowMs) continue; // expired — never show
    warnings.push({ ...w, feature });
  }

  const spotWarnings = {};
  for (const spot of spots) {
    const covered = warnings
      .filter((w) => pointInFeature(spot, w.feature))
      .map(({ feature: _feature, ...rest }) => rest);
    if (covered.length) spotWarnings[spot.id] = covered;
  }

  return {
    source: 'meteoalarm',
    fetchedAt: new Date(nowMs).toISOString(),
    warnings: warnings.map(({ feature: _feature, ...rest }) => rest),
    spotWarnings,
  };
}

module.exports = {
  EDR_BASE,
  WARNINGS_URL,
  METEOGATE_EDR_BASE,
  METEOGATE_WARNINGS_URL,
  METEOGATE_SENT_WINDOW_MS,
  PT_LOCATION,
  CAP_LANGUAGE,
  WATER_SPORT_TYPES,
  AWARENESS_TYPE_MAP,
  CAP_SEVERITY_TO_LEVEL,
  CAP_AWARENESS_LEVEL_MAP,
  resolveWarningsAuth,
  normalizeAuth,
  sentDatetimeRange,
  redactAuthFromUrl,
  parseAwarenessCode,
  capJsonUrl,
  capParamMap,
  capToWarning,
  pointInFeature,
  fetchFeaturesPage,
  fetchPortugalWarnings,
  buildMeteoAlarmPayload,
};
