import { describe, it, expect } from 'vitest';
import { compareHomeRanked } from '../HomepageRankedSection';
import type { HomepageSpotData } from '@/lib/homepageSport';
import type { SportScore } from '@/lib/sportScore';
import type { Spot } from '@/types';

function score(n: number): SportScore {
  return { score: n, rating: '', ratingEn: '', factors: [], factorsEn: [], primaryFactor: '' };
}

function row(
  slug: string,
  name: string,
  surfScore: number,
): HomepageSpotData {
  return {
    spot: {
      id: slug,
      slug,
      name,
      nameEn: name,
      region: 'Lisboa',
      regionEn: 'Lisbon',
      type: 'surf',
    } as Spot,
    conditions: {
      waveHeight: 0.5,
      wavePeriod: 8,
      waveDirection: 270,
      windSpeed: 5,
      windDirection: 270,
      windGust: 7,
      waterTemp: 18,
    } as HomepageSpotData['conditions'],
    allScores: {
      surf: score(surfScore),
    } as HomepageSpotData['allScores'],
    bestWindowToday: null,
    bestWindowsBySport: {},
    upcomingWindowsBySport: {},
  };
}

describe('compareHomeRanked (Top 8 da home)', () => {
  it('ordena por score desc', () => {
    const a = row('a', 'Alfa', 70);
    const b = row('b', 'Beta', 90);
    expect(compareHomeRanked(a, b, 'surf', 'pt')).toBeGreaterThan(0);
    expect(compareHomeRanked(b, a, 'surf', 'pt')).toBeLessThan(0);
  });

  it('em empate de score ordena por nome localizado asc', () => {
    const azurara = row('azurara', 'Azurara', 76);
    const povoa = row('povoa-varzim', 'Póvoa do Varzim', 76);
    expect(compareHomeRanked(azurara, povoa, 'surf', 'pt')).toBeLessThan(0);
    expect(compareHomeRanked(povoa, azurara, 'surf', 'pt')).toBeGreaterThan(0);
  });

  it('em empate de score e nome desempata por slug', () => {
    const a = row('aaa-slug', 'Mesmo Nome', 76);
    const b = row('bbb-slug', 'Mesmo Nome', 76);
    expect(compareHomeRanked(a, b, 'surf', 'pt')).toBeLessThan(0);
    expect(compareHomeRanked(b, a, 'surf', 'pt')).toBeGreaterThan(0);
  });

  it('a ordem final não depende da ordem de entrada (empates a 76)', () => {
    const spots = [
      row('azurara', 'Azurara', 76),
      row('mindelo', 'Praia de Mindelo', 76),
      row('moledo', 'Moledo do Minho', 76),
      row('paramos', 'Praia de Paramos', 79),
      row('povoa-varzim', 'Póvoa do Varzim', 76),
    ];
    const sorted = [...spots].sort((a, b) => compareHomeRanked(a, b, 'surf', 'pt'));
    const reversed = [...spots].reverse().sort((a, b) => compareHomeRanked(a, b, 'surf', 'pt'));
    // Colação pt: 'ó' pesa como 'o' → «Póvoa» antes de «Praia».
    expect(sorted.map((s) => s.spot.slug)).toEqual([
      'paramos',
      'azurara',
      'moledo',
      'povoa-varzim',
      'mindelo',
    ]);
    expect(reversed.map((s) => s.spot.slug)).toEqual(sorted.map((s) => s.spot.slug));
  });

  it('respeita o desporto activo no score comparado', () => {
    const a: HomepageSpotData = {
      ...row('a', 'Alfa', 80),
      spot: { ...row('a', 'Alfa', 80).spot, compatibleSports: ['surf', 'kitesurf'] },
      allScores: { surf: score(80), kitesurf: score(10) } as HomepageSpotData['allScores'],
    };
    const b: HomepageSpotData = {
      ...row('b', 'Beta', 60),
      spot: { ...row('b', 'Beta', 60).spot, compatibleSports: ['surf', 'kitesurf'] },
      allScores: { surf: score(60), kitesurf: score(95) } as HomepageSpotData['allScores'],
    };
    expect(compareHomeRanked(a, b, 'surf', 'pt')).toBeLessThan(0);
    expect(compareHomeRanked(a, b, 'kitesurf', 'pt')).toBeGreaterThan(0);
  });
});
