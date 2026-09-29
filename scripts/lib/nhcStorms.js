'use strict';
/**
 * NHC tropical storms → `storms.json` (B0 do docs/STORM-STUDY.md).
 *
 * Fontes (keyless, oficiais NOAA):
 *  - `CurrentStorms.json` — lista activa (posição, classe, vento, movimento)
 *  - `storm_graphics/api/{STORM}_{adv}adv_{TRACK|CONE}.kmz` — track prevista
 *    e cone de incerteza (KMZ = zip com um `doc.kml`).
 *
 * O unzip do KMZ é feito à mão com `zlib.inflateRawSync` — local file
 * headers PK\x03\x04 + deflate — para não trazer uma dependência de zip.
 *
 * Filosofia: o fetcher nunca inventa. Se o KMZ falhar, a tempestade entra
 * com `track: null`/`cone: null` (o mapa mostra marcador + vector de
 * movimento — informação real, nunca uma trajectória fabricada).
 */

const zlib = require('zlib');

/** Rectângulo de interesse Ventu: Ibéria + mar até Açores/Madeira e
 *  arredores (docs/STORM-STUDY.md §âmbito). Um furacão a 48°W cujo cone
 *  toca os Açores interessa — o centro não precisa de estar dentro. */
const REGION = { latMin: 25, latMax: 50, lonMin: -48, lonMax: -4 };

/** Remove a margem de segurança aplicada ao teste «centro na região» —
 *  tempestades de Cabo Verde também nos tocam. */
const REGION_CENTER_MARGIN = 8; // graus

// ─── KMZ: unzip mínimo ────────────────────────────────────────────────────

/**
 * Extrai o conteúdo XML do primeiro ficheiro dentro de um KMZ/zip.
 * Percorre os local file headers (PK\x03\x04) — robusto a archives sem
 * data descriptors complicados porque lê sempre o tamanho comprimido do
 * header central? Não — o local header traz o tamanho real nos zips do
 * NHC (sem flag de data descriptor); se o bit 3 de flags estiver ligado
 * cai para o central directory. Para o KMZ de ~8 KB do NHC basta o
 * caminho simples.
 * @param {Buffer} buf
 * @returns {string|null} conteúdo XML ou null
 */
function unzipKmz(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) return null;
  // Central directory → sizes fiáveis mesmo com data descriptor.
  const eocd = buf.lastIndexOf(Buffer.from('PK\x05\x06', 'binary'));
  if (eocd < 0) return null;
  const cdEntries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let cd = cdOffset;
  for (let i = 0; i < cdEntries; i += 1) {
    if (buf.readUInt32LE(cd) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cd + 10);
    const compSize = buf.readUInt32LE(cd + 20);
    const nameLen = buf.readUInt16LE(cd + 28);
    const extraLen = buf.readUInt16LE(cd + 30);
    const commentLen = buf.readUInt16LE(cd + 32);
    const localOff = buf.readUInt32LE(cd + 42);
    const name = buf.slice(cd + 46, cd + 46 + nameLen).toString('utf8');
    // Local header: saltar nome+extra locais (podem diferir dos do CD).
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.slice(dataStart, dataStart + compSize);
    let out = null;
    try {
      if (method === 8) out = zlib.inflateRawSync(data);
      else if (method === 0) out = data;
    } catch {
      out = null;
    }
    cd += 46 + nameLen + extraLen + commentLen;
    if (out && /\.kml$/i.test(name)) return out.toString('utf8');
    if (out && out.indexOf('<kml') >= 0) return out.toString('utf8');
  }
  return null;
}

// ─── KML: placemarks → geometrias ─────────────────────────────────────────

/**
 * Parse minimalista de KML: devolve os placemarks com nome + geometria.
 * Suficiente para os produtos NHC (track = LineString + Points datados,
 * cone = Polygon).
 * @param {string} kml
 * @returns {Array<{name: string|null, type: 'point'|'line'|'polygon', coords: Array<[number, number]>}>}
 */
function parseKmlPlacemarks(kml) {
  if (typeof kml !== 'string' || !kml.includes('<Placemark>')) return [];
  const out = [];
  const blocks = kml.split('<Placemark>').slice(1);
  for (const b of blocks) {
    const end = b.indexOf('</Placemark>');
    const pm = end >= 0 ? b.slice(0, end) : b;
    const name = /<name>([^<]*)<\/name>/.exec(pm)?.[1]?.trim() || null;
    let type = null;
    if (/<LineString>/.test(pm)) type = 'line';
    else if (/<Polygon>/.test(pm)) type = 'polygon';
    else if (/<Point>/.test(pm)) type = 'point';
    if (!type) continue;
    const coordBlocks =
      type === 'polygon'
        ? [/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm)?.[1]]
        : [/<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm)?.[1]];
    const coords = [];
    for (const cb of coordBlocks) {
      if (!cb) continue;
      for (const tuple of cb.trim().split(/\s+/)) {
        const [lon, lat] = tuple.split(',').map(Number);
        if (Number.isFinite(lon) && Number.isFinite(lat)) coords.push([lon, lat]);
      }
      if (coords.length) break; // só o anel exterior
    }
    if (!coords.length) continue;
    const pmOut = { name, type, coords };
    if (type === 'point') {
      // Track-points NHC: a descrição (CDATA com <table>) traz «12 hr
      // Forecast», «Valid at: …» e «Maximum Wind: 35 knots (40 mph)».
      const desc = /<description>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/description>/.exec(pm)?.[1]
        || /<description>([\s\S]*?)<\/description>/.exec(pm)?.[1]
        || '';
      const hr = /(\d+)\s*hr\s*Forecast/i.exec(desc);
      if (hr) pmOut.forecastHr = Number(hr[1]);
      const valid = /Valid at:\s*([^<]+)/i.exec(desc);
      if (valid) pmOut.validAt = valid[1].replace(/\s+/g, ' ').trim();
      const wind = /Maximum Wind:\s*\d+\s*knots\s*\((\d+)\s*mph\)/i.exec(desc);
      if (wind) pmOut.maxWindMph = Number(wind[1]);
    }
    out.push(pmOut);
  }
  return out;
}

// ─── Geometria utilitária ─────────────────────────────────────────────────

const KM_PER_DEG_LAT = 110.574;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Ray casting — ponto dentro de anel [lon,lat]. */
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** O anel (cone) intersecta o rectângulo de interesse? */
function ringTouchesRegion(ring, region = REGION) {
  // qualquer vértice dentro, ou algum canto do rectângulo dentro do anel
  for (const [lon, lat] of ring) {
    if (lat >= region.latMin && lat <= region.latMax && lon >= region.lonMin && lon <= region.lonMax) {
      return true;
    }
  }
  const corners = [
    [region.lonMin, region.latMin], [region.lonMax, region.latMin],
    [region.lonMax, region.latMax], [region.lonMin, region.latMax],
  ];
  return corners.some(([lon, lat]) => pointInRing(lat, lon, ring));
}

/** Douglas–Peucker no anel [lon,lat] — reduz o cone NHC (~1500 pts) para
 *  ~150 mantendo a forma (fica mais gordo nas curvas, exactamente onde a
 *  incerteza importa). `eps` em graus. */
function simplifyRing(ring, eps = 0.05) {
  if (!Array.isArray(ring) || ring.length < 8) return ring || [];
  const pts = ring.slice();
  // fechar se não estiver fechado
  if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) {
    pts.push(pts[0]);
  }
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  const perp = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = perp(pts[i], pts[a], pts[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
    out.push(out[0]);
  }
  return out;
}

// ─── Normalização ─────────────────────────────────────────────────────────

const CLASS_LABELS = { TD: 'Depressão tropical', TS: 'Tempestade tropical', HU: 'Furacão', MH: 'Furacão maior', EX: 'Pós-tropical', SD: 'Depressão subtropical', SS: 'Tempestade subtropical', LO: 'Baixa' };

function classificationCode(raw) {
  const c = String(raw?.classification || '').toUpperCase();
  if (['TD', 'TS', 'HU', 'MH', 'EX', 'SD', 'SS', 'LO', 'WV', 'PTC', 'DB'].includes(c)) return c;
  return 'OTHER';
}

/**
 * Converte um registo do CurrentStorms.json para o shape do storms.json.
 * @param {object} raw entrada de `activeStorms[]`
 * @returns {object|null}
 */
function normalizeStorm(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = typeof raw.latitudeNumeric === 'number' ? raw.latitudeNumeric : Number(raw.latitudeNumeric);
  const lon = typeof raw.longitudeNumeric === 'number' ? raw.longitudeNumeric : Number(raw.longitudeNumeric);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const adv = raw.forecastTrack?.advNum ?? raw.trackCone?.advNum ?? null;
  return {
    id: raw.id || null,
    name: typeof raw.name === 'string' ? raw.name : null,
    classification: classificationCode(raw),
    classificationLabel: CLASS_LABELS[classificationCode(raw)] || raw.classification || null,
    intensityMph: Number(raw.intensity) || 0,
    pressureMb: Number(raw.pressure) || null,
    lat,
    lon,
    movementDirDeg: Number(raw.movementDir) || null,
    movementSpeedMph: Number(raw.movementSpeed) || null,
    lastUpdate: raw.lastUpdate || null,
    advisory: adv,
    trackKmz: raw.forecastTrack?.kmzFile || null,
    coneKmz: raw.trackCone?.kmzFile || null,
  };
}

/**
 * A tempestade interessa ao rectângulo Ventu?
 * Critério: centro na região (com margem — ciclones movem-se depressa) OU
 * cone a tocar a região. Sem cone, usa-se o centro com margem.
 */
function stormInScope(storm, region = REGION) {
  const m = REGION_CENTER_MARGIN;
  const inBox =
    storm.lat >= region.latMin - m &&
    storm.lat <= region.latMax + m &&
    storm.lon >= region.lonMin - m &&
    storm.lon <= region.lonMax + m;
  if (inBox) return { inScope: true, coneTouches: null };
  if (Array.isArray(storm.cone) && storm.cone.length >= 3) {
    const touches = ringTouchesRegion(storm.cone, region);
    return { inScope: touches, coneTouches: touches };
  }
  return { inScope: false, coneTouches: false };
}

/** Spots cobertos pelo cone → `spotStorms` no payload. */
function buildSpotStorms(storms, spots) {
  const out = {};
  for (const sp of spots || []) {
    if (!Number.isFinite(sp?.lat) || !Number.isFinite(sp?.lon)) continue;
    const hits = [];
    for (const s of storms) {
      if (!Array.isArray(s.cone) || s.cone.length < 3) continue;
      if (pointInRing(sp.lat, sp.lon, s.cone)) {
        hits.push({
          id: s.id,
          name: s.name,
          classification: s.classification,
          classificationLabel: s.classificationLabel,
          centerDistKm: Math.round(haversineKm(sp.lat, sp.lon, s.lat, s.lon)),
          movementDirDeg: s.movementDirDeg,
          movementSpeedMph: s.movementSpeedMph,
        });
      }
    }
    if (hits.length) out[sp.id] = hits;
  }
  return out;
}

/**
 * Payload final do storms.json.
 * @param {object} currentStormsJson conteúdo do CurrentStorms.json
 * @param {Array<object>} storms normalizadas + track/cone já anexados
 * @param {Array<{id:string,lat:number,lon:number}>} spots
 * @param {string} fetchedAt ISO
 */
function buildStormsPayload(currentStormsJson, storms, spots, fetchedAt) {
  return {
    source: 'nhc',
    fetchedAt,
    region: REGION,
    storms,
    spotStorms: buildSpotStorms(storms, spots),
    activeCount: (currentStormsJson?.activeStorms || []).length,
  };
}

module.exports = {
  REGION,
  unzipKmz,
  parseKmlPlacemarks,
  simplifyRing,
  haversineKm,
  pointInRing,
  ringTouchesRegion,
  normalizeStorm,
  stormInScope,
  buildSpotStorms,
  buildStormsPayload,
};
