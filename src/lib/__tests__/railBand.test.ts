import { describe, expect, it } from 'vitest';
import {
  MIN_BAND_MARK,
  MIN_BAND_SCALE_M,
  railBandMark,
  railBandScale,
  railBandValue,
  type RailBandHour,
} from '../railBand';

const family = (p10: number, p50: number, p90: number, n = 8) => ({ p10, p50, p90, n });
const withBand = (p10: number, p90: number, n = 8): RailBandHour => ({
  band: family(p10, (p10 + p90) / 2, p90, n),
  wave: p90,
});

describe('railBandScale', () => {
  it('cobre os extremos das horas com banda e das horas só com onda', () => {
    const scale = railBandScale([
      withBand(1, 1.9),
      { wave: 0.8 },
      withBand(2, 3.2),
      { wave: 2.4 },
    ]);
    expect(scale).not.toBeNull();
    expect(scale!.min).toBeLessThanOrEqual(0.8);
    expect(scale!.max).toBeGreaterThanOrEqual(3.2);
  });

  it('nunca é mais fina que MIN_BAND_SCALE_M — pouco mar não vira muita incerteza', () => {
    const scale = railBandScale([withBand(0.45, 0.5), withBand(0.48, 0.52)]);
    expect(scale).not.toBeNull();
    expect(scale!.max - scale!.min).toBeCloseTo(MIN_BAND_SCALE_M, 10);
  });

  it('devolve null sem um único número nem escala inventada', () => {
    expect(railBandScale([])).toBeNull();
    expect(railBandScale([{ wave: null }, { band: null }])).toBeNull();
    expect(railBandScale([{ wave: Number.NaN }])).toBeNull();
  });

  it('ignora famílias com menos de 3 membros ao fixar a escala', () => {
    // Banda fraca a 3,8 m (só 2 membros) — não pode esticar a escala; a hora
    // continua a entrar pela onda prevista (1,4 m).
    const weak: RailBandHour = {
      band: { p10: 3, p50: 3.4, p90: 3.8, n: 2 },
      wave: 1.4,
    };
    const scale = railBandScale([weak, { wave: 1.4 }]);
    expect(scale).not.toBeNull();
    expect(scale!.max).toBeLessThan(1.9);
  });
});

describe('railBandMark', () => {
  const scale = { min: 0.5, max: 3.5 };

  it('sem banda publicável não há marca (e sem escala também não)', () => {
    expect(railBandMark({ wave: 1 }, scale)).toBeNull();
    expect(railBandMark(withBand(1, 2, 2), scale)).toBeNull();
    expect(railBandMark(withBand(1, 2), null)).toBeNull();
    expect(railBandMark(withBand(1, Number.NaN), scale)).toBeNull();
  });

  it('coloca a marca na posição da escala (mais alto = onda maior)', () => {
    const low = railBandMark(withBand(0.6, 0.9), scale)!;
    const high = railBandMark(withBand(3.0, 3.3), scale)!;
    expect(low.top).toBeGreaterThan(high.top);
    expect(high.top).toBeGreaterThanOrEqual(0);
    expect(high.top + high.height).toBeLessThanOrEqual(1);
  });

  it('mantém visível uma banda estreita (os modelos concordam é boa notícia)', () => {
    const mark = railBandMark(withBand(1.4, 1.4), scale)!;
    expect(mark.height).toBeGreaterThanOrEqual(MIN_BAND_MARK);
  });

  it('corta a marca aos limites da lâmina', () => {
    for (const [p10, p90] of [
      [0.1, 0.2],
      [4.5, 5],
      [0.2, 5],
    ]) {
      const mark = railBandMark(withBand(p10, p90), scale)!;
      expect(mark.top).toBeGreaterThanOrEqual(0);
      expect(mark.top + mark.height).toBeLessThanOrEqual(1 + 1e-9);
      expect(mark.height).toBeLessThanOrEqual(1);
    }
  });
});

describe('railBandValue', () => {
  it('devolve os números da hora escolhida', () => {
    expect(railBandValue(withBand(1, 1.9, 12))).toEqual({ p10: 1, p90: 1.9, n: 12 });
  });

  it('cala-se quando não há banda publicável (nunca inventa um intervalo)', () => {
    expect(railBandValue(undefined)).toBeNull();
    expect(railBandValue({ wave: 1.4 })).toBeNull();
    expect(railBandValue(withBand(1, 1.9, 2))).toBeNull();
    expect(railBandValue(withBand(1, 1.9, 3.5))).toBeNull();
  });
});
