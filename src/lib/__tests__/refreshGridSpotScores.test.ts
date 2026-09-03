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
  it('boosts kitesurf score when fresh IPMA wind is stronger', () => {
    const row = mockRow('guincho');
    const before = row.allScores.kitesurf.score;
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
    expect(updated.allScores.kitesurf.score).toBeGreaterThan(before);
    expect(updated.allScores.kitesurf.score).toBeGreaterThan(60);
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
    // O score usa a altura corrigida — não a previsão crua.
    expect(updated.allScores.surf.score).not.toBe(row.allScores.surf.score);
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
          distanceKm: 60,
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
          distanceKm: 60,
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
          distanceKm: 60,
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
