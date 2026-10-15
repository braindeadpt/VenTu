import { describe, expect, it } from 'vitest';
import { toHomepageSpotLite } from '@/lib/homepageSpotLite';
import type { HomepageSpotData } from '@/lib/homepageSport';
import type { Spot } from '@/types';

describe('toHomepageSpotLite', () => {
  it('retira os textos longos e mantém o que o scoring/cards usam', () => {
    const spot = {
      id: 'ericeira',
      slug: 'ericeira',
      name: 'Ericeira',
      nameEn: 'Ericeira',
      region: 'Lisboa',
      regionEn: 'Lisbon',
      lat: 38.96,
      lon: -9.42,
      type: 'surf',
      difficulty: 'advanced',
      bestWind: 'E',
      bestSwell: 'NW',
      description: 'x'.repeat(500),
      descriptionEn: 'y'.repeat(500),
      facilities: ['Escola de surf'],
      hazards: ['Rochas'],
      localTips: { parking: 'Atrás da igreja' },
      compatibleSports: ['surf'],
    } as Spot;
    const row = { spot, conditions: {}, allScores: {} } as unknown as HomepageSpotData;

    const lite = toHomepageSpotLite(row);
    expect(lite.spot.description).toBe('');
    expect(lite.spot.descriptionEn).toBe('');
    expect(lite.spot.hazards).toEqual([]);
    expect('localTips' in lite.spot).toBe(false);
    // Scoring + cards
    expect(lite.spot.facilities).toEqual(['Escola de surf']);
    expect(lite.spot.bestWind).toBe('E');
    expect(lite.spot.lat).toBe(38.96);
    // Não muta o original (cache de build partilhada entre páginas).
    expect(spot.description).toHaveLength(500);
  });

  it('em pt retira os textos em inglês das notas; nas outras línguas fica tudo', () => {
    const spot = { id: 'guincho', description: '', descriptionEn: '', hazards: [] } as unknown as Spot;
    const nota = {
      score: 74,
      rating: 'Bom',
      ratingEn: 'Good',
      factors: ['2.1m ondas'],
      factorsEn: ['2.1m waves'],
      warning: 'Vento fraco',
      warningEn: 'Light wind',
      primaryFactor: '2.1m',
    };
    const row = { spot, conditions: {}, allScores: { surf: nota } } as unknown as HomepageSpotData;
    const pt = toHomepageSpotLite(row, 'pt').allScores.surf as unknown as Record<string, unknown>;
    expect(pt).toEqual({ score: 74, rating: 'Bom', factors: ['2.1m ondas'], warning: 'Vento fraco', primaryFactor: '2.1m' });
    expect(toHomepageSpotLite(row, 'en').allScores.surf).toEqual(nota);
    expect(toHomepageSpotLite(row).allScores.surf).toEqual(nota);
    // não muta o original
    expect(nota.ratingEn).toBe('Good');
  });
});
