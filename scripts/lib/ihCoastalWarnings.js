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
 * Normalise GeoJSON features into the internal warning shape.
 * Accepts both the IH OGC schema (properties.id/coastal_warning/category/url)
 * and the documented ES GeoJSON shape (properties.ref/category/url) — the
 * polygons are flattened from Polygon/MultiPolygon/GeometryCollection.
 * @param {Array<object>} features GeoJSON features
 * @param {'ih' | 'es'} source platform label
 * @returns {Array<{ id: number, ref: string, category: string, url: string,
 *   source: 'ih' | 'es', polygons: Array<Array<[number, number]>> }>}
 */
function normalizeCoastalWarnings(features, source) {
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
      ref: String(p.coastal_warning ?? p.ref ?? `AVISO ${id}`),
      category: String(p.category ?? ''),
      url: String(p.url ?? ''),
      source,
      polygons,
    });
  }
  return out;
}

/**
 * Fetch all in-force coastal warnings from the IH OGC API (keyless).
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [apiBase]
 * @returns {Promise<Array<{ id: number, ref: string, category: string,
 *   url: string, source: 'ih', polygons: Array<Array<[number, number]>> }>>}
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
  return normalizeCoastalWarnings(features, 'ih');
}

/**
 * Fetch the Spanish «Avisos a los navegantes» (cross-border NW) from a
 * configurable GeoJSON source (ES_NAV_WARNINGS_URL). Same normalized shape as
 * the IH layer, marked source:'es' so the section can label them separately.
 *
 * NOTE (investigação 2026-08-31): a fonte oficial espanhola (Instituto
 * Hidrográfico de la Marina / Armada) publica os avisos como boletins PDF sem
 * API de geometria keyless, o Salvamento Marítimo não expõe feed estável e os
 * avisos de Puertos del Estado são meteorológicos (outra categoria). Quando
 * existir um feed GeoJSON estável, basta apontar ES_NAV_WARNINGS_URL — o resto
 * da camada (point-in-polygon, secção, mapa) já funciona. Fallback de TEXTO
 * (NAVAREA III em vigor / NAVTEX / METAREA II) investigado e documentado em
 * docs/ES_NAV_WARNINGS.md — inclui o plano de parser de tabela HTML.
 *
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [url] ES_NAV_WARNINGS_URL — sem URL devolve lista vazia.
 * @returns {Promise<Array<{ id: number, ref: string, category: string,
 *   url: string, source: 'es', polygons: Array<Array<[number, number]>> }>>}
 */
async function fetchEsNavWarnings(fetchImpl = fetch, url = '') {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) return [];
  const res = await fetchImpl(trimmed, {
    headers: { Accept: 'application/geo+json, application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const features = data?.features;
  if (!Array.isArray(features)) throw new Error('no features array');
  return normalizeCoastalWarnings(features, 'es');
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

/**
 * Warnings covering a spot, resolved from the baked coverage map
 * (coverage[spotId] → warning ids). Shared by evaluate-alerts (safety line)
 * and any script consumer — same shape as the UI-side warningsForSpot.
 *
 * @param {{ warnings?: Array<{ id: number, ref: string, category: string }>, coverage?: Record<string, Array<number>> } | null | undefined} data
 * @param {string} spotId
 * @returns {Array<{ id: number, ref: string, category: string, url: string, source?: string }>}
 */
function coastalWarningsForSpot(data, spotId) {
  const ids = data?.coverage?.[spotId];
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const byId = new Map((data.warnings || []).map((w) => [w.id, w]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Compact «Avisos à Navegação Costeiros (IH)» line for the alert/Telegram
 * safety note — same wording as the spot-page block. Returns '' when none.
 *
 * @param {Array<{ id: number, ref: string, category?: string }>} warnings
 * @param {boolean} isPt
 * @returns {string}
 */
function coastalWarningLine(warnings, isPt) {
  if (!warnings || warnings.length === 0) return '';
  const label = isPt
    ? 'Avisos à Navegação Costeiros (IH)'
    : 'Coastal navigation warnings (IH)';
  const refs = warnings
    .map(
      (w) =>
        (w.ref || `AVISO ${w.id}`) + (w.category ? ` — ${w.category}` : ''),
    )
    .join(' · ');
  return `⚓ ${label}: ${refs}`;
}

module.exports = {
  DEFAULT_IH_API,
  COLLECTION,
  normalizeCoastalWarnings,
  fetchCoastalWarnings,
  fetchEsNavWarnings,
  pointInRing,
  warningCoversSpot,
  buildSpotCoverage,
  coastalWarningsForSpot,
  coastalWarningLine,
};
