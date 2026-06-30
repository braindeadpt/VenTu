import { describe, it, expect } from 'vitest';
import {
  filterGridSpots,
  spotMeetsOnFilter,
  MAP_ON_THRESHOLD,
} from '../gridSpotFilters';
import type { GridSpotData } from '../gridSpotFilters';
import type { Spot } from '@/types';

function spot(overrides: Partial<Spot> & Pick<Spot, 'id' | 'slug'>): Spot {
  return {
    name: overrides.slug,
    nameEn: overrides.slug,
    region: 'Test',
    regionEn: 'Test',
    lat: 41,
    lon: -8,
    coastOrientation: 270,
    type: 'multisport',
    difficulty: 'intermediate',
    bestWind: 'NW',
    bestSwell: 'SW',
    description: '',
    descriptionEn: '',
    facilities: [],
    hazards: [],
    compatibleSports: ['surf', 'kitesurf'],
    ...overrides,
  } as Spot;
}

function row(
  spotDef: Spot,
  scores: Partial<Record<'surf' | 'kitesurf', number>>,
): GridSpotData {
  const allScores = {
    surf: { score: scores.surf ?? 0, rating: '', ratingEn: '', factors: [], primaryFactor: '' },
    kitesurf: { score: scores.kitesurf ?? 0, rating: '', ratingEn: '', factors: [], primaryFactor: '' },
    windsurf: { score: 0, rating: '', ratingEn: '', factors: [], primaryFactor: '' },
    wakeboard: { score: 0, rating: '', ratingEn: '', factors: [], primaryFactor: '' },
    bodyboard: { score: 0, rating: '', ratingEn: '', factors: [], primaryFactor: '' },
    sup: { score: 0, rating: '', ratingEn: '', factors: [], primaryFactor: '' },
    foil: { score: 0, rating: '', ratingEn: '', factors: [], primaryFactor: '' },
  };
  return {
    spot: spotDef,
    conditions: {
      windSpeed: 5,
      windDirection: 270,
      waveHeight: 1,
      wavePeriod: 8,
      waveDirection: 270,
      windGust: 5,
      waterTemp: 16,
    },
    allScores,
  };
}

describe('spotMeetsOnFilter', () => {
  it('requires score at or above MAP_ON_THRESHOLD for selected sport', () => {
    const on = row(spot({ id: 'a', slug: 'a' }), { kitesurf: MAP_ON_THRESHOLD });
    const off = row(spot({ id: 'b', slug: 'b' }), { kitesurf: MAP_ON_THRESHOLD - 1 });
    expect(spotMeetsOnFilter(on, 'kitesurf')).toBe(true);
    expect(spotMeetsOnFilter(off, 'kitesurf')).toBe(false);
  });

  it('filterGridSpots onlyOn keeps ON spots for sport filter', () => {
    const on = row(spot({ id: 'a', slug: 'a' }), { surf: 80 });
    const off = row(spot({ id: 'b', slug: 'b' }), { surf: 10 });
    const result = filterGridSpots([on, off], 'surf', 'Todos', { onlyOn: true });
    expect(result.map((d) => d.spot.slug)).toEqual(['a']);
  });
});
