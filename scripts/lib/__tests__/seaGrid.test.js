/**
 * Testes das partes puras do build-sea-grid.js (v3: GFS + WW3 em grelha via
 * ERDDAP do PacIOOS) e do encoder v2 que os stubs e2e ainda usam.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sg = require('../seaGrid.js');

describe('seaGrid v3 — caixas, pedidos e CSV do ERDDAP', () => {
  it('três caixas aninhadas na malha de 0,5°, domínio muito maior que o /mapa', () => {
    expect(sg.TIERS.map((t) => [t.id, t.step])).toEqual([
      ['core', 0.5],
      ['regional', 1],
      ['ocean', 2],
    ]);
    const ocean = sg.TIERS[2];
    expect(ocean).toMatchObject({ south: 0, north: 72, west: -100, east: 44 });
    for (let k = 1; k < sg.TIERS.length; k++) {
      const a = sg.TIERS[k - 1];
      const b = sg.TIERS[k];
      // cada caixa contém a anterior com folga ≥ esbatido
      expect(b.west).toBeLessThanOrEqual(a.west - 4);
      expect(b.east).toBeGreaterThanOrEqual(a.east + 4);
      expect(b.south).toBeLessThanOrEqual(a.south - 4);
      expect(b.north).toBeGreaterThanOrEqual(a.north + 4);
    }
    for (const t of sg.TIERS) {
      for (const x of [t.south, t.north, t.west, t.east]) expect(Number.isInteger(x / t.step)).toBe(true);
    }
    expect(sg.tierDims(sg.TIERS[0])).toEqual({ nx: 89, ny: 57 });
    expect(sg.SEA_GRID_FADE_DEG).toBeGreaterThanOrEqual(3);
  });

  it('pickTimes: múltiplos de 3 h desde agora (floor) até +48 h', () => {
    const now = Date.UTC(2026, 9, 8, 19, 40);
    const t = sg.pickTimes(now);
    expect(t[0]).toBe(Date.UTC(2026, 9, 8, 18) / 1000);
    expect(t.length).toBe(17);
    expect(t[16] - t[0]).toBe(48 * 3600);
  });

  it('erddapUrls: lon 0–359,5, caixa que cruza Greenwich em dois pedaços, stride por passo', () => {
    const times = [Date.UTC(2026, 9, 8, 18) / 1000, Date.UTC(2026, 9, 10, 18) / 1000];
    const urls = sg.erddapUrls(sg.ERDDAP_WAVE, sg.TIERS[1], times);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/ww3_global.csv?Thgt[(2026-10-08T18:00:00Z):3:(2026-10-10T18:00:00Z)][(0.0)][(14):2:(60)][(304):2:(359)]');
    expect(urls[1]).toContain('[(14):2:(60)][(0):2:(14)]');
    for (const v of ['sdir', 'sper', 'Tdir', 'Tper']) expect(urls[0]).toContain(`,${v}[`);
    const wind = sg.erddapUrls(sg.ERDDAP_WIND, sg.TIERS[2], times);
    expect(wind[0]).toContain('/ncep_global.csv?ugrd10m[(2026-10-08T18:00:00Z):1:(2026-10-10T18:00:00Z)][(0):4:(72)][(260):4:(358)]');
    expect(wind[1]).toContain('[(0):4:(72)][(0):4:(44)]');
    expect(wind[0]).not.toContain('[(0.0)]');
  });

  it('parseErddapCsv + gridFromRows: lon > 180 → negativa, NaN → nulo, malha da caixa', () => {
    const csv = [
      'time,depth,latitude,longitude,Thgt,sdir',
      'UTC,m,degrees_north,degrees_east,meters,degrees',
      '2026-10-08T18:00:00Z,0.0,38.0,350.0,1.5,300.0',
      '2026-10-08T18:00:00Z,0.0,38.0,350.5,NaN,NaN',
      '2026-10-08T21:00:00Z,0.0,38.5,350.0,1.7,310.0',
      '2026-10-08T21:00:00Z,0.0,38.25,350.0,9,9',
      '',
    ].join('\n');
    const rows = sg.parseErddapCsv(csv, ['Thgt', 'sdir']);
    expect(rows[0]).toEqual({ time: Date.UTC(2026, 9, 8, 18) / 1000, lat: 38, lon: -10, vals: [1.5, 300] });
    expect(rows[1].vals).toEqual([null, null]);
    expect(() => sg.parseErddapCsv('a,b\n', ['Thgt'])).toThrow();
    const tier = { id: 'x', step: 0.5, south: 38, north: 38.5, west: -10, east: -9.5 };
    const times = [Date.UTC(2026, 9, 8, 18) / 1000, Date.UTC(2026, 9, 8, 21) / 1000];
    const g = sg.gridFromRows(rows, tier, times, 2);
    expect(g).toMatchObject({ nx: 2, ny: 2, n: 4, hit: 3 }); // 38.25 fora da malha
    expect(g.arrays[0][0]).toBeCloseTo(1.5);
    expect(Number.isNaN(g.arrays[0][1])).toBe(true);
    expect(g.arrays[0][4 + 2]).toBeCloseTo(1.7);
  });

  it('storedMask: só mar do WW3 (ou mar só-vento) e caixas grossas fora do interior da fina', () => {
    const tiers = [
      { id: 'f', step: 0.5, south: 36, north: 44, west: -14, east: -6 },
      { id: 'c', step: 1, south: 30, north: 50, west: -20, east: 0 },
    ];
    const { nx, ny } = sg.tierDims(tiers[1]);
    const hs = new Float32Array(nx * ny).fill(1);
    hs[0] = NaN; // terra
    const keep = sg.storedMask(tiers, 1, hs, 1);
    expect(keep[0]).toBe(0);
    // centro da fina (40N 10W) não fica na grossa…
    expect(keep[(40 - 30) * nx + (-10 + 20)]).toBe(0);
    // …mas a zona de fusão (≤ 2° para dentro da borda da fina) fica
    expect(keep[(40 - 30) * nx + (-13 + 20)]).toBe(1);
    expect(sg.inWindOnlySea(38, 15)).toBe(true);
    expect(sg.inWindOnlySea(38, -20)).toBe(false);
  });

  it('encodeGriddedSeaGrid: v3, bytes por campo, swell com fallback para a onda total', () => {
    const tiers = [{ id: 'x', step: 0.5, south: 0, north: 0.5, west: 0, east: 0 }];
    const times = [100, 100 + 3 * 3600];
    const F = (a) => Float32Array.from(a);
    const data = [{
      u: F([3, 0, 3, 0]), v: F([-2, 0, -2, 0]),
      hs: F([1.5, NaN, 1.6, NaN]),
      sdir: F([300, NaN, NaN, NaN]), sper: F([12, NaN, NaN, NaN]),
      tdir: F([290, NaN, 280, NaN]), tper: F([8, NaN, 7, NaN]),
    }];
    const f = sg.encodeGriddedSeaGrid({ tiers, data, times, generatedAt: 'g', source: 's' });
    expect(f).toMatchObject({ v: 3, t0: 100, stepHours: 3, nt: 2, n: 1, fade: 4, nodata: 255 });
    expect(f.scale.u).toBe(0.5);
    expect(f.boxes[0]).toMatchObject({ id: 'x', nx: 1, ny: 2, offset: 0, count: 1 });
    const b = (k) => [...Buffer.from(f.fields[k], 'base64')];
    expect(b('u')).toEqual([134, 134]);
    expect(b('v')).toEqual([124, 124]);
    expect(b('hs')).toEqual([15, 16]);
    expect(b('per')).toEqual([120, 70]); // t1 sem swell → onda total
    expect(b('dir')).toEqual([sg.encodeDir(300), sg.encodeDir(280)]);
  });

  it('frescura: só v3, 5,5 h', () => {
    const now = Date.UTC(2026, 9, 8, 12);
    expect(sg.isSeaGridFresh({ v: 3, generatedAt: new Date(now - 3 * 3600_000).toISOString() }, now)).toBe(true);
    expect(sg.isSeaGridFresh({ v: 3, generatedAt: new Date(now - 6 * 3600_000).toISOString() }, now)).toBe(false);
    expect(sg.isSeaGridFresh({ v: 2, generatedAt: new Date(now - 3600_000).toISOString() }, now)).toBe(false);
    expect(sg.isSeaGridFresh(null, now)).toBe(false);
  });
});

describe('quantização (partilhada v2/v3)', () => {
  it('vento: m/s + direcção DE ONDE → bytes u/v do vector (para onde sopra)', () => {
    const [u, v] = sg.encodeWind(10, 0);
    expect((u - 128) * sg.SCALE.u).toBeCloseTo(0, 5);
    expect((v - 128) * sg.SCALE.v).toBeCloseTo(-10, 5);
    const [u2] = sg.encodeWind(4, 270);
    expect((u2 - 128) * sg.SCALE.u).toBeCloseTo(4, 5);
    expect(sg.encodeWind(null, 10)).toEqual([sg.NODATA, sg.NODATA]);
    expect(sg.encodeWind(60, 270)[0]).toBe(254);
    // v3: 0,5 m/s → ±63,5 m/s
    expect(sg.encodeUV(-63.5, 40)).toEqual([1, 208]);
    expect(sg.encodeUV(NaN, 1)).toEqual([sg.NODATA, sg.NODATA]);
  });

  it('Hs, período e direcção: passo, nodata e o 255 reservado', () => {
    expect(sg.encodeHs(2.34)).toBe(23);
    expect(sg.encodeHs(null)).toBe(sg.NODATA);
    expect(sg.encodeHs(40)).toBe(254);
    expect(sg.encodePer(12.06)).toBe(121);
    expect(sg.encodePer(0)).toBe(sg.NODATA);
    expect(sg.encodeDir(0)).toBe(0);
    expect(sg.encodeDir(180)).toBe(128);
    expect(sg.encodeDir(-90)).toBe(192);
    expect(sg.encodeDir(358.6)).toBe(254);
    expect(sg.encodeDir(359.9)).toBe(0);
  });

  it('encodeSeaGrid v2 (stubs e2e): só os nós com `store`, máscara por caixa', () => {
    const boxes = [
      { id: 'f', west: 0, south: 0, nx: 2, ny: 2, step: 0.5, first: 0 },
      { id: 'c', west: 0, south: 0, nx: 2, ny: 2, step: 1, first: 4 },
    ];
    const nodes = [
      { lat: 0, lon: 0, fetch: true, store: true },
      { lat: 0, lon: 0.5, fetch: false, store: false },
      { lat: 0.5, lon: 0, fetch: false, store: false },
      { lat: 0.5, lon: 0.5, fetch: true, store: true },
      ...[0, 1, 2, 3].map(() => ({ lat: 0, lon: 0, fetch: true, store: true })),
    ];
    const w = { wind_speed_10m: [5], wind_direction_10m: [0] };
    const f = sg.encodeSeaGrid({
      boxes, nodes, wind: nodes.map((n) => (n.fetch ? w : null)), marine: nodes.map(() => null),
      times: [100], idx: [0], generatedAt: 'g', source: 's',
    });
    expect(f.v).toBe(2);
    expect(f.n).toBe(6);
    expect(f.boxes[0]).toMatchObject({ id: 'f', step: 0.5, offset: 0, count: 2 });
    expect([...Buffer.from(f.boxes[0].mask, 'base64')]).toEqual([0b1001]);
    expect(f.boxes[1].mask).toBeUndefined();
  });
});
