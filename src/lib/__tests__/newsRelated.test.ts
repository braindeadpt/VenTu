import { describe, expect, it } from 'vitest';
import { getRelatedNewsForSpot } from '../news';
import type { NewsItem } from '@/types';
import type { Spot } from '@/types';

const ericeiraSpot: Spot = {
  id: 'coxos',
  slug: 'coxos',
  name: 'Coxos',
  nameEn: 'Coxos',
  region: 'Ericeira',
  regionEn: 'Ericeira',
  lat: 39,
  lon: -9.4,
  type: 'surf',
  difficulty: 'advanced',
  bestWind: 'N',
  bestSwell: 'W',
  description: '',
  descriptionEn: '',
  compatibleSports: ['surf', 'bodyboard'],
};

const sampleNews: NewsItem[] = [
  {
    id: '1',
    title: 'Liga MEO em Ericeira',
    titleEn: 'Liga MEO at Ericeira',
    summary: 'Ribeira d Ilhas',
    summaryEn: 'Ribeira d Ilhas',
    category: 'surf',
    source: 'ANS',
    sourceType: 'rss',
    url: 'https://example.com/1',
    publishedAt: '2026-05-24T12:00:00.000Z',
    sourceRegion: 'pt',
    tags: ['cena-pt'],
  },
  {
    id: '2',
    title: 'Random US headline',
    titleEn: 'Random US headline',
    summary: 'California',
    summaryEn: 'California',
    category: 'surf',
    source: 'Stab',
    sourceType: 'rss',
    url: 'https://example.com/2',
    publishedAt: '2026-05-23T12:00:00.000Z',
    sourceRegion: 'intl',
  },
  {
    id: '3',
    title: 'Vento forte em coxos',
    titleEn: 'Strong wind at coxos',
    summary: 'Data',
    summaryEn: 'Data',
    category: 'kitesurf',
    source: 'VenTu',
    sourceType: 'data',
    url: 'https://ventu.surf',
    publishedAt: '2026-05-25T08:00:00.000Z',
    tags: ['coxos'],
  },
];

describe('getRelatedNewsForSpot', () => {
  it('prioritises slug tags and local titles over generic intl', () => {
    const related = getRelatedNewsForSpot(sampleNews, ericeiraSpot, { sport: 'surf', limit: 3 });
    expect(related[0]?.id).toBe('3');
    expect(related.some((n) => n.id === '1')).toBe(true);
    expect(related.some((n) => n.id === '2')).toBe(false);
  });

  it('matches by spot slug in tags', () => {
    const related = getRelatedNewsForSpot(sampleNews, ericeiraSpot, { limit: 5 });
    expect(related.find((n) => n.id === '3')).toBeDefined();
  });
});
