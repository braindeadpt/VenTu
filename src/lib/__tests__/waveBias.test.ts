import { describe, expect, it } from 'vitest';
import { parseWaveBiasBuoys } from '../waveBias';

describe('parseWaveBiasBuoys (About — viés por boia ondas, IH + ES)', () => {
  it('extrai boias IH e ES (source ih/wmo-es) com stats usáveis, ordenadas por nome e com origem', () => {
    const raw = {
      fetchedAt: '2026-08-15T06:00:00.000Z',
      buoys: {
        '4': { name: 'Leixões', area: 'Norte', source: 'ih', n: 45, me: 0.1, mae: 0.3, rmse: 0.4, corr: 0.9 },
        '6200085': { name: 'Golfo de Cádiz', area: 'Golfo de Cádiz', source: 'wmo-es', n: 38, me: -0.12, mae: 0.34, rmse: 0.41, corr: 0.93 },
        '6200084': { name: 'Cabo Silleiro', area: 'Galiza', source: 'wmo-es', n: 40, me: 0.28, mae: 0.4, rmse: 0.52, corr: 0.91 },
      },
      coherenceGate: { day: '2026-08-14', gatedCodes: ['6200084'] },
    };
    // Ordenadas por nome (localeCompare), com a origem correcta por boia.
    const data = parseWaveBiasBuoys(raw);
    expect(data.hasData).toBe(true);
    expect(data.buoys.map((b) => b.code)).toEqual(['6200084', '6200085', '4']);
    expect(data.buoys[0]).toMatchObject({ name: 'Cabo Silleiro', source: 'wmo-es', me: 0.28, mae: 0.4, rmse: 0.52, n: 40, corr: 0.91 });
    expect(data.buoys[1]).toMatchObject({ area: 'Golfo de Cádiz', source: 'wmo-es' });
    expect(data.buoys[2]).toMatchObject({ name: 'Leixões', source: 'ih', me: 0.1, mae: 0.3, rmse: 0.4, n: 45, corr: 0.9 });
    expect(data.gatedCodes).toEqual(['6200084']);
    expect(data.coherenceDay).toBe('2026-08-14');
  });

  it('marca regionAttribution=false quando a boia foi excluída por coerência', () => {
    const raw = {
      buoys: {
        '6200084': { name: 'Cabo Silleiro', source: 'wmo-es', n: 40, me: 0.28, mae: 0.4, rmse: 0.52, regionAttribution: false },
      },
    };
    const data = parseWaveBiasBuoys(raw);
    expect(data.buoys[0].regionAttribution).toBe(false);
  });

  it('salta boias sem stats válidos (n ausente/zero, me/mae/rmse não finitos)', () => {
    const raw = {
      buoys: {
        '6200084': { name: 'Cabo Silleiro', source: 'wmo-es', n: 0, me: 0.2, mae: 0.4, rmse: 0.5 },
        '6200083': { name: 'Villano', source: 'wmo-es', me: 0.1, mae: 0.3, rmse: 0.4 },
        '6200085': { name: 'Cádiz', source: 'wmo-es', n: 38, me: NaN, mae: 0.3, rmse: 0.4 },
        '6200024': { name: 'Bilbao', source: 'wmo-es', n: 22, me: 0.1, mae: 0.3, rmse: 0.4, regionAttribution: false },
      },
    };
    const data = parseWaveBiasBuoys(raw);
    expect(data.buoys).toHaveLength(1);
    expect(data.buoys[0].code).toBe('6200024');
  });

  it('boias IH suficientes → hasData true mesmo sem ES (secção visível só com IH_API_KEY)', () => {
    const raw = {
      buoys: {
        '4': { name: 'Leixões', area: 'Norte', source: 'ih', n: 45, me: 0.1, mae: 0.3, rmse: 0.4 },
        '7': { name: 'Sines', area: 'Alentejo', source: 'ih', n: 30, me: -0.2, mae: 0.4, rmse: 0.5 },
      },
    };
    const data = parseWaveBiasBuoys(raw);
    expect(data.hasData).toBe(true);
    expect(data.buoys).toHaveLength(2);
    expect(data.buoys.every((b) => b.source === 'ih')).toBe(true);
  });

  it('sem dados ou sem boias com source válida → hasData false (secção escondida)', () => {
    expect(parseWaveBiasBuoys(null).hasData).toBe(false);
    expect(parseWaveBiasBuoys(undefined).hasData).toBe(false);
    expect(parseWaveBiasBuoys({}).hasData).toBe(false);
    expect(parseWaveBiasBuoys({ buoys: {} }).hasData).toBe(false);
    // Sem `source` válida — nunca inventa a origem de uma leitura ambígua.
    expect(parseWaveBiasBuoys({ buoys: { '4': { n: 10, me: 0.1, mae: 0.2, rmse: 0.3 } } }).hasData).toBe(false);
  });
});
