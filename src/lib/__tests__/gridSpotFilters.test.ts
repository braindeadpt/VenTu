import { describe, it, expect } from 'vitest';
import { filterGridSpots, spotMatchesSportFilter } from '../gridSpotFilters';
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
    ...overrides,
  } as Spot;
}

function data(
  spotDef: Spot,
  scores: Partial<Record<'surf' | 'kitesurf' | 'windsurf', number>>,
): GridSpotData {
  const allScores = {
    surf: { score: scores.surf ?? 0, rating: '', ratingEn: '', factors: [] },
    kitesurf: { score: scores.kitesurf ?? 0, rating: '', ratingEn: '', factors: [] },
    windsurf: { score: scores.windsurf ?? 0, rating: '', ratingEn: '', factors: [] },
    wakeboard: { score: 0, rating: '', ratingEn: '', factors: [] },
    bodyboard: { score: 0, rating: '', ratingEn: '', factors: [] },
    sup: { score: 0, rating: '', ratingEn: '', factors: [] },
    foil: { score: 0, rating: '', ratingEn: '', factors: [] },
  };
  return {
    spot: spotDef,
    conditions: { windSpeed: 5, windDirection: 270, waveHeight: 1, wavePeriod: 8 },
    allScores,
  };
}

describe('spotMatchesSportFilter', () => {
  const cabedelo = data(
    spot({
      id: 'cabedelo',
      slug: 'cabedelo',
      compatibleSports: ['kitesurf', 'windsurf', 'surf'],
    }),
    { kitesurf: 12, windsurf: 10, surf: 55 },
  );

  it('includes compatible spots even when score is below playable threshold', () => {
    expect(spotMatchesSportFilter(cabedelo, 'kitesurf')).toBe(true);
    expect(spotMatchesSportFilter(cabedelo, 'windsurf')).toBe(true);
    expect(filterGridSpots([cabedelo], 'kitesurf', 'Todos')).toHaveLength(1);
  });

  it('excludes spots that do not support the sport', () => {
    const surfOnly = data(
      spot({ id: 'a', slug: 'a', compatibleSports: ['surf'] }),
      { surf: 80, kitesurf: 0 },
    );
    expect(spotMatchesSportFilter(surfOnly, 'kitesurf')).toBe(false);
  });
});
