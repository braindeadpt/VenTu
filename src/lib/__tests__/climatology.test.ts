import { describe, expect, it } from 'vitest';
import { spotClimatology, monthlyMax, type ClimatologyFile } from '../climatology';

const file: ClimatologyFile = {
  generatedAt: '2026-01-01T00:00:00Z',
  source: 'NASA POWER (MERRA-2)',
  baseline: '2001-01..2020-12',
  units: { wind: 'm/s', temp: '°C', precip: 'mm/day' },
  spots: {
    cave: {
      wind: [5.3, 5.5, 5.5, 5.3, 5.3, 5.3, 5.7, 5.3, 4.5, 4.9, 5.3, 5.5],
      temp: [11.6, 11.7, 13.1, 14.6, 16.7, 19, 20.1, 20.6, 19.9, 17.9, 14.4, 12.1],
      precip: [2.3, 1.9, 2, 1.9, 1.1, 0.4, 0.1, 0.2, 0.9, 2.7, 3.1, 2.2],
      windAnn: 5.3,
      tempAnn: 16,
      precipAnn: 1.6,
    },
  },
};

describe('climatology (NASA POWER artifact)', () => {
  it('devolve a entrada sanitizada do spot', () => {
    const c = spotClimatology(file, 'cave');
    expect(c?.wind?.[0]).toBe(5.3);
    expect(c?.temp?.[11]).toBe(12.1);
    expect(c?.windAnn).toBe(5.3);
  });

  it('spots em falta ou ficheiro nulo → null (o card não aparece)', () => {
    expect(spotClimatology(file, 'missing')).toBeNull();
    expect(spotClimatology(null, 'cave')).toBeNull();
  });

  it('série com tamanho errado → null (nunca renderiza barras tortas)', () => {
    const bad: ClimatologyFile = {
      ...file,
      spots: { cave: { wind: [1, 2], temp: null, precip: null } },
    };
    expect(spotClimatology(bad, 'cave')?.wind).toBeNull();
  });

  it('monthlyMax ignora nulls e devolve 0 em série vazia', () => {
    expect(monthlyMax([1, null, 5, 3])).toBe(5);
    expect(monthlyMax(null)).toBe(0);
    expect(monthlyMax([null, null])).toBe(0);
  });
});
