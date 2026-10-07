import { describe, expect, it } from 'vitest';
import {
  HS_M_STOPS,
  SWELL_CREST_SPACING_PX,
  WIND_KT_STOPS,
  buildCrestLattice,
  compass16,
  crestPhase,
  fmt1,
  hsLegendTop,
  isolineLevels,
  legendGradient,
  marchingSquares,
  pickIsolineLabel,
  rampColor,
  rampLut,
  swellArrowLengthPx,
  swellChevrons,
  windLegendTop,
} from '../mapSwellField';

describe('escalas de cor (maquete)', () => {
  it('paragens exactas e interpolação linear entre elas', () => {
    expect(rampColor(WIND_KT_STOPS, 0)).toEqual([74, 104, 150]);
    expect(rampColor(WIND_KT_STOPS, 20)).toEqual([244, 190, 70]);
    expect(rampColor(WIND_KT_STOPS, 2.5)).toEqual([72, 132, 178]);
    expect(rampColor(WIND_KT_STOPS, 99)).toEqual([190, 90, 220]);
    expect(rampColor(HS_M_STOPS, -1)).toEqual([10, 38, 66]);
    expect(rampColor(HS_M_STOPS, 1)).toEqual([24, 112, 146]);
  });
  it('LUT de 256 e gradiente da legenda cortado no topo', () => {
    const lut = rampLut(HS_M_STOPS, 5);
    expect(lut.length).toBe(768);
    expect([lut[0], lut[1], lut[2]]).toEqual([10, 38, 66]);
    const g = legendGradient(WIND_KT_STOPS, 30);
    expect(g.startsWith('linear-gradient(90deg, rgb(74 104 150) 0.0%')).toBe(true);
    expect(g).toContain('100.0%');
    expect(g).not.toContain('190 90 220');
    expect(windLegendTop(22)).toBe(30);
    expect(windLegendTop(33)).toBe(40);
    expect(hsLegendTop(1.9)).toBe(2.5);
    expect(hsLegendTop(3.1)).toBe(3.5);
    expect(hsLegendTop(4.2)).toBe(5);
  });
});

describe('símbolos de ondulação', () => {
  it('chevrons por período e seta ∝ Hs com tecto', () => {
    expect([5, 8, 10.9, 11, 13.9, 14, 18].map(swellChevrons)).toEqual([1, 2, 2, 3, 3, 4, 4]);
    expect(swellChevrons(NaN)).toBe(1);
    expect(swellArrowLengthPx(0)).toBe(12);
    expect(swellArrowLengthPx(2)).toBe(42);
    expect(swellArrowLengthPx(9)).toBe(swellArrowLengthPx(4));
  });
});

describe('isolinhas', () => {
  it('níveis a cada 0,5 m dentro do intervalo', () => {
    expect(isolineLevels(0.8, 2.6)).toEqual([1, 1.5, 2, 2.5]);
    expect(isolineLevels(0, 0.4)).toEqual([]);
    expect(isolineLevels(1.0, 1.4)).toEqual([]);
    expect(isolineLevels(0.2, 1.1)).toEqual([0.5, 1]);
  });

  it('marching squares: rampa em x dá uma linha vertical no sítio certo; NaN corta', () => {
    // 3×3, valores = x (0,1,2) — isolinha 0,5 em x=0,5
    const g = [0, 1, 2, 0, 1, 2, 0, 1, 2];
    const segs = marchingSquares(g, 3, 3, 0.5);
    expect(segs.length).toBe(2);
    for (const [a, b] of segs) {
      expect(a[0]).toBeCloseTo(0.5, 6);
      expect(b[0]).toBeCloseTo(0.5, 6);
    }
    const holed = [0, 1, 2, NaN, 1, 2, 0, 1, 2];
    expect(marchingSquares(holed, 3, 3, 0.5).length).toBe(0);
    // nível fora do intervalo → nada
    expect(marchingSquares(g, 3, 3, 5)).toEqual([]);
  });

  it('rótulo: segmento visível mais perto do alvo, texto sempre legível', () => {
    const segs = [
      [[10, 10], [20, 10]],
      [[200, 100], [190, 120]],
      [[1000, 100], [1010, 100]],
    ] as const;
    const lab = pickIsolineLabel(segs as never, 1.5, { x0: 0, y0: 0, x1: 500, y1: 500 }, { x: 190, y: 110 })!;
    expect(lab.level).toBe(1.5);
    expect(lab.x).toBe(195);
    expect(Math.abs(lab.angle)).toBeLessThanOrEqual(Math.PI / 2);
    expect(pickIsolineLabel([], 1, { x0: 0, y0: 0, x1: 1, y1: 1 }, { x: 0, y: 0 })).toBeNull();
  });
});

describe('cristas', () => {
  it('malha com espaçamento constante em píxeis — independente do zoom, ancorada à origem', () => {
    const a = buildCrestLattice(300, 200, 0, 0);
    const b = buildCrestLattice(300, 200, 0, 0);
    expect(a).toEqual(b); // determinística (seed por célula)
    // densidade ≈ área / (S · S·0,866), qualquer que seja o zoom do mapa
    const S = SWELL_CREST_SPACING_PX;
    const expected = ((300 + 2 * S) * (200 + 2 * S)) / (S * S * 0.866);
    expect(a.length).toBeGreaterThan(expected * 0.7);
    expect(a.length).toBeLessThan(expected * 1.3);
    // deslocar a origem de um espaçamento inteiro dá a mesma malha (pan estável)
    const shifted = buildCrestLattice(300, 200, S, 0).map((p) => p.x).sort((x, y) => x - y);
    expect(shifted.length).toBeGreaterThan(0);
    for (const p of a) {
      expect(p.seed).toBeGreaterThanOrEqual(0);
      expect(p.seed).toBeLessThan(1);
    }
  });

  it('fase dentro de [0, S) e mais rápida com período longo', () => {
    for (const t of [0, 1234, 99999]) {
      const ph = crestPhase(t, 12, 0.3);
      expect(ph).toBeGreaterThanOrEqual(0);
      expect(ph).toBeLessThan(SWELL_CREST_SPACING_PX);
    }
    const slow = crestPhase(1000, 6, 0) - crestPhase(0, 6, 0);
    const fast = crestPhase(1000, 16, 0) - crestPhase(0, 16, 0);
    expect(fast).toBeGreaterThan(slow);
  });
});

describe('texto', () => {
  it('rosa dos ventos com «O» em PT e «W» em EN; vírgula decimal', () => {
    expect(compass16(270, 'pt')).toBe('O');
    expect(compass16(292, 'pt')).toBe('ONO');
    expect(compass16(270, 'en')).toBe('W');
    expect(compass16(-45, 'en')).toBe('NW');
    expect(fmt1(1.25, 'pt')).toBe('1,3');
    expect(fmt1(1.25, 'en')).toBe('1.3');
  });
});
