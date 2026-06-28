import { describe, it, expect } from 'vitest';
import type { NewsItem } from '@/types';
import {
  slugify,
  newsSlug,
  getNewsBySlug,
  filterNewsByDate,
  filterNews,
  paginateNews,
  getRelatedNews,
  ITEMS_PER_PAGE,
  type NewsFiltersState,
  DEFAULT_FILTERS,
} from '@/lib/news';

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 'abc123def456',
    title: 'Ondas grandes em Nazaré',
    titleEn: 'Big waves in Nazaré',
    summary: 'Resumo da notícia',
    summaryEn: 'News summary',
    category: 'surf',
    source: 'test',
    sourceType: 'rss',
    url: 'https://example.com',
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips diacritics', () => {
    expect(slugify('Nazaré')).toBe('nazare');
  });

  it('removes leading/trailing hyphens', () => {
    expect(slugify('  --test-- ')).toBe('test');
  });

  it('collapses multiple non-alphanumeric chars', () => {
    expect(slugify('a   b...c')).toBe('a-b-c');
  });
});

describe('newsSlug', () => {
  it('combines slugified title with last 6 chars of id', () => {
    const item = makeItem({ title: 'Big Waves', id: '123456abcdef' });
    expect(newsSlug(item)).toBe('big-waves-abcdef');
  });
});

describe('getNewsBySlug', () => {
  it('finds a news item matching the computed slug', () => {
    const items = [makeItem({ title: 'Test Item', id: '000000slug01' })];
    const slug = newsSlug(items[0]);
    expect(getNewsBySlug(items, slug)).toBe(items[0]);
  });

  it('returns undefined when no match', () => {
    expect(getNewsBySlug([makeItem()], 'no-match')).toBeUndefined();
  });
});

describe('filterNewsByDate', () => {
  it('returns all items when period is "all"', () => {
    const items = [makeItem({ publishedAt: '2020-01-01T00:00:00Z' })];
    expect(filterNewsByDate(items, 'all')).toHaveLength(1);
  });

  it('filters to today only', () => {
    const today = makeItem({ publishedAt: new Date().toISOString() });
    const old = makeItem({ publishedAt: '2020-01-01T00:00:00Z' });
    expect(filterNewsByDate([today, old], 'today')).toEqual([today]);
  });

  it('filters to last 7 days', () => {
    const recent = makeItem({
      publishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    });
    const old = makeItem({ publishedAt: '2020-01-01T00:00:00Z' });
    expect(filterNewsByDate([recent, old], '7d')).toEqual([recent]);
  });

  it('filters to last 30 days', () => {
    const recent = makeItem({
      publishedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    });
    const old = makeItem({ publishedAt: '2020-01-01T00:00:00Z' });
    expect(filterNewsByDate([recent, old], '30d')).toEqual([recent]);
  });
});

describe('filterNews', () => {
  it('filters by category', () => {
    const surf = makeItem({ category: 'surf' });
    const kite = makeItem({ category: 'kitesurf' });
    const filters: NewsFiltersState = { ...DEFAULT_FILTERS, category: 'kitesurf' };
    expect(filterNews([surf, kite], filters)).toEqual([kite]);
  });

  it('filters by region', () => {
    const pt = makeItem({ sourceRegion: 'pt' });
    const intl = makeItem({ sourceRegion: 'intl' });
    const filters: NewsFiltersState = { ...DEFAULT_FILTERS, region: 'pt' };
    expect(filterNews([pt, intl], filters)).toEqual([pt]);
  });

  it('defaults missing sourceRegion to intl for region filter', () => {
    const noRegion = makeItem();
    delete (noRegion as Record<string, unknown>).sourceRegion;
    const filters: NewsFiltersState = { ...DEFAULT_FILTERS, region: 'intl' };
    expect(filterNews([noRegion], filters)).toHaveLength(1);
  });

  it('filters by query across title, titleEn, summary, summaryEn', () => {
    const item = makeItem({ titleEn: 'Giant swell alert' });
    const filters: NewsFiltersState = { ...DEFAULT_FILTERS, query: 'giant' };
    expect(filterNews([item], filters)).toEqual([item]);
  });

  it('returns empty when query does not match', () => {
    const item = makeItem();
    const filters: NewsFiltersState = { ...DEFAULT_FILTERS, query: 'zzzzzzzzz' };
    expect(filterNews([item], filters)).toHaveLength(0);
  });
});

describe('paginateNews', () => {
  it('returns correct pagination for first page', () => {
    const items = Array.from({ length: 25 }, (_, i) =>
      makeItem({ id: `id-${String(i).padStart(12, '0')}` }),
    );
    const result = paginateNews(items, 1);
    expect(result.items).toHaveLength(ITEMS_PER_PAGE);
    expect(result.totalPages).toBe(3);
    expect(result.currentPage).toBe(1);
    expect(result.total).toBe(25);
  });

  it('clamps page to valid range', () => {
    const items = [makeItem()];
    expect(paginateNews(items, 999).currentPage).toBe(1);
    expect(paginateNews(items, -1).currentPage).toBe(1);
  });

  it('returns empty items for empty input with totalPages = 1', () => {
    const result = paginateNews([], 1);
    expect(result.items).toHaveLength(0);
    expect(result.totalPages).toBe(1);
  });
});

describe('getRelatedNews', () => {
  it('returns items of the same category excluding current', () => {
    const current = makeItem({ id: 'current00001', category: 'surf' });
    const related = makeItem({ id: 'related00001', category: 'surf' });
    const other = makeItem({ id: 'other0000001', category: 'kitesurf' });
    expect(getRelatedNews([current, related, other], current)).toEqual([related]);
  });

  it('respects maxCount parameter', () => {
    const current = makeItem({ id: 'current00001', category: 'surf' });
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem({ id: `item-${String(i).padStart(12, '0')}`, category: 'surf' }),
    );
    expect(getRelatedNews(items, current, 2)).toHaveLength(2);
  });
});
