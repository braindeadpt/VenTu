import { describe, it, expect } from 'vitest';
import {
  getTopSpotForSport,
  TOP_NOW_MIN_SCORE,
  type HomepageSpotData,
} from '@/lib/homepageSport';
import type { SportScore } from '@/lib/sportScore';
import type { Spot } from '@/types';

function score(n: number): SportScore {
  return { score: n, rating: '', ratingEn: '', factors: [], primaryFactor: '' };
}

function row(
  slug: string,
  scores: Partial<Record<'surf' | 'kitesurf' | 'windsurf' | 'bodyboard', number>>,
  sports: Array<'surf' | 'kitesurf' | 'windsurf' | 'bodyboard'> = ['surf', 'kitesurf', 'windsurf', 'bodyboard'],
): HomepageSpotData {
  return {
    spot: {
      id: slug,
      slug,
      name: slug,
      nameEn: slug,
      region: 'Lisboa',
      regionEn: 'Lisbon',
      compatibleSports: sports,
    } as Spot,
    conditions: {
      waveHeight: 0.5,
      wavePeriod: 8,
      windSpeed: 5,
      windDirection: 270,
      waterTemp: 18,
    } as HomepageSpotData['conditions'],
    allScores: {
      surf: score(scores.surf ?? 0),
      kitesurf: score(scores.kitesurf ?? 0),
      windsurf: score(scores.windsurf ?? 0),
      bodyboard: score(scores.bodyboard ?? 0),
      wakeboard: score(0),
      sup: score(0),
      foil: score(0),
    },
    bestWindowToday: null,
    bestWindowsBySport: {} as HomepageSpotData['bestWindowsBySport'],
  };
}

describe('getTopSpotForSport «A bombar» threshold', () => {
  it('hides Fraco kite/windsurf from Top Now', () => {
    const data = [
      row('vrsa', { kitesurf: 30 }, ['kitesurf']),
      row('alvor', { windsurf: 34 }, ['windsurf']),
      row('ribeira', { bodyboard: 61 }, ['bodyboard']),
    ];
    expect(getTopSpotForSport(data, 'kitesurf')).toBeNull();
    expect(getTopSpotForSport(data, 'windsurf')).toBeNull();
    expect(getTopSpotForSport(data, 'bodyboard')?.spot.slug).toBe('ribeira');
  });

  it('allows best-available when minScore is 1 (hero tip)', () => {
    const data = [row('vrsa', { kitesurf: 30 }, ['kitesurf'])];
    expect(getTopSpotForSport(data, 'kitesurf', 1)?.spot.slug).toBe('vrsa');
  });

  it('requires Bom+ by default', () => {
    expect(TOP_NOW_MIN_SCORE).toBe(60);
    const data = [row('x', { surf: 56 }, ['surf'])];
    expect(getTopSpotForSport(data, 'surf')).toBeNull();
    expect(getTopSpotForSport(data, 'surf', 56)?.spot.slug).toBe('x');
  });
});
