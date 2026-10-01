/**
 * warningAreas — mapeamento área→grupo, geometria e agrupamento de avisos
 * IPMA (B2). Sem rede: fixtures inline.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  DISTRICT_TO_CODE,
  ISLAND_GROUPS,
  CODE_TO_GROUP,
  geometryPolys,
  buildAreasPayload,
  groupWarnings,
} = require('../warningAreas.js');

const NOW = Date.parse('2026-09-29T20:00:00Z');
const w = (areaCode, level, endTime = '2026-09-30T06:00:00Z', type = 'Vento') => ({
  areaCode, type, level, endTime, startTime: '2026-09-29T18:00:00Z', text: 'x', relevant: true,
});

describe('warningAreas — mapping', () => {
  it('cobre os 18 distritos do continente', () => {
    expect(Object.keys(DISTRICT_TO_CODE)).toHaveLength(18);
  });

  it('CODE_TO_GROUP cobre os 25 códigos de área IPMA', () => {
    const codes = [
      'AVR', 'BJA', 'BRG', 'BGC', 'CBR', 'CBO', 'EVR', 'FAR', 'GDA', 'LRA',
      'LSB', 'PTG', 'PTO', 'STM', 'STB', 'VCT', 'VRL', 'VIS',
      'MCN', 'MCS', 'MRM', 'MPS', 'AOR', 'ACE', 'AOC',
    ];
    for (const c of codes) expect(CODE_TO_GROUP[c], c).toBeTruthy();
    expect(Object.keys(CODE_TO_GROUP)).toHaveLength(25);
  });

  it('sub-áreas da Madeira agrupam na ilha', () => {
    expect(CODE_TO_GROUP.MCN).toBe('MAD');
    expect(CODE_TO_GROUP.MCS).toBe('MAD');
    expect(CODE_TO_GROUP.MRM).toBe('MAD');
    expect(CODE_TO_GROUP.MPS).toBe('MPS');
  });

  it('grupos dos Açores cobrem 2+5+2 ilhas', () => {
    const byGroup = Object.fromEntries(ISLAND_GROUPS.map((g) => [g.group, g.islands.length]));
    expect(byGroup.AOR).toBe(2);
    expect(byGroup.ACE).toBe(5);
    expect(byGroup.AOC).toBe(2);
  });
});

describe('warningAreas — geometryPolys', () => {
  it('Polygon → um poly, anel simplificado e fechado', () => {
    const square = {
      type: 'Polygon',
      coordinates: [[[-9, 38], [-8, 38], [-8, 39], [-9, 39], [-9, 38]]],
    };
    const polys = geometryPolys(square);
    expect(polys).toHaveLength(1);
    expect(polys[0][0].length).toBeGreaterThanOrEqual(4);
    expect(polys[0][0][0]).toEqual(polys[0][0].at(-1));
  });

  it('preserva buracos como anéis interiores', () => {
    const withHole = {
      type: 'Polygon',
      coordinates: [
        [[-9, 38], [-8, 38], [-8, 39], [-9, 39], [-9, 38]],
        [[-8.8, 38.2], [-8.2, 38.2], [-8.2, 38.8], [-8.8, 38.8], [-8.8, 38.2]],
      ],
    };
    expect(geometryPolys(withHole)[0]).toHaveLength(2);
  });

  it('MultiPolygon → vários polys; geometria inválida → []', () => {
    const mp = {
      type: 'MultiPolygon',
      coordinates: [
        [[[-9, 38], [-8, 38], [-8, 39], [-9, 38]]],
        [[[-7, 38], [-6, 38], [-6, 39], [-7, 38]]],
      ],
    };
    expect(geometryPolys(mp)).toHaveLength(2);
    expect(geometryPolys({ type: 'Point', coordinates: [0, 0] })).toEqual([]);
    expect(geometryPolys(null)).toEqual([]);
  });
});

describe('warningAreas — groupWarnings', () => {
  it('agrupa por código→grupo e expõe o nível máximo', () => {
    const hits = groupWarnings(
      [w('FAR', 'yellow'), w('FAR', 'orange'), w('MCS', 'red'), w('XXX', 'red')],
      NOW,
    );
    const faro = hits.find((h) => h.group === 'FAR');
    expect(faro.warnings).toHaveLength(2);
    expect(faro.maxLevel).toBe('orange');
    const mad = hits.find((h) => h.group === 'MAD');
    expect(mad.warnings[0].areaCode).toBe('MCS');
    expect(hits.find((h) => h.group === 'XXX')).toBeUndefined();
  });

  it('avisos expirados não contam', () => {
    const hits = groupWarnings([w('FAR', 'red', '2026-09-29T19:00:00Z')], NOW);
    expect(hits).toHaveLength(0);
  });

  it('aviso sem endTime conta (não expira por omissão)', () => {
    const hits = groupWarnings([{ areaCode: 'AOR', type: 'Vento', level: 'yellow' }], NOW);
    expect(hits[0].group).toBe('AOR');
  });

  it('null/undefined → []', () => {
    expect(groupWarnings(null, NOW)).toEqual([]);
    expect(groupWarnings(undefined, NOW)).toEqual([]);
  });
});

describe('warningAreas — buildAreasPayload', () => {
  it('distritos + ilhas → grupos com polys', () => {
    const districtFeatures = [
      {
        properties: { distrito: 'Faro' },
        geometry: { type: 'Polygon', coordinates: [[[-9, 37], [-8, 37], [-8, 37.5], [-9, 37]]] },
      },
      { properties: { distrito: 'Desconhecido' }, geometry: null },
    ];
    const islands = {
      'Porto Santo': {
        type: 'Polygon',
        coordinates: [[[-16.4, 33], [-16.2, 33], [-16.2, 33.15], [-16.4, 33]]],
      },
    };
    const payload = buildAreasPayload(districtFeatures, islands, '2026-09-29T00:00:00Z');
    expect(payload.groups.FAR.label).toBe('Faro');
    expect(payload.groups.FAR.codes).toEqual(['FAR']);
    expect(payload.groups.MPS.polys.length).toBeGreaterThan(0);
    expect(payload.groups.MPS.codes).toEqual(['MPS']);
    expect(payload.groups.MAD).toBeUndefined(); // sem geometria da Madeira → omite
    expect(payload.source).toBe('dgt-caop2025+osm');
  });
});
