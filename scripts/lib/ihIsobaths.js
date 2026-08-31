/**
 * IH coastal isobaths — `depcnt_8_16_30` (Linhas Isobatimétricas 8/16/30 m).
 *
 * The IH OGC API (api-features.hidrografico.pt, keyless) serves 152
 * MultiLineString features, one per depth contour segment, with a `depth`
 * property (8 | 16 | 30). This lib computes, for each spot, the shortest
 * distance from the shore point to the nearest contour of each depth — i.e.
 * «the seabed reaches 8 m about X m from the beach» — a real-bathymetry
 * readout for the spot page.
 *
 * Distance is measured point→segment (equirectangular projection, good to
 * ~0.1% at these scales) across ALL segments of the MultiLineString. The
 * result feeds public/data/spot-isobaths.json and the IsobathsStrip UI.
 *
 * @see https://api-features.hidrografico.pt/collections/depcnt_8_16_30
 */

const DEFAULT_IH_API = 'https://api-features.hidrografico.pt';
const COLLECTION = 'depcnt_8_16_30';
/** Depths served by the collection, in the order shown in the UI. */
const DEPTHS = [8, 16, 30];
/** Ignore contours farther than this (km) — a spot far from any 30 m line
 *  simply has no depth readout (deep offshore or data gap). */
const MAX_DISTANCE_KM = 25;

/**
 * Fetch all isobath features from the IH OGC API (keyless).
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [apiBase]
 * @returns {Promise<Array<{ id: unknown, depth: number, coords: Array<Array<Array<number>>> }>>}
 *   coords = list of line strings ([lon, lat, z] vertices), flattened from
 *   MultiLineString / LineString geometries.
 */
async function fetchIsobathFeatures(
  fetchImpl = fetch,
  apiBase = DEFAULT_IH_API,
) {
  // 152 features total — a single limit=300 page covers the collection.
  const url = `${apiBase}/collections/${COLLECTION}/items?limit=300&f=json`;
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/geo+json, application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const features = data?.features;
  if (!Array.isArray(features)) throw new Error('no features array');

  const out = [];
  for (const f of features) {
    const depth = Number(f?.properties?.depth);
    if (!Number.isFinite(depth)) continue;
    const g = f?.geometry;
    const coords = [];
    if (g?.type === 'MultiLineString') {
      for (const line of g.coordinates ?? []) {
        if (Array.isArray(line)) coords.push(line);
      }
    } else if (g?.type === 'LineString') {
      if (Array.isArray(g.coordinates)) coords.push(g.coordinates);
    }
    if (coords.length === 0) continue;
    out.push({ id: f.id, depth, coords });
  }
  return out;
}

/** km per degree of latitude (equirectangular local projection). */
function kmPerDeg(latRad) {
  const R = 6371;
  return { lat: R * (Math.PI / 180), lon: R * (Math.PI / 180) * Math.cos(latRad) };
}

/**
 * Shortest distance from a point to a great-circle segment (km), via local
 * equirectangular projection — accurate to well under 1% for segments < 25 km.
 * @param {number} lat
 * @param {number} lon
 * @param {[number, number]} a [lat, lon]
 * @param {[number, number]} b [lat, lon]
 * @returns {number} km
 */
function distancePointToSegmentKm(lat, lon, a, b) {
  const latRad = (lat * Math.PI) / 180;
  const k = kmPerDeg(latRad);
  const px = (lon - a[1]) * k.lon;
  const py = (lat - a[0]) * k.lat;
  const qx = (b[1] - a[1]) * k.lon;
  const qy = (b[0] - a[0]) * k.lat;
  const len2 = qx * qx + qy * qy;
  if (len2 === 0) return Math.hypot(px, py);
  let t = (px * qx + py * qy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * qx, py - t * qy);
}

/**
 * Distance from a spot to the nearest contour of ONE depth (km).
 * @param {{ lat: number, lon: number }} spot
 * @param {Array<Array<[number, number, number]>>} lines line strings of that depth
 * @returns {number} km (Infinity if no lines)
 */
function distanceToNearestContourKm(spot, lines) {
  let best = Infinity;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      // Vertex is [lon, lat, z] — project to [lat, lon].
      const a = [line[i][1], line[i][0]];
      const b = [line[i + 1][1], line[i + 1][0]];
      const d = distancePointToSegmentKm(spot.lat, spot.lon, a, b);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * For a spot, distances to the 8/16/30 m contours (km). Missing/too-far
 * depths are omitted.
 * @param {{ lat: number, lon: number }} spot
 * @param {Array<{ depth: number, coords: Array<Array<Array<number>>> }>} features
 * @param {{ maxKm?: number }} [opts]
 * @returns {Record<number, number>} depth → km (rounded to 2 decimals)
 */
function isobathDistancesForSpot(spot, features, opts = {}) {
  const { maxKm = MAX_DISTANCE_KM } = opts;
  const byDepth = {};
  for (const f of features) {
    (byDepth[f.depth] ??= []).push(...f.coords);
  }
  const out = {};
  for (const depth of DEPTHS) {
    const lines = byDepth[depth];
    if (!lines || lines.length === 0) continue;
    const km = distanceToNearestContourKm(spot, lines);
    if (Number.isFinite(km) && km <= maxKm) out[depth] = Math.round(km * 100) / 100;
  }
  return out;
}

/**
 * Build the full spot→depths map for the JSON output.
 * @param {Array<{ id: string, lat: number, lon: number }>} spots
 * @param {Array<{ depth: number, coords: Array<Array<Array<number>>> }>} features
 * @param {{ maxKm?: number }} [opts]
 * @returns {Record<string, Record<number, number>>}
 */
function buildSpotIsobaths(spots, features, opts = {}) {
  const out = {};
  for (const spot of spots) {
    const depths = isobathDistancesForSpot(spot, features, opts);
    if (Object.keys(depths).length > 0) out[spot.id] = depths;
  }
  return out;
}

module.exports = {
  DEFAULT_IH_API,
  COLLECTION,
  DEPTHS,
  MAX_DISTANCE_KM,
  fetchIsobathFeatures,
  distancePointToSegmentKm,
  distanceToNearestContourKm,
  isobathDistancesForSpot,
  buildSpotIsobaths,
};
