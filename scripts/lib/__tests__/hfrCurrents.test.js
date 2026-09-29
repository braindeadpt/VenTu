import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  MAX_AGE_HOURS,
  MAX_DIST_KM,
  MAX_COMPONENT_MS,
  parseGridCsv,
  distKm,
  nearestCell,
  currentFromUV,
  gridAgeHours,
} = require('../hfrCurrents.js');

const CSV_OK = [
  'time,depth,latitude,longitude,EWCT,NSCT,QCflag',
  'UTC,m,degrees_north,degrees_east,m s-1,m s-1,1',
  '2026-09-29T11:00:00Z,0,38.4,-9.6,0.1,0.2,1',
  '2026-09-29T11:00:00Z,0,38.4,-9.5,-0.05,0.3,1',
  '2026-09-29T11:00:00Z,0,38.5,-9.6,,0.3,1', // célula fora da máscara
  '2026-09-29T11:00:00Z,0,38.5,-9.5,0.2,0.1,3', // QCflag>1 → ignorada
  '2026-09-29T11:00:00Z,0,38.6,-9.6,9.9,0.1,1', // implausível → ignorada
].join('\n');

describe('hfrCurrents — parseGridCsv', () => {
  it('extrai células válidas, descarta máscara/QC/implausíveis', () => {
    const { time, cells } = parseGridCsv(CSV_OK);
    expect(time).toBe('2026-09-29T11:00:00Z');
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ lat: 38.4, lon: -9.6, u: 0.1, v: 0.2 });
  });

  it('rejeita csv vazio ou de formato inesperado', () => {
    expect(() => parseGridCsv('')).toThrow();
    expect(() => parseGridCsv('foo,bar\n1,2\n')).toThrow();
  });

  it('rejeita csv com zero células válidas', () => {
    const empty = 'time,latitude,longitude,EWCT,NSCT\nu,n,e,m,m\n2026-01-01,38,-9,,\n2026-01-01,38.1,-9,,\n';
    expect(() => parseGridCsv(empty)).toThrow('0 valid cells');
  });
});

describe('hfrCurrents — nearestCell', () => {
  const cells = [
    { lat: 38.4, lon: -9.6, u: 0.1, v: 0.2 },
    { lat: 38.45, lon: -9.55, u: 0.3, v: 0.1 },
  ];

  it('devolve a célula válida mais próxima com distância', () => {
    const c = nearestCell(cells, 38.41, -9.61);
    expect(c.u).toBeCloseTo(0.1);
    expect(c.distKm).toBeGreaterThan(0);
    expect(c.distKm).toBeLessThan(3);
  });

  it('shadow zone: apanha a válida mais próxima, não a mais próxima de todas', () => {
    const sparse = [
      { lat: 38.0, lon: -9.0, u: 0.5, v: 0.5 },
      { lat: 39.0, lon: -9.0, u: 0.1, v: 0.1 },
    ];
    const c = nearestCell(sparse, 38.02, -9.01);
    expect(c.u).toBe(0.5);
  });

  it('fora de alcance → null (sem corrente inventada)', () => {
    expect(nearestCell(cells, 41.0, -8.0)).toBeNull();
    expect(nearestCell(cells, 38.41, -9.61, 0.5)).toBeNull();
  });
});

describe('hfrCurrents — currentFromUV', () => {
  it('componentes → velocidade + direcção «para onde vai»', () => {
    expect(currentFromUV(0, 0.3)).toEqual({ spd: 0.3, dir: 0 }); // norte
    expect(currentFromUV(0.3, 0)).toEqual({ spd: 0.3, dir: 90 }); // este
    expect(currentFromUV(0, -0.3)).toEqual({ spd: 0.3, dir: 180 }); // sul
    expect(currentFromUV(-0.3, 0)).toEqual({ spd: 0.3, dir: 270 }); // oeste
    const d = currentFromUV(0.3, 0.3);
    expect(d.spd).toBeCloseTo(Math.SQRT2 * 0.3, 2);
    expect(d.dir).toBe(45);
  });
});

describe('hfrCurrents — gates', () => {
  it('distKm razoável a curta distância', () => {
    const d = distKm(38.4, -9.6, 38.41, -9.6);
    expect(d).toBeGreaterThan(1.0);
    expect(d).toBeLessThan(1.3);
  });

  it('gridAgeHours: timestamp inválido → Infinity', () => {
    expect(gridAgeHours('lixo')).toBe(Infinity);
    const t = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(gridAgeHours(t)).toBeCloseTo(2, 1);
  });

  it('constantes conservadoras', () => {
    expect(MAX_AGE_HOURS).toBeLessThanOrEqual(6);
    expect(MAX_DIST_KM).toBeLessThanOrEqual(20);
    expect(MAX_COMPONENT_MS).toBeGreaterThanOrEqual(2);
  });
});
