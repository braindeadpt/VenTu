import { describe, it, expect } from 'vitest';
import { includeSpotInViewportBounds } from '@/components/spots/mapViewportBounds';
import { getBestScore, type MapSpotData } from '@/components/spots/mapSpotData';
import type { Spot } from '@/types';
import type { SportScore } from '@/lib/sportScore';

function spot(partial: Partial<Spot> & Pick<Spot, 'id' | 'region'>): Spot {
  return {
    slug: partial.id,
    name: partial.id,
    nameEn: partial.id,
    regionEn: partial.region,
    lat: 38,
    lon: -9,
    coastOrientation: 270,
    type: 'beach',
    difficulty: 'intermediate',
    bestWind: 'N',
    bestSwell: 'W',
    description: '',
    descriptionEn: '',
    facilities: [],
    hazards: [],
    compatibleSports: ['surf'],
    ...partial,
  } as Spot;
}

describe('includeSpotInViewportBounds', () => {
  it('excludes islands from default continental viewport', () => {
    const madeira = spot({ id: 'seixal', region: 'Madeira' });
    expect(includeSpotInViewportBounds(madeira, 'Todos')).toBe(false);
    expect(includeSpotInViewportBounds(madeira, 'Portugal')).toBe(false);
  });

  it('includes Madeira when filtered to Madeira', () => {
    const madeira = spot({ id: 'seixal', region: 'Madeira' });
    expect(includeSpotInViewportBounds(madeira, 'Madeira')).toBe(true);
  });
});

describe('getBestScore', () => {
  const score = (n: number) => ({ score: n }) as unknown as SportScore;

  const data = {
    spot: spot({ id: 'guincho', region: 'Cascais' }),
    conditions: {
      waveHeight: 1,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: 5,
      windDirection: 315,
      windGust: 7,
      waterTemp: 18,
    },
    allScores: {
      surf: score(40),
      kitesurf: score(80),
      windsurf: score(60),
      wingfoil: score(50),
      bodyboard: score(30),
      SUP: score(20),
    },
  } as unknown as MapSpotData;

  it('returns sport-specific score', () => {
    expect(getBestScore(data, 'kitesurf')).toBe(80);
  });

  it('returns max when sport is all', () => {
    expect(getBestScore(data, 'all')).toBe(80);
  });

  it('uses scoreOverride when provided', () => {
    expect(getBestScore(data, 'kitesurf', 12)).toBe(12);
    expect(getBestScore(data, 'all', 99)).toBe(99);
  });
});
