/**
 * IPMA weather warnings (avisos) — free open-data JSON.
 *
 * - warnings_www.json: one file covering mainland + Açores + Madeira (25 area codes).
 * - distrits-islands.json: area code → concelho + lat/lon + region (for spot mapping).
 *
 * Levels: green (none) / yellow / orange / red. We only bake non-green warnings
 * (active) so the UI never shows "green = ok" noise.
 *
 * @see https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json
 */

const WARNINGS_URL = 'https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json';
const DISTRITS_URL = 'https://api.ipma.pt/open-data/distrits-islands.json';

/** Warning types most relevant to water sports (surf/wind/foil). */
const WATER_SPORT_TYPES = new Set([
  'Agitação Marítima',
  'Vento',
  'Trovoada',
  'Precipitação',
  'Nevoeiro',
]);

const SEVERITY_ORDER = { red: 0, orange: 1, yellow: 2 };

/** Madeira sub-areas absent from distrits-islands.json — coarse coastal refs. */
const AREA_FALLBACK = {
  MCN: { label: 'Madeira — Costa Norte', lat: 32.85, lon: -17.05 },
  MCS: { label: 'Madeira — Costa Sul', lat: 32.68, lon: -16.92 },
  MPS: { label: 'Porto Santo', lat: 33.07, lon: -16.35 },
  MRM: { label: 'Madeira — Regiões Montanhosas', lat: 32.75, lon: -16.95 },
};

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
 * Build one centroid per idAreaAviso from distrits-islands.json.
 * Returns { areaCode: { label, lat, lon } }, plus fallbacks for Madeira sub-areas.
 * @param {{ data?: Array<Record<string, unknown>> } | null} districts
 */
function areaCentroids(districts) {
  const buckets = new Map();
  for (const row of districts?.data ?? []) {
    const code = row?.idAreaAviso;
    const lat = Number(row?.latitude);
    const lon = Number(row?.longitude);
    if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!buckets.has(code)) buckets.set(code, { sumLat: 0, sumLon: 0, n: 0, local: null });
    const b = buckets.get(code);
    b.sumLat += lat;
    b.sumLon += lon;
    b.n += 1;
    if (!b.local && typeof row?.local === 'string') b.local = row.local;
  }

  const out = {};
  for (const [code, b] of buckets) {
    out[code] = { label: b.local ?? String(code), lat: b.sumLat / b.n, lon: b.sumLon / b.n };
  }
  for (const [code, fb] of Object.entries(AREA_FALLBACK)) {
    if (!out[code]) out[code] = { ...fb };
  }
  return out;
}

/**
 * Normalise a raw IPMA warning row.
 * @param {Record<string, unknown>} row
 * @param {Record<string, { label: string }>} centroids
 * @returns {object | null}
 */
function normalizeWarning(row, centroids) {
  const areaCode = row?.idAreaAviso;
  const level = row?.awarenessLevelID;
  const type = row?.awarenessTypeName;
  if (!areaCode || !level || !type) return null;
  if (level === 'green') return null;
  return {
    areaCode: String(areaCode),
    areaLabel: centroids[String(areaCode)]?.label ?? String(areaCode),
    type: String(type),
    level: String(level),
    text: typeof row?.text === 'string' ? row.text.trim() : '',
    startTime: row?.startTime != null ? String(row.startTime) : undefined,
    endTime: row?.endTime != null ? String(row.endTime) : undefined,
    relevant: WATER_SPORT_TYPES.has(String(type)),
  };
}

/**
 * Merge same area+type+level into one entry (IPMA issues one entry per day
 * for multi-day warnings — a summary should show a single wide window),
 * then sort most severe / relevant first.
 */
function dedupeAndSort(warnings) {
  const byKey = new Map();
  for (const w of warnings) {
    const key = `${w.areaCode}|${w.type}|${w.level}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...w });
      continue;
    }
    if (w.startTime && (!prev.startTime || w.startTime < prev.startTime)) {
      prev.startTime = w.startTime;
    }
    if (w.endTime && (!prev.endTime || w.endTime > prev.endTime)) {
      prev.endTime = w.endTime;
    }
    if (!prev.text && w.text) prev.text = w.text;
  }
  const out = [...byKey.values()];
  out.sort((a, b) => {
    const sev = (SEVERITY_ORDER[a.level] ?? 9) - (SEVERITY_ORDER[b.level] ?? 9);
    if (sev !== 0) return sev;
    const rel = (b.relevant ? 1 : 0) - (a.relevant ? 1 : 0);
    if (rel !== 0) return rel;
    return a.type.localeCompare(b.type);
  });
  return out;
}

/**
 * Map spots to their nearest warning area centroid.
 * @param {Array<{ id: string, lat: number, lon: number }>} spots
 * @param {Record<string, { label: string, lat: number, lon: number }>} centroids
 * @returns {Record<string, { areaCode: string, areaLabel: string, distanceKm: number }>}
 */
function mapSpotsToAreas(spots, centroids) {
  const mapping = {};
  for (const spot of spots) {
    let best = null;
    let bestDist = Infinity;
    for (const [code, c] of Object.entries(centroids)) {
      const d = haversineKm(spot.lat, spot.lon, c.lat, c.lon);
      if (d < bestDist) {
        bestDist = d;
        best = { areaCode: code, areaLabel: c.label, distanceKm: Math.round(d * 10) / 10 };
      }
    }
    if (best) mapping[spot.id] = best;
  }
  return mapping;
}

/**
 * Build the final warnings.json payload.
 * @param {unknown} warningsRaw raw warnings_www.json
 * @param {unknown} districtsRaw raw distrits-islands.json
 * @param {Array<{ id: string, lat: number, lon: number }>} spots
 * @param {Date} [now]
 */
function buildWarningsPayload(warningsRaw, districtsRaw, spots, now = new Date()) {
  const centroids = areaCentroids(districtsRaw);
  const active = dedupeAndSort(
    (Array.isArray(warningsRaw) ? warningsRaw : [])
      .map((r) => normalizeWarning(r, centroids))
      .filter(Boolean),
  );

  const areaMapping = mapSpotsToAreas(spots, centroids);
  const byArea = new Map();
  for (const w of active) {
    if (!byArea.has(w.areaCode)) byArea.set(w.areaCode, []);
    byArea.get(w.areaCode).push(w);
  }

  const spotWarnings = {};
  for (const spot of spots) {
    const m = areaMapping[spot.id];
    const list = m ? byArea.get(m.areaCode) : undefined;
    if (list && list.length) spotWarnings[spot.id] = list;
  }

  return {
    source: 'ipma',
    fetchedAt: now.toISOString(),
    warnings: active,
    spotWarnings,
  };
}

module.exports = {
  WARNINGS_URL,
  DISTRITS_URL,
  WATER_SPORT_TYPES,
  AREA_FALLBACK,
  SEVERITY_ORDER,
  haversineKm,
  areaCentroids,
  normalizeWarning,
  dedupeAndSort,
  mapSpotsToAreas,
  buildWarningsPayload,
};
