import { describe, it, expect } from 'vitest';
import { ENSEMBLE_MIN_MEMBERS, parseEnsemble } from '../ensembleBand';

/** Array no contrato do produtor: 3 quantis de onda + 3 de vento + contagens. */
const row = (wave: unknown[], wind: unknown[], n: [number, number]) => [
  ...wave,
  ...wind,
  n[0],
  n[1],
];

describe('parseEnsemble (banda P10/P50/P90 por spot-hora)', () => {
  it('descodifica as duas famílias com as suas contagens', () => {
    const band = parseEnsemble(row([1.2, 1.7, 2.1], [6.2, 7.0, 7.8], [4, 4]));
    expect(band).toEqual({
      wave: { p10: 1.2, p50: 1.7, p90: 2.1, n: 4 },
      wind: { p10: 6.2, p50: 7.0, p90: 7.8, n: 4 },
    });
  });

  it('família com quantis nulos cai para null (mas a outra sobrevive)', () => {
    const band = parseEnsemble(row([null, null, null], [6.2, 7.0, 7.8], [2, 4]));
    expect(band?.wave).toBeNull();
    expect(band?.wind).toEqual({ p10: 6.2, p50: 7.0, p90: 7.8, n: 4 });
  });

  it('contagem abaixo do mínimo invalida a família mesmo com quantis presentes', () => {
    const band = parseEnsemble(
      row([1.2, 1.7, 2.1], [6.2, 7.0, 7.8], [ENSEMBLE_MIN_MEMBERS - 1, 4]),
    );
    expect(band?.wave).toBeNull();
    expect(band?.wind).not.toBeNull();
  });

  it('sem nenhuma família válida devolve null (nada a desenhar)', () => {
    expect(parseEnsemble(row([null, null, null], [null, null, null], [2, 0]))).toBeNull();
  });

  it('shape inesperado devolve null', () => {
    expect(parseEnsemble(undefined)).toBeNull();
    expect(parseEnsemble(null)).toBeNull();
    expect(parseEnsemble([1, 2, 3])).toBeNull();
    expect(parseEnsemble('1,2,3')).toBeNull();
    expect(parseEnsemble([1.2, 1.7, 2.1, 6.2, 7.0, 7.8, 4])).toBeNull(); // 7 valores
  });

  it('quantil não numérico (NaN/string) invalida a família', () => {
    expect(parseEnsemble(row([1.2, NaN, 2.1], [6.2, 7.0, 7.8], [4, 4]))?.wave).toBeNull();
    expect(parseEnsemble(row(['1.2', 1.7, 2.1], [6.2, 7.0, 7.8], [4, 4]))?.wave).toBeNull();
  });
});
