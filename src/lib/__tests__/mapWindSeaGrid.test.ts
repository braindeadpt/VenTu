import { describe, expect, it } from 'vitest';
import {
  WIND_COLOR_BINS,
  advectWindParticle,
  buildWindFieldGridsFromSea,
  metersPerPixel,
  windBinRgb,
  windCellAnywhere,
  windCellKt,
  windKtBin,
  type WindParticle,
} from '@/lib/mapWindField';
import type { SeaGridFrame } from '@/lib/seaGrid';
import { rampColor, WIND_KT_STOPS } from '@/lib/mapSwellField';

/** Caixa no mar aberto a oeste de Portugal (sem terra na máscara GADM). */
const SEA = { step: 0.5, boxes: [{ id: 'sea', west: -14, south: 38, nx: 5, ny: 5, offset: 0 }] };

function frame(u: number, v: number): SeaGridFrame {
  const n = 25;
  const fill = (x: number) => new Float32Array(n).fill(x);
  return {
    tf: 0, u: fill(u), v: fill(v), hs: fill(1), per: fill(10), pe: fill(1), pn: fill(0),
    windMinKt: 0, windMaxKt: 0, hsMin: 1, hsMax: 1,
  };
}

describe('vento a partir da grelha de modelo', () => {
  it('cobre a caixa com o vector da grelha (independente de spots) e esbate na borda', () => {
    const grids = buildWindFieldGridsFromSea(SEA, frame(5, 0));
    expect(grids).toHaveLength(1);
    const centre = windCellAnywhere(grids, 39, -13)!;
    expect(centre.cell.u).toBeCloseTo(5, 4);
    expect(centre.cell.v).toBeCloseTo(0, 4);
    expect(centre.cell.falloff).toBe(1);
    const nearEdge = windCellAnywhere(grids, 39, -13.9);
    expect(nearEdge?.cell.falloff ?? 0).toBeLessThan(0.5);
    // vento abaixo do mínimo não gera células
    const calm = buildWindFieldGridsFromSea(SEA, frame(0.1, 0));
    expect(calm[0].grid.every((c) => c === null)).toBe(true);
  });

  it('velocidade das partículas ∝ vento e cor pelo nó onde estão', () => {
    const slow = buildWindFieldGridsFromSea(SEA, frame(3, 0));
    const fast = buildWindFieldGridsFromSea(SEA, frame(12, 0));
    const mk = (): WindParticle => ({ lat: 39, lon: -13, px: 0, py: 0, hasPrev: false, life: 50, kt: 0, jit: 1 });
    const a = mk();
    const b = mk();
    const rnd = Math.random;
    Math.random = () => 0.5; // sem difusão
    try {
      advectWindParticle(slow, a, 0.1, 8, undefined, windCellKt);
      advectWindParticle(fast, b, 0.1, 8, undefined, windCellKt);
    } finally {
      Math.random = rnd;
    }
    const da = a.lon + 13;
    const db = b.lon + 13;
    expect(da).toBeGreaterThan(0);
    expect(db / da).toBeCloseTo(4, 1);
    expect(b.kt).toBeCloseTo(12 * 1.943844, 2);
    expect(metersPerPixel(39, 8)).toBeGreaterThan(0);
  });

  it('classes de cor seguem a escala de nós da legenda', () => {
    expect(windKtBin(-3)).toBe(0);
    expect(windKtBin(0)).toBe(0);
    expect(windKtBin(39.9)).toBe(WIND_COLOR_BINS - 1);
    expect(windKtBin(80)).toBe(WIND_COLOR_BINS - 1);
    expect(windKtBin(20)).toBe(Math.floor((20 / 40) * WIND_COLOR_BINS));
    const mid = windKtBin(20);
    const kt = ((mid + 0.5) / WIND_COLOR_BINS) * 40;
    expect(windBinRgb(mid)).toBe(rampColor(WIND_KT_STOPS, kt).join(' '));
  });
});
