'use strict';
/**
 * Áreas de aviso IPMA → geometria (B2 do docs/STORM-STUDY.md).
 *
 * Lib pura: mapeamento área→grupo, simplificação e construção do payload
 * baked `public/geo/warning-areas.json`. O download vive em
 * scripts/fetch-warning-areas.js (DGT CAOP2025 para os distritos do
 * continente + OpenStreetMap/Nominatim para as ilhas — a OGC API da DGT
 * só publica o continente).
 *
 * Granularidade honesta:
 * - Continente → distrito (a área IPMA É o distrito).
 * - Madeira → ilha inteira: MCN/MCS/MRM partilham o polígono (a sub-divisão
 *   norte/sul/montanha não existe na fonte ilha-nível; o tooltip lista os
 *   códigos cobertos).
 * - Açores → ilhas agrupadas nos três grupos IPMA (AOR/ACE/AOC).
 */

const { simplifyRing } = require('./nhcStorms.js');

/** Distrito CAOP2025 → código de área IPMA (warnings[].areaCode). */
const DISTRICT_TO_CODE = {
  'Aveiro': 'AVR',
  'Beja': 'BJA',
  'Braga': 'BRG',
  'Bragança': 'BGC',
  'Castelo Branco': 'CBR',
  'Coimbra': 'CBO',
  'Évora': 'EVR',
  'Faro': 'FAR',
  'Guarda': 'GDA',
  'Leiria': 'LRA',
  'Lisboa': 'LSB',
  'Portalegre': 'PTG',
  'Porto': 'PTO',
  'Santarém': 'STM',
  'Setúbal': 'STB',
  'Viana do Castelo': 'VCT',
  'Vila Real': 'VRL',
  'Viseu': 'VIS',
};

/**
 * Grupos insulares: `islands` são queries Nominatim («Ilha de …») — uma
 * geometria por ilha, todas somadas ao grupo.
 */
const ISLAND_GROUPS = [
  {
    group: 'MAD',
    label: 'Ilha da Madeira',
    codes: ['MCN', 'MCS', 'MRM'],
    islands: ['Ilha da Madeira'],
  },
  {
    group: 'MPS',
    label: 'Porto Santo',
    codes: ['MPS'],
    islands: ['Porto Santo'],
  },
  {
    group: 'AOR',
    label: 'São Miguel e Santa Maria',
    codes: ['AOR'],
    islands: ['Ilha de São Miguel, Açores', 'Ilha de Santa Maria, Açores'],
  },
  {
    group: 'ACE',
    label: 'Grupo Central (Açores)',
    codes: ['ACE'],
    islands: [
      'Ilha Terceira, Açores',
      'Ilha Graciosa, Açores',
      'Ilha de São Jorge, Açores',
      'Ilha do Pico, Açores',
      'Ilha do Faial, Açores',
    ],
  },
  {
    group: 'AOC',
    label: 'Grupo Ocidental (Açores)',
    codes: ['AOC'],
    islands: ['Ilha das Flores, Açores', 'Ilha do Corvo, Açores'],
  },
];

/** Código IPMA → grupo pintado. 25 códigos: 18 distritos + MAD(3) + MPS + AOR/ACE/AOC. */
const CODE_TO_GROUP = (() => {
  const map = {};
  for (const code of Object.values(DISTRICT_TO_CODE)) map[code] = code;
  for (const g of ISLAND_GROUPS) for (const code of g.codes) map[code] = g.group;
  return map;
})();

const LEVEL_RANK = { yellow: 1, orange: 2, red: 3 };

/**
 * GeoJSON geometry → polys simplificados `[poly[ring[[lon,lat]]]]`.
 * Preserva buracos (anéis interiores); coords arredondadas a 4 casas (~11 m).
 */
function geometryPolys(geometry, eps = 0.008) {
  if (!geometry || typeof geometry !== 'object') return [];
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  const round = (v) => Math.round(v * 1e4) / 1e4;
  return polys
    .map((rings) =>
      (rings || [])
        .map((ring) => simplifyRing(ring, eps).map(([lon, lat]) => [round(lon), round(lat)]))
        .filter((ring) => ring.length >= 4),
    )
    .filter((poly) => poly.length > 0);
}

/**
 * Monta o payload `warning-areas.json`.
 * @param {Array<object>} districtFeatures features da colecção `distritos` DGT
 * @param {Record<string, object>} islandGeometries query → GeoJSON geometry
 */
function buildAreasPayload(districtFeatures, islandGeometries, bakedAt) {
  const groups = {};
  for (const f of districtFeatures || []) {
    const name = f?.properties?.distrito;
    const code = DISTRICT_TO_CODE[name];
    if (!code || !f.geometry) continue;
    const polys = geometryPolys(f.geometry);
    if (polys.length) groups[code] = { label: name, codes: [code], polys };
  }
  for (const g of ISLAND_GROUPS) {
    const polys = [];
    for (const q of g.islands) {
      const geom = islandGeometries?.[q];
      polys.push(...geometryPolys(geom, 0.005));
    }
    if (polys.length) groups[g.group] = { label: g.label, codes: g.codes.slice(), polys };
  }
  return {
    source: 'dgt-caop2025+osm',
    bakedAt,
    groups,
  };
}

/**
 * Avisos IPMA activos/futuros por grupo de área. Expirados (endTime no
 * passado) não contam — a camada pinta só o que está em vigor ou anunciado.
 * @param {Array<object>} warnings warnings[].* do warnings.json
 * @param {number} now epoch ms
 * @returns {Array<{group:string, maxLevel:string, warnings:Array}>}
 */
function groupWarnings(warnings, now = Date.now()) {
  const byGroup = new Map();
  for (const w of warnings || []) {
    if (!w || typeof w !== 'object') continue;
    const group = CODE_TO_GROUP[w.areaCode];
    if (!group) continue;
    if (w.endTime && Date.parse(w.endTime) <= now) continue;
    const hit = byGroup.get(group) || { group, maxLevel: 'yellow', warnings: [] };
    hit.warnings.push(w);
    if ((LEVEL_RANK[w.level] || 0) > LEVEL_RANK[hit.maxLevel]) hit.maxLevel = w.level;
    byGroup.set(group, hit);
  }
  return [...byGroup.values()];
}

module.exports = {
  DISTRICT_TO_CODE,
  ISLAND_GROUPS,
  CODE_TO_GROUP,
  LEVEL_RANK,
  geometryPolys,
  buildAreasPayload,
  groupWarnings,
};
