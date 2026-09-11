/**
 * IH coastal navigation warnings — `nav_warning_coastal` (Avisos à Navegação
 * Costeiros, em vigor).
 *
 * The IH OGC API (ogcapi.hidrografico.pt, keyless) serves the warnings
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
 * @see https://ogcapi.hidrografico.pt/collections/nav_warning_coastal
 */

const DEFAULT_IH_API = 'https://ogcapi.hidrografico.pt';
const COLLECTION = 'nav_warning_coastal';
/** Avisos locais (portos/barras/estuários) — mesmo schema, prop `local_warning`. */
const LOCAL_COLLECTION = 'nav_warning_local';
/** Offset nos ids dos avisos locais — os ids são sequências por colecção e
 * podem colidir com os costeiros; +1M mantém unicidade no coverage/archive. */
const LOCAL_ID_OFFSET = 1_000_000;
/** Eventos de interação com orcas (pontos, não polígonos) — cobertura por
 * distância ao ponto. A colecção é telemetria viva (eventos até ontem). */
const ORCA_COLLECTION = 'orca_anavnet_point';
const ORCA_ID_OFFSET = 2_000_000;
const ORCA_RADIUS_KM = 25;
const ORCA_MAX_AGE_DAYS = 180;

/** Distância equirectangular em km — suficiente a esta escala costeira. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Data de evento no título IH: «EM 10SET26 AHS 2303 UTC» → DDMMMYY. */
const ORCA_DATE_RE = /(\d{2})(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(\d{2})/i;
const PT_MONTHS = {
  JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5,
  JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11,
};
function parseOrcaEventDate(title) {
  const m = ORCA_DATE_RE.exec(String(title ?? ''));
  if (!m) return null;
  const year = 2000 + Number(m[3]);
  const month = PT_MONTHS[m[2].toUpperCase()];
  return Number.isInteger(month) ? new Date(Date.UTC(year, month, Number(m[1]))) : null;
}

/**
 * Normalise GeoJSON features into the internal warning shape.
 * Accepts both the IH OGC schema (properties.id/coastal_warning/category/url)
 * and the documented ES GeoJSON shape (properties.ref/category/url) — the
 * polygons are flattened from Polygon/MultiPolygon/GeometryCollection.
 * @param {Array<object>} features GeoJSON features
 * @param {'ih' | 'es'} source platform label
 * @param {string} [collection] colecção de origem (default: nav_warning_coastal)
 * @returns {Array<{ id: number, ref: string, category: string, url: string,
 *   source: 'ih' | 'es', collection: string,
 *   polygons: Array<Array<[number, number]>> }>}
 */
function normalizeCoastalWarnings(features, source, collection = COLLECTION, opts = {}) {
  const { pointRadiusKm = 0, orcaDate = false } = opts;
  const out = [];
  for (const f of features) {
    const p = f?.properties ?? {};
    let id = Number(p.id);
    if (!Number.isFinite(id)) continue;
    const g = f?.geometry;
    // Eventos-ponto (orcas): sem polígono — cobertura por distância.
    if (g?.type === 'Point' && pointRadiusKm > 0) {
      const eventAt = orcaDate ? parseOrcaEventDate(p.title) : null;
      if (collection === ORCA_COLLECTION) id += ORCA_ID_OFFSET;
      out.push({
        id,
        ref: String(p.anav ?? p.coastal_warning ?? p.ref ?? `EVENTO ${id}`),
        category: String(p.subcategory ?? p.category ?? 'Animais Marinhos'),
        url: String(p.url ?? ''),
        source,
        collection,
        center: [Number(g.coordinates?.[0]), Number(g.coordinates?.[1])],
        radiusKm: pointRadiusKm,
        eventAt: eventAt ? eventAt.toISOString() : null,
        polygons: [],
      });
      continue;
    }
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
    if (collection === LOCAL_COLLECTION) id += LOCAL_ID_OFFSET;
    out.push({
      id,
      ref: String(p.coastal_warning ?? p.local_warning ?? p.ref ?? `AVISO ${id}`),
      category: String(p.category ?? p.subject ?? ''),
      url: String(p.url ?? ''),
      source,
      collection,
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
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const features = data?.features;
  if (!Array.isArray(features)) throw new Error('no features array');
  return normalizeCoastalWarnings(features, 'ih');
}

/**
 * Fetch in-force LOCAL navigation warnings from the IH OGC API (keyless) —
 * `nav_warning_local` cobre portos, barras e estuários (a colecção costeira
 * só traz a faixa costeira aberta). Mesmo schema; ref vem de
 * `local_warning`, categoria de `subject` quando `category` falta.
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [apiBase]
 * @returns {Promise<Array<object>>} same shape as fetchCoastalWarnings
 */
async function fetchLocalWarnings(
  fetchImpl = fetch,
  apiBase = DEFAULT_IH_API,
) {
  const url = `${apiBase}/collections/${LOCAL_COLLECTION}/items?limit=200&f=json`;
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/geo+json, application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const features = data?.features;
  if (!Array.isArray(features)) throw new Error('no features array');
  return normalizeCoastalWarnings(features, 'ih', LOCAL_COLLECTION);
}

/**
 * Fetch orca-interaction events from the IH OGC API (keyless) —
 * `orca_anavnet_point` são pontos de eventos reportados («INTERACAO HOSTIL
 * COM ORCAS»), com data no título. Cobertura por distância (não polígono):
 * um evento recente a ≤ ORCA_RADIUS_KM do spot é informação de segurança
 * real para surf — houve interacções hostis documentadas na costa PT.
 * Filtra eventos com mais de ORCA_MAX_AGE_DAYS (a colecção acumula desde
 * ~2018; só os últimos 6 meses a ≤25 km são operacionalmente relevantes —
 * janelas maiores marcam quase toda a costa e o sinal vira ruído).
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [apiBase]
 * @returns {Promise<Array<object>>} warnings-ponto (center + radiusKm)
 */
async function fetchOrcaEvents(
  fetchImpl = fetch,
  apiBase = DEFAULT_IH_API,
) {
  const url = `${apiBase}/collections/${ORCA_COLLECTION}/items?limit=500&f=json`;
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/geo+json, application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const features = data?.features;
  if (!Array.isArray(features)) throw new Error('no features array');
  const cutoff = Date.now() - ORCA_MAX_AGE_DAYS * 86_400_000;
  const recent = features.filter((f) => {
    const d = parseOrcaEventDate(f?.properties?.title);
    return d && d.getTime() >= cutoff;
  });
  return normalizeCoastalWarnings(recent, 'ih', ORCA_COLLECTION, {
    pointRadiusKm: ORCA_RADIUS_KM,
    orcaDate: true,
  });
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
    signal: AbortSignal.timeout(30_000),
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
 * Whether a warning covers a spot (any of its polygons contains the point;
 * eventos-ponto cobrem por distância ao centro).
 * @param {{ polygons: Array<Array<[number, number]>>, center?: [number, number], radiusKm?: number }} warning
 * @param {{ lat: number, lon: number }} spot
 * @returns {boolean}
 */
function warningCoversSpot(warning, spot) {
  if (Array.isArray(warning.center) && Number.isFinite(warning.radiusKm)) {
    const [lon, lat] = warning.center;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return haversineKm(spot.lat, spot.lon, lat, lon) <= warning.radiusKm;
    }
    return false;
  }
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
  LOCAL_COLLECTION,
  LOCAL_ID_OFFSET,
  ORCA_COLLECTION,
  ORCA_ID_OFFSET,
  ORCA_RADIUS_KM,
  ORCA_MAX_AGE_DAYS,
  parseOrcaEventDate,
  haversineKm,
  normalizeCoastalWarnings,
  fetchCoastalWarnings,
  fetchLocalWarnings,
  fetchOrcaEvents,
  fetchEsNavWarnings,
  pointInRing,
  warningCoversSpot,
  buildSpotCoverage,
  coastalWarningsForSpot,
  coastalWarningLine,
};
