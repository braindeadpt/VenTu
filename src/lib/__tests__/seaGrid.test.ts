import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import {
  dilateSwell,
  lisbonLocalToEpochMs,
  parseSeaGrid,
  sampleSeaGrid,
  seaGridBoxAt,
  seaGridFrame,
  seaGridTimeIndex,
} from '../seaGrid';

const require = createRequire(import.meta.url);
const enc = require('../../../scripts/lib/seaGrid.js');

/** Grelha sintética 3×2 nós, 2 horas, codificada pelo MESMO encoder do pipeline. */
function synthetic() {
  const boxes = [{ id: 'b', west: -10, south: 38, nx: 3, ny: 2, offset: 0 }];
  const nodes = [
    { lat: 38, lon: -10 }, { lat: 38, lon: -9.5 }, { lat: 38, lon: -9 },
    { lat: 38.5, lon: -10 }, { lat: 38.5, lon: -9.5 }, { lat: 38.5, lon: -9 },
  ].map((n) => ({ ...n, fetch: true }));
  // vento de N a 10 m/s em t0, 20 m/s em t1
  const wind = nodes.map(() => ({ wind_speed_10m: [10, 20], wind_direction_10m: [0, 0] }));
  // Hs 1 m a oeste, 2 m no meio, terra (null) a leste; swell de NW (315°), 12 s
  const hsCol = [1, 2, null];
  const marine = nodes.map((_, k) => {
    const h = hsCol[k % 3];
    return {
      wave_height: [h, h == null ? null : h + 1],
      swell_wave_direction: [315, 315],
      swell_wave_period: [12, 14],
    };
  });
  const raw = enc.encodeSeaGrid({
    boxes, nodes, wind, marine, times: [1_800_000_000, 1_800_003_600], idx: [0, 1],
    generatedAt: '2027-01-15T08:00:00.000Z', source: 'test',
  });
  return JSON.parse(JSON.stringify(raw));
}

describe('parseSeaGrid', () => {
  it('descodifica bytes → unidades físicas e rejeita formas erradas', () => {
    const g = parseSeaGrid(synthetic())!;
    expect(g).not.toBeNull();
    expect(g.n).toBe(6);
    expect(g.nt).toBe(2);
    // vento de N → para sul
    expect(g.u[0]).toBeCloseTo(0, 5);
    expect(g.v[0]).toBeCloseTo(-10, 5);
    expect(g.hs[0]).toBeCloseTo(1, 5);
    expect(g.per[0]).toBeCloseTo(12, 5);
    // de NW (315°) → propaga para SE: e>0, n<0
    expect(g.pe[0]).toBeGreaterThan(0.69);
    expect(g.pn[0]).toBeLessThan(-0.69);
    expect(parseSeaGrid(null)).toBeNull();
    expect(parseSeaGrid({ ...synthetic(), v: 2 })).toBeNull();
    const bad = synthetic();
    bad.fields.hs = bad.fields.hs.slice(0, 4);
    expect(parseSeaGrid(bad)).toBeNull();
    const badBox = synthetic();
    badBox.boxes[0].offset = 3;
    expect(parseSeaGrid(badBox)).toBeNull();
  });

  it('prolonga a ondulação um anel para terra/costa (dilatação)', () => {
    const g = parseSeaGrid(synthetic())!;
    // coluna leste era null — fica com a média dos vizinhos de mar (2 m)
    expect(g.hs[2]).toBeCloseTo(2, 5);
    expect(g.hs[5]).toBeCloseTo(2, 5);
    // dilatar de novo não mexe em nós já válidos
    const hs = new Float32Array([NaN, NaN, 1, NaN]);
    const per = new Float32Array([NaN, NaN, 10, NaN]);
    const pe = new Float32Array([NaN, NaN, 1, NaN]);
    const pn = new Float32Array([NaN, NaN, 0, NaN]);
    dilateSwell({ id: 'q', west: 0, south: 0, nx: 2, ny: 2, offset: 0 }, 0, hs, per, pe, pn, 1);
    expect([...hs]).toEqual([1, 1, 1, 1]);
    expect(pe[0]).toBeCloseTo(1, 5);
  });
});

describe('tempo', () => {
  it('hora de Lisboa → epoch (WEST no verão, WET no inverno)', () => {
    expect(lisbonLocalToEpochMs('2026-10-08T02:00')).toBe(Date.UTC(2026, 9, 8, 1));
    expect(lisbonLocalToEpochMs('2026-12-01T12:00')).toBe(Date.UTC(2026, 11, 1, 12));
    expect(lisbonLocalToEpochMs('xx')).toBeNull();
  });

  it('índice fraccionário e janela', () => {
    const g = { t0: 1_800_000_000, stepHours: 1, nt: 3 };
    expect(seaGridTimeIndex(g, 1_800_000_000_000)).toBe(0);
    expect(seaGridTimeIndex(g, 1_800_005_400_000)).toBeCloseTo(1.5, 6);
    // meia hora antes de t0 ainda conta como t0 («Agora» às hh:20)
    expect(seaGridTimeIndex(g, (1_800_000_000 - 1200) * 1000)).toBe(0);
    expect(seaGridTimeIndex(g, (1_800_000_000 - 3600) * 1000)).toBeNull();
    expect(seaGridTimeIndex(g, (1_800_000_000 + 3 * 3600) * 1000)).toBeNull();
  });

  it('seaGridFrame interpola no tempo e dá os extremos', () => {
    const g = parseSeaGrid(synthetic())!;
    const f = seaGridFrame(g, 0.5);
    expect(f.v[0]).toBeCloseTo(-15, 4);
    expect(f.hs[0]).toBeCloseTo(1.5, 4);
    expect(f.per[0]).toBeCloseTo(13, 4);
    expect(f.windMaxKt).toBeCloseTo(15 * 1.943844, 2);
    expect(f.hsMin).toBeCloseTo(1.5, 4);
    expect(f.hsMax).toBeCloseTo(2.5, 4);
    // reutiliza o buffer
    const f2 = seaGridFrame(g, 1, f);
    expect(f2).toBe(f);
    expect(f2.hs[0]).toBeCloseTo(2, 4);
  });
});

describe('sampleSeaGrid', () => {
  it('bilinear dentro da caixa, null fora; direcção de onde vem', () => {
    const g = parseSeaGrid(synthetic())!;
    const f = seaGridFrame(g, 0);
    const mid = sampleSeaGrid(g, f, 38.25, -9.75)!;
    expect(mid.hs).toBeCloseTo(1.5, 4);
    expect(mid.w).toBeCloseTo(1, 5);
    expect(mid.kt).toBeCloseTo(10 * 1.943844, 3);
    expect(mid.windFrom).toBeCloseTo(0, 3);
    expect(mid.swellFrom).toBeGreaterThan(313);
    expect(mid.swellFrom).toBeLessThan(317);
    expect(sampleSeaGrid(g, f, 50, -9.5)).toBeNull();
    // borda: 1 no interior, ~0 meia célula para lá do último nó (sem corte recto)
    expect(mid.edge).toBe(1);
    expect(sampleSeaGrid(g, f, 38.25, -10.2)!.edge).toBeCloseTo(0.1, 5);
    expect(sampleSeaGrid(g, f, 38.25, -9.75)!.edge).toBe(1);
    expect(seaGridBoxAt(g, 38.74, -8.76)).not.toBeNull();
  });
});
