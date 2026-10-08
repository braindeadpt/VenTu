import { describe, expect, it } from 'vitest';
import { buildWindFieldGridsFromSea, spawnWindParticle, windCellAnywhere, type WindParticle } from '../mapWindField';
import { emptySample, smoothNaN, swellAlpha, viewBounds, type ScreenView } from '../seaFieldPaint';
import type { SeaGridFrame } from '../seaGrid';

describe('seaFieldPaint', () => {
  it('swellAlpha: só a borda do domínio e a falta de mar do modelo esbatem (nunca a costa preenchida)', () => {
    const s = emptySample();
    s.w = 1;
    s.edge = 1;
    expect(swellAlpha(s)).toBe(1);
    s.edge = 0.5;
    expect(swellAlpha(s)).toBe(0.5);
    s.edge = 1;
    s.w = 0.1;
    expect(swellAlpha(s)).toBe(0);
  });

  it('smoothNaN arredonda degraus sem espalhar para NaN', () => {
    const g = Float32Array.from([1, 1, 2, 2, NaN]);
    smoothNaN(g, 5, 1, 1);
    expect(g[1]).toBeCloseTo(4 / 3, 5);
    expect(g[3]).toBeCloseTo(2, 5);
    expect(Number.isNaN(g[4])).toBe(true);
  });

  it('viewBounds: Mercator do Leaflet', () => {
    const v: ScreenView = { W: 256, H: 256, zoom: 0, origin: { x: 0, y: 0 } };
    const b = viewBounds(v);
    expect(b.west).toBeCloseTo(-180);
    expect(b.east).toBeCloseTo(180);
    expect(b.north).toBeCloseTo(85.0511, 3);
  });
});

describe('vento v3: sem corte raster, domínio contínuo, partículas nunca nascem em terra', () => {
  const SEA_V3 = {
    step: 0.5,
    version: 3,
    fade: 4,
    boxes: [
      { id: 'core', west: -11, south: 37, nx: 7, ny: 7, offset: 0, step: 0.5 },
      { id: 'ocean', west: -30, south: 20, nx: 16, ny: 16, offset: 49, step: 2 },
    ],
  };
  const n = 49 + 256;
  const fill = (x: number) => new Float32Array(n).fill(x);
  const frame: SeaGridFrame = {
    tf: 0, u: fill(6), v: fill(0), hs: fill(1), per: fill(10), pe: fill(1), pn: fill(0),
    windMinKt: 0, windMaxKt: 0, hsMin: 1, hsMax: 1,
  };
  it('grelhas sem landClip; a de domínio cobre também o interior da fina', () => {
    const grids = buildWindFieldGridsFromSea(SEA_V3, frame);
    expect(grids.map((g) => g.id)).toEqual(['core', 'domain']);
    expect(grids.some((g) => g.landClip)).toBe(false);
    // Lisboa (terra) tem célula — o corte é a máscara de ecrã no hook
    expect(windCellAnywhere(grids, 38.72, -9.14)).not.toBeNull();
    const dom = grids[1];
    const x = Math.floor(((-9.5 - dom.west) / (dom.east - dom.west)) * dom.cols);
    const y = Math.floor(((dom.north - 38.5) / (dom.north - dom.south)) * dom.rows);
    expect(dom.grid[y * dom.cols + x]).not.toBeNull();
  });
  it('spawn rejeita pontos em terra (onLand)', () => {
    const grids = buildWindFieldGridsFromSea(SEA_V3, frame);
    const p: WindParticle = { lat: 0, lon: 0, px: 0, py: 0, hasPrev: false, life: 0, kt: 0, jit: 1 };
    const view = { south: 38, north: 39, west: -10, east: -9 };
    expect(spawnWindParticle(grids, view, p, Math.random, undefined, (_la, lo) => lo > -9.5)).not.toBeNull();
    expect(p.lon).toBeLessThanOrEqual(-9.5);
    expect(spawnWindParticle(grids, view, p, Math.random, undefined, () => true)).toBeNull();
  });
});
