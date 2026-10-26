import { describe, it, expect } from 'vitest';
import { spots } from '@/lib/spots';
import { getAllSportScores } from '@/lib/sportScore';
import { refreshGridSpotScores } from '@/lib/refreshGridSpotScores';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { ktToMs } from '@/lib/scoreConditions';

function mockRow(spotId: string): GridSpotData {
  const spot = spots.find((s) => s.id === spotId)!;
  return {
    spot,
    conditions: {
      waveHeight: 0.5,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(7),
      windDirection: 270,
      windGust: ktToMs(9),
      waterTemp: 18,
    },
    allScores: getAllSportScores(spot, {
      waveHeight: 0.5,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: ktToMs(7),
      windDirection: 270,
      windGust: ktToMs(9),
      waterTemp: 18,
    }),
  };
}

describe('refreshGridSpotScores', () => {
  // #218 PR 3: kitesurf e surf já não se recalculam no cliente (vêm do
  // `notaV6` do pipeline, que aplica as observações frescas — ver o bloco
  // «notaV6» abaixo). O vento observado continua a subir as modalidades do
  // motor antigo (D5): windsurf.
  it('boosts windsurf score when fresh IPMA wind is stronger', () => {
    const row = mockRow('guincho');
    const before = row.allScores.windsurf.score;
    const json = {
      guincho: {
        waveHeight: 0.5,
        wavePeriod: 8,
        waveDirection: 270,
        windSpeed: ktToMs(7),
        windDirection: 270,
        windGust: ktToMs(9),
        waterTemp: 18,
        observed: {
          windSpeedKt: 16,
          windDirDeg: 337,
          windCardinal: 'NNW',
          stationName: 'Cabo Raso',
          distanceKm: 8,
          observedAt: new Date().toISOString(),
          source: 'ipma',
        },
      },
    };
    const [updated] = refreshGridSpotScores([row], json);
    expect(updated.allScores.windsurf.score).toBeGreaterThan(before);
    // sem `notaV6` no ficheiro servido, o kite fica o do bake (nunca o motor antigo no cliente)
    expect(updated.allScores.kitesurf).toBe(row.allScores.kitesurf);
  });

  it('aplica o fallback do viés regional (wave-bias.json) quando a row não tem o meta', () => {
    const row = mockRow('guincho'); // região 'Cascais'
    const json = {
      guincho: {
        waveHeight: 1.5,
        wavePeriod: 8,
        waveDirection: 270,
        windSpeed: ktToMs(7),
        windDirection: 270,
        windGust: ktToMs(9),
        waterTemp: 18,
        // sem waveBias meta (pipeline sem VENTU_WAVE_BIAS_CORRECTION=1)
      },
    };
    const waveBiasFile = {
      fetchedAt: new Date().toISOString(),
      regions: {
        Cascais: { n: 120, me: 0.3, mae: 0.4, rmse: 0.5 },
      },
    };

    const [updated] = refreshGridSpotScores([row], json, waveBiasFile);
    expect(updated.conditions.waveHeight).toBe(1.8); // round1(1.5 + 0.3)
    // O fallback client-side marca `fallback: true` — distingue o tooltip da
    // correcção baked pela pipeline (que não carrega o campo).
    expect(updated.conditions.waveBias).toEqual({
      region: 'Cascais',
      me: 0.3,
      n: 120,
      deltaM: 0.3,
      fallback: true,
    });
    // O score usa a altura corrigida — não a previsão crua (bodyboard, motor
    // antigo; o surf v6 vem do pipeline, PR 3).
    expect(updated.allScores.bodyboard.score).not.toBe(row.allScores.bodyboard.score);
  });

  it('nunca corrige duas vezes: row já com meta waveBias (pipeline) fica intacta', () => {
    const row = mockRow('guincho');
    const json = {
      guincho: {
        waveHeight: 1.8,
        wavePeriod: 8,
        waveDirection: 270,
        windSpeed: ktToMs(7),
        windDirection: 270,
        windGust: ktToMs(9),
        waterTemp: 18,
        waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
      },
    };
    const waveBiasFile = {
      fetchedAt: new Date().toISOString(),
      regions: {
        Cascais: { n: 120, me: 0.3, mae: 0.4, rmse: 0.5 },
      },
    };

    const [updated] = refreshGridSpotScores([row], json, waveBiasFile);
    expect(updated.conditions.waveHeight).toBe(1.8);
    expect(updated.conditions.waveBias).toEqual({
      region: 'Cascais',
      me: 0.3,
      n: 120,
      deltaM: 0.3,
    });
  });

  it('boia fresca ganha ao viés: sem fallback nem meta inventado', () => {
    const row = mockRow('guincho');
    const json = {
      guincho: {
        waveHeight: 1.5,
        wavePeriod: 8,
        waveDirection: 270,
        windSpeed: ktToMs(7),
        windDirection: 270,
        windGust: ktToMs(9),
        waterTemp: 18,
        observedWave: {
          waveHeight: 2.2,
          wavePeriod: 11,
          waveDirection: 280,
          stationName: 'CSA92/D',
          distanceKm: 30, // ≤ 40 km (A5)
          observedAt: new Date().toISOString(),
          source: 'ih-buoy',
        },
      },
    };
    const waveBiasFile = {
      fetchedAt: new Date().toISOString(),
      regions: {
        Cascais: { n: 120, me: 0.3, mae: 0.4, rmse: 0.5 },
      },
    };

    const [updated] = refreshGridSpotScores([row], json, waveBiasFile);
    // A medição fresca entra no score; o viés NÃO é aplicado.
    expect(updated.conditions.waveHeight).toBe(2.2);
    expect(updated.conditions.waveBias).toBeUndefined();
    // A leitura fresca passa às conditions do refresh — o badge «Corrigido
    // pela boia X» e o relógio lêem conditions.observedWave (regressão:
    // antes o refresh descartava a leitura e o badge nunca aparecia).
    expect(updated.conditions.observedWave).toMatchObject({
      stationName: 'CSA92/D',
      waveHeight: 2.2,
    });
  });

  it('row EXISTENTE no ficheiro servido SEM observedWave → a leitura é dropada (o ficheiro é autoritativo)', () => {
    const base = mockRow('guincho');
    const row = {
      ...base,
      conditions: {
        ...base.conditions,
        observedWave: {
          waveHeight: 2.2,
          wavePeriod: 11,
          waveDirection: 280,
          stationName: 'CSA92/D',
          distanceKm: 30, // ≤ 40 km (A5)
          observedAt: new Date().toISOString(),
          source: 'ih-buoy' as const,
        },
      },
    };
    const json = {
      guincho: {
        waveHeight: 1.5,
        wavePeriod: 8,
        waveDirection: 270,
        windSpeed: ktToMs(7),
        windDirection: 270,
        windGust: ktToMs(9),
        waterTemp: 18,
        // sem observedWave no ficheiro servido → a pipeline decidiu «sem leitura»
      },
    };

    const [updated] = refreshGridSpotScores([row], json, null);
    // Ficheiro novo é autoritativo: ressuscitar a leitura de um snapshot
    // anterior mostrá-la-ia como «fresca» com um dado velho — mentira honesta
    // que o badge/sufixo never pode fazer. A row sem leitura fica sem leitura.
    expect(updated.conditions.observedWave).toBeUndefined();
    // A previsão continua (só a leitura caiu).
    expect(updated.conditions.waveHeight).toBe(1.5);
  });

  it('row EXISTENTE no ficheiro servido SEM waveBias → o meta SSG é dropado (o ficheiro é autoritativo)', () => {
    const base = mockRow('guincho');
    const row = {
      ...base,
      conditions: {
        ...base.conditions,
        // Correcção baked pela pipeline num build anterior (SSG).
        waveBias: { region: 'Cascais', me: 0.3, n: 120, deltaM: 0.3 },
      },
    };
    const json = {
      guincho: {
        waveHeight: 1.5,
        wavePeriod: 8,
        waveDirection: 270,
        windSpeed: ktToMs(7),
        windDirection: 270,
        windGust: ktToMs(9),
        waterTemp: 18,
        // sem waveBias no ficheiro servido → a pipeline decidiu «sem correcção»
      },
    };

    const [updated] = refreshGridSpotScores([row], json, null);
    // Nunca ressuscitar o meta de um snapshot de build anterior: o badge
    // «Corrigido (viés regional)» com tooltip «correcção em tempo real» sobre
    // um dado velho é uma mentira — o ficheiro servido manda (mesma política
    // do observedWave).
    expect(updated.conditions.waveBias).toBeUndefined();
    expect(updated.conditions.waveHeight).toBe(1.5);
  });

  it('spot AUSENTE do ficheiro servido → a row SSG inteira é preservada', () => {
    const base = mockRow('guincho');
    const row = {
      ...base,
      conditions: {
        ...base.conditions,
        observedWave: {
          waveHeight: 2.2,
          wavePeriod: 11,
          waveDirection: 280,
          stationName: 'CSA92/D',
          distanceKm: 30, // ≤ 40 km (A5)
          observedAt: new Date().toISOString(),
          source: 'ih-buoy' as const,
        },
      },
    };
    // O ficheiro servido nem conhece o spot (ex. per-spot cache parcial).
    const json: Record<string, unknown> = {};

    const [updated] = refreshGridSpotScores([row], json, null);
    // Sem entrada nenhuma, não há decisão nova: a row hídrica mantém-se.
    expect(updated.conditions.observedWave).toMatchObject({ stationName: 'CSA92/D' });
    expect(updated).toBe(row);
  });

  it('sem wave-bias.json (null) → nunca corrige nem inventa meta', () => {
    const row = mockRow('guincho');
    const json = {
      guincho: {
        waveHeight: 1.5,
        wavePeriod: 8,
        waveDirection: 270,
        windSpeed: ktToMs(7),
        windDirection: 270,
        windGust: ktToMs(9),
        waterTemp: 18,
      },
    };

    const [updated] = refreshGridSpotScores([row], json, null);
    expect(updated.conditions.waveHeight).toBe(1.5);
    expect(updated.conditions.waveBias).toBeUndefined();
  });
});

describe('refreshGridSpotScores — notaV6 do pipeline (#218, PR 3)', () => {
  const base = {
    waveHeight: 1.5,
    wavePeriod: 10,
    waveDirection: 300,
    windSpeed: ktToMs(18),
    windDirection: 340,
    windGust: ktToMs(22),
    waterTemp: 18,
  };

  it('kitesurf e surf = notaV6 × 10 (uma atribuição); as outras no motor antigo', () => {
    const row = mockRow('guincho');
    const json = {
      guincho: {
        ...base,
        notaV6: {
          t: '2026-09-08T14:00',
          kite: 7,
          surf: 4,
          seg: 'side-offshore',
          f: { kite: ['18kt wind', 'side-offshore'], surf: ['1.5m waves', '10s period'] },
        },
      },
    };
    const [u] = refreshGridSpotScores([row], json);
    expect(u.allScores.kitesurf.score).toBe(70);
    expect(u.allScores.surf.score).toBe(40);
    expect(u.allScores.kitesurf.factorsEn).toEqual(['18kt wind', 'side-offshore']);
    expect(u.allScores.kitesurf.factors).toEqual(['18kt vento', 'side-offshore']);
    expect(u.allScores.kitesurf.directionSafety).toBe('side-offshore');
    expect(u.allScores.surf.primaryFactor).toBe('1.5m');
    expect(u.allScores.windsurf.score).toBe(getAllSportScores(row.spot, base).windsurf.score);
  });

  it('noite: score 0 com a marca `noite` (não «0 · Não dá»)', () => {
    const row = mockRow('guincho');
    const [u] = refreshGridSpotScores([row], {
      guincho: { ...base, notaV6: { t: '2026-09-08T23:00', kite: null, surf: null } },
    });
    expect(u.allScores.kitesurf).toMatchObject({ score: 0, rating: 'N/A', noite: true });
    expect(u.allScores.surf).toMatchObject({ score: 0, rating: 'N/A', noite: true });
  });

  it('spot com conditionsSource lê o notaV6 da PRÓPRIA linha (a praia é a dele)', () => {
    const alias = spots.find((s) => s.conditionsSource);
    expect(alias).toBeDefined();
    const row = mockRow(alias!.id);
    const json = {
      [alias!.conditionsSource!]: { ...base, notaV6: { t: '2026-09-08T14:00', kite: 9, surf: 9 } },
      [alias!.id]: { ...base, notaV6: { t: '2026-09-08T14:00', kite: 2, surf: 3 } },
    };
    const [u] = refreshGridSpotScores([row], json);
    expect(u.allScores.kitesurf.score).toBe(20);
    expect(u.allScores.surf.score).toBe(30);
  });

  it('notaV6 estragado no ficheiro servido é ignorado (fica o bake)', () => {
    const row = mockRow('guincho');
    const [u] = refreshGridSpotScores([row], {
      guincho: { ...base, notaV6: { t: 'x', kite: 'sete', surf: 4 } },
    });
    expect(u.allScores.kitesurf).toBe(row.allScores.kitesurf);
    expect(u.allScores.surf).toBe(row.allScores.surf);
  });
});
