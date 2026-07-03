import { describe, it, expect } from 'vitest';
import { getMapSpotNarrative } from '../mapSpotNarrative';
import type { SportType } from '../sportRatings';
import type { SportScore } from '../sportScore';
import type { Spot } from '@/types';

const emptyScores = Object.fromEntries(
  (['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'] as SportType[]).map(
    (s) => [s, { score: 0, rating: '', ratingEn: '', factors: [], primaryFactor: '' }],
  ),
) as unknown as Record<SportType, SportScore>;

const baseSpot: Spot = {
  id: 'test',
  slug: 'test',
  name: 'Test',
  nameEn: 'Test',
  region: 'Test',
  regionEn: 'Test',
  lat: 38,
  lon: -9,
  coastOrientation: 270,
  type: 'kitesurf',
  difficulty: 'beginner',
  bestWind: 'NW',
  bestSwell: 'Lagoa',
  description: '',
  descriptionEn: '',
  facilities: ['Escola kite'],
  hazards: [],
  compatibleSports: ['kitesurf'],
};

const conditions = {
  windSpeed: 8,
  windDirection: 315,
  waveHeight: 0.2,
  wavePeriod: 6,
  waveDirection: 270,
  windGust: 10,
  waterTemp: 18,
  swellHeight: 0.2,
  swellPeriod: 6,
};

describe('getMapSpotNarrative', () => {
  it('includes tier phrase and kite context in PT', () => {
    const scores = {
      ...emptyScores,
      kitesurf: { score: 75, rating: 'Bom', ratingEn: 'Good', factors: [], primaryFactor: 'wind' },
    };
    const line = getMapSpotNarrative(baseSpot, conditions, scores, 'kitesurf', true);
    expect(line).toContain('dá uns sets fáceis');
    expect(line).toContain('água plana');
    expect(line).toMatch(/\d+kt/);
  });

  it('uses surf metrics when surf filter is active', () => {
    const surfSpot: Spot = {
      ...baseSpot,
      type: 'surf',
      bestSwell: 'W, NW',
      compatibleSports: ['surf'],
    };
    const scores = {
      ...emptyScores,
      surf: { score: 82, rating: 'Épico', ratingEn: 'Epic', factors: [], primaryFactor: 'waves' },
    };
    const line = getMapSpotNarrative(surfSpot, conditions, scores, 'surf', false);
    expect(line).toContain('epic day');
    expect(line).toMatch(/0\.\d+m/);
  });
});
