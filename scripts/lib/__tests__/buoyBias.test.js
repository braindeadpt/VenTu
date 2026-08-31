import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  alignPairs,
  parseSpotsWithRegions,
  computeBias,
  aggregateRegions,
  applyWaveBias,
  MIN_BIAS_N,
  MIN_BIAS_M,
  MAX_BIAS_M,
} = require('../buoyBias.js');

describe('parseSpotsWithRegions', () => {
  it('extrai id/lat/lon/region de todos os spots (185, sem duplicados)', () => {
    const spots = parseSpotsWithRegions();
    expect(spots.length).toBeGreaterThanOrEqual(180);
    expect(spots.length).toBe(185);
    const ids = new Set(spots.map((s) => s.id));
    expect(ids.size).toBe(spots.length);
    for (const s of spots) {
      expect(typeof s.id).toBe('string');
      expect(Number.isFinite(s.lat)).toBe(true);
      expect(Number.isFinite(s.lon)).toBe(true);
      expect(typeof s.region).toBe('string');
      expect(s.region.length).toBeGreaterThan(0);
    }
  });

  it('mapeia um spot conhecido para a sua região (Nazaré → Oeste)', () => {
    const spots = parseSpotsWithRegions();
    const nazare = spots.find((s) => s.id === 'nazare');
    expect(nazare).toBeDefined();
    expect(nazare.region).toBe('Oeste');
    expect(nazare.lat).toBeCloseTo(39.597, 2);
  });

  it('não inclui aliases nem spots sem região (todos têm region hoje)', () => {
    const spots = parseSpotsWithRegions();
    const aliasIds = spots.filter((s) =>
      ['foil-fao-cavado', 'foil-esposende-piscinas', 'obidos-lagoon-sul', 'obidos-lagoon-foz'].includes(
        s.id,
      ),
    );
    // Os aliases também têm region em spots.ts — mas o parser exige region,
    // por isso qualquer spot sem region seria omitido (hoje: nenhum).
    expect(aliasIds.length).toBe(4);
  });
});

describe('alignPairs', () => {
  it('emparelha observações com o modelo na mesma hora UTC', () => {
    const obs = [
      { date: '2026-08-14T12:30:00+0000', hm0: 1.8 },
      { date: '2026-08-14T13:00:00+0000', hm0: 1.9 },
      { date: '2026-08-14T15:10:00+0000', hm0: 2.0 }, // sem hora no modelo → descartada
    ];
    const model = [
      { time: '2026-08-14T12:00:00', waveHeight: 1.5 },
      { time: '2026-08-14T13:00:00', waveHeight: 1.7 },
    ];
    const pairs = alignPairs(obs, model);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({ time: '2026-08-14T12:00', observed: 1.8, model: 1.5 });
    expect(pairs[1]).toEqual({ time: '2026-08-14T13:00', observed: 1.9, model: 1.7 });
  });

  it('devolve [] sem modelo ou sem observações', () => {
    expect(alignPairs([], [{ time: '2026-08-14T12:00:00', waveHeight: 1.5 }])).toEqual([]);
    expect(alignPairs([{ date: '2026-08-14T12:00:00+0000', hm0: 1 }], [])).toEqual([]);
  });
});

describe('computeBias', () => {
  it('calcula ME/MAE/RMSE/corr sobre pares', () => {
    const pairs = [
      { observed: 2.0, model: 1.5 },
      { observed: 2.2, model: 1.6 },
      { observed: 1.8, model: 1.7 },
    ];
    const s = computeBias(pairs);
    expect(s.n).toBe(3);
    // ME = mean(obs - model) = (0.5 + 0.6 + 0.1)/3 = 0.4
    expect(s.me).toBe(0.4);
    // MAE = (0.5 + 0.6 + 0.1)/3 = 0.4
    expect(s.mae).toBe(0.4);
    // RMSE = sqrt((0.25+0.36+0.01)/3) = 0.4546 → arredondado a 1 casa
    expect(s.rmse).toBe(0.5);
    expect(typeof s.corr).toBe('number');
  });

  it('corr é null com menos de 3 pares e null com lista vazia', () => {
    const two = computeBias([{ observed: 1, model: 1 }, { observed: 2, model: 2 }]);
    expect(two.corr).toBeNull();
    expect(computeBias([])).toBeNull();
    expect(computeBias(null)).toBeNull();
  });
});

describe('aggregateRegions', () => {
  const pairsByBuoy = {
    4: [{ observed: 2.0, model: 1.5 }, { observed: 2.2, model: 1.6 }],
    19: [{ observed: 1.0, model: 1.1 }],
  };
  const spotMapping = {
    'spot-a': { idEst: 4, distanceKm: 40 },
    'spot-b': { idEst: 4, distanceKm: 60 },
    'spot-c': { idEst: 19, distanceKm: 90 },
  };
  const spots = [
    { id: 'spot-a', region: 'Porto' },
    { id: 'spot-b', region: 'Porto' },
    { id: 'spot-c', region: 'Algarve' },
    { id: 'spot-d', region: 'Açores' }, // sem mapeamento → omitido
  ];

  it('agrega por região usando o mapa spot→boia', () => {
    const regions = aggregateRegions(spots, spotMapping, pairsByBuoy);
    expect(Object.keys(regions)).toEqual(['Porto', 'Algarve']);
    expect(regions.Porto.buoys).toEqual([4]);
    expect(regions.Porto.n).toBe(2);
    expect(regions.Algarve.n).toBe(1);
    expect(regions.Açores).toBeUndefined();
  });

  it('ignora spots sem mapeamento ou sem pares', () => {
    const regions = aggregateRegions(spots, {}, pairsByBuoy);
    expect(regions).toEqual({});
  });
});

describe('applyWaveBias', () => {
  const waveBias = {
    regions: {
      'Porto': { n: 120, me: 0.4, mae: 0.5, rmse: 0.6, corr: 0.9 },
      'Pequeno': { n: 120, me: 0.1, mae: 0.3, rmse: 0.4, corr: 0.9 }, // |ME| < min
      'Fraca': { n: 10, me: 0.4, mae: 0.5, rmse: 0.6, corr: 0.9 }, // n < 30
      'Louco': { n: 120, me: 2.0, mae: 2.1, rmse: 2.2, corr: 0.8 }, // > MAX_BIAS_M
    },
  };

  it('aplica a correcção e regista o valor original', () => {
    const current = { waveHeight: 1.5 };
    const meta = applyWaveBias(current, 'Porto', waveBias, true);
    expect(current.waveHeight).toBe(1.9);
    expect(current.waveHeightRaw).toBe(1.5);
    expect(meta).toEqual({ region: 'Porto', me: 0.4, n: 120, deltaM: 0.4 });
  });

  it('não corrige sem flag, sem região, sem viés, amostra fraca ou |ME| fora do intervalo', () => {
    expect(applyWaveBias({ waveHeight: 1.5 }, 'Porto', waveBias, false)).toBeNull();
    expect(applyWaveBias({ waveHeight: 1.5 }, undefined, waveBias, true)).toBeNull();
    expect(applyWaveBias({ waveHeight: 1.5 }, 'Porto', null, true)).toBeNull();
    expect(applyWaveBias({ waveHeight: 1.5 }, 'Fraca', waveBias, true)).toBeNull();
    expect(applyWaveBias({ waveHeight: 1.5 }, 'Pequeno', waveBias, true)).toBeNull();
    expect(applyWaveBias({ waveHeight: 1.5 }, 'Louco', waveBias, true)).toBeNull();
    expect(applyWaveBias({ waveHeight: 1.5 }, 'SemBias', waveBias, true)).toBeNull();
  });

  it('clampa em 0.1 m e não muda quando a correcção é menor que 0.05 m', () => {
    // |ME|=2.0 > MAX_BIAS_M → descartado antes do clamp
    expect(
      applyWaveBias({ waveHeight: 0.0 }, 'Porto', { regions: { 'Porto': { n: 100, me: -2.0 } } }, true),
    ).toBeNull();
    // clamp ≥ 0.1 (o meta devolvido não tem waveHeight; o objecto é mutado)
    const clamped = { waveHeight: 0.0 };
    const clampMeta = applyWaveBias(
      clamped,
      'Porto',
      { regions: { 'Porto': { n: 100, me: -0.2 } } },
      true,
    );
    expect(clampMeta).not.toBeNull();
    expect(clamped.waveHeight).toBe(0.1);
    // |ME| < MIN_BIAS_M → nada
    expect(
      applyWaveBias({ waveHeight: 1.5 }, 'Porto', { regions: { 'Porto': { n: 100, me: 0.04 } } }, true),
    ).toBeNull();
    expect(MIN_BIAS_N).toBe(30);
    expect(MIN_BIAS_M).toBe(0.15);
    expect(MAX_BIAS_M).toBe(1.5);
  });
});
