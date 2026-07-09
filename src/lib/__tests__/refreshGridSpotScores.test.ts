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
});
