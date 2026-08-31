/**
 * IH coastal navigation warnings — `nav_warning_coastal` (Avisos à Navegação
 * Costeiros, em vigor).
 *
 * The IH OGC API (api-features.hidrografico.pt, keyless) serves the warnings
 * currently in force (15 features at write time), each with:
 *   - coastal_warning — ANAV reference, e.g. «ANAV NR 1577/26»;
 *   - category — e.g. «Requisitos de segurança maritima»;
 *   - url — detail page on geoanavnet.hidrografico.pt;
 *   - geometry — GeometryCollection of Polygons covering the affected area.
 *
 * This lib builds a per-spot coverage map (point-in-polygon via ray casting),
 * so the spot page can show the navigation warnings that actually cover it —
 * a complement to IPMA/MeteoAlarm (meteorology) focused on maritime safety.
 *
 * @see https://api-features.hidrografico.pt/collections/nav_warning_coastal
 */

const DEFAULT_IH_API = 'https://api-features.hidrografico.pt';
const COLLECTION = 'nav_warning_coastal';

/**
 * Fetch all in-force coastal warnings from the IH OGC API (keyless).
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [apiBase]
 * @returns {Promise<Array<{ id: number, ref: string, category: string,
 *   url: string, polygons: Array<Array<[number, number]>> }>>}
 *   polygons = list of rings ([lon, lat] vertices) flattened from the
 *   GeometryCollection.
 */
async function fetchCoastalWarnings(
  fetchImpl = fetch,
  apiBase = DEFAULT_IH_API,
) {
  const url = `${apiBase}/collections/${COLLECTION}/items?limit=200&f=json`;
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/geo+json, application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const features = data?.features;
  if (!Array.isArray(features)) throw new Error('no features array');

  const out = [];
  for (const f of features) {
    const p = f?.properties ?? {};
    const id = Number(p.id);
    if (!Number.isFinite(id)) continue;
    const g = f?.geometry;
    const polygons = [];
    const collect = (geom) => {
      if (!geom) return;
      if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates ?? []) {
          if (Array.isArray(ring)) polygons.push(ring);
        }
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates ?? []) {
          for (const ring of poly ?? []) {
            if (Array.isArray(ring)) polygons.push(ring);
          }
        }
      } else if (geom.type === 'GeometryCollection') {
        for (const sub of geom.geometries ?? []) collect(sub);
      }
    };
    collect(g);
    if (polygons.length === 0) continue;
    out.push({
      id,
      ref: String(p.coastal_warning ?? `ANAV ${id}`),
      category: String(p.category ?? ''),
      url: String(p.url ?? ''),
      polygons,
    });
  }
  return out;
}

/**
 * Point-in-polygon (ray casting). Ring is [lon, lat] vertices (closed or not).
 * @param {number} lat
 * @param {number} lon
 * @param {Array<[number, number]>} ring
 * @returns {boolean}
 */
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Whether a warning covers a spot (any of its polygons contains the point).
 * @param {{ polygons: Array<Array<[number, number]>> }} warning
 * @param {{ lat: number, lon: number }} spot
 * @returns {boolean}
 */
function warningCoversSpot(warning, spot) {
  for (const ring of warning.polygons) {
    if (pointInRing(spot.lat, spot.lon, ring)) return true;
  }
  return false;
}

/**
 * Per-spot coverage map.
 * @param {Array<{ id: string, lat: number, lon: number }>} spots
 * @param {Array<{ id: number, ref: string, category: string, url: string, polygons: Array }>} warnings
 * @returns {Record<string, Array<number>>} spotId → warning ids covering it
 */
function buildSpotCoverage(spots, warnings) {
  const out = {};
  for (const spot of spots) {
    const ids = warnings
      .filter((w) => warningCoversSpot(w, spot))
      .map((w) => w.id);
    if (ids.length > 0) out[spot.id] = ids;
  }
  return out;
}

module.exports = {
  DEFAULT_IH_API,
  COLLECTION,
  fetchCoastalWarnings,
  pointInRing,
  warningCoversSpot,
  buildSpotCoverage,
};
