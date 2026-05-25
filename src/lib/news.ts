import type { NewsItem, Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getMacroRegion } from '@/lib/regions';

export const ITEMS_PER_PAGE = 12;

export const CATEGORIES = ['all', 'surf', 'kitesurf', 'windsurf', 'big-wave', 'sup', 'foil', 'bodyboard', 'wakeboard', 'safety', 'general', 'competition', 'alert'] as const;
export type NewsCategory = typeof CATEGORIES[number];

export const DATE_FILTERS = ['today', '7d', '30d', 'all'] as const;
export type DateFilter = typeof DATE_FILTERS[number];

export const REGION_FILTERS = ['all', 'pt', 'intl'] as const;
export type RegionFilter = typeof REGION_FILTERS[number];

export interface NewsFiltersState {
  category: NewsCategory;
  period: DateFilter;
  region: RegionFilter;
  query: string;
  page: number;
}

export const DEFAULT_FILTERS: NewsFiltersState = {
  category: 'all',
  period: 'all',
  region: 'all',
  query: '',
  page: 1,
};

/** PT locale: default to Cena PT when URL has no region param. */
export function getDefaultNewsRegion(locale: string): RegionFilter {
  return locale === 'pt' ? 'pt' : 'all';
}

// Stable deterministic slug: strip diacritics → lowercase → collapse non-alphanumeric → truncate
// Appending last 6 chars of the item's UUID avoids collisions from identical titles
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function newsSlug(item: NewsItem): string {
  const base = slugify(item.title);
  const hash = item.id.slice(-6);
  return `${base}-${hash}`;
}

export function getNewsBySlug(news: NewsItem[], slug: string): NewsItem | undefined {
  return news.find(item => newsSlug(item) === slug);
}

export function filterNewsByDate(news: NewsItem[], period: DateFilter): NewsItem[] {
  if (period === 'all') return news;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === '7d') {
    start.setDate(start.getDate() - 7);
  } else if (period === '30d') {
    start.setDate(start.getDate() - 30);
  }
  return news.filter(item => new Date(item.publishedAt) >= start);
}

export function filterNews(news: NewsItem[], filters: NewsFiltersState): NewsItem[] {
  let result = [...news];

  if (filters.category !== 'all') {
    result = result.filter(item => item.category === filters.category);
  }

  if (filters.region !== 'all') {
    result = result.filter(item => (item.sourceRegion ?? 'intl') === filters.region);
  }

  result = filterNewsByDate(result, filters.period);

  if (filters.query.trim()) {
    const q = filters.query.toLowerCase().trim();
    result = result.filter(item => {
      return (
        item.title.toLowerCase().includes(q) ||
        item.titleEn.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.summaryEn.toLowerCase().includes(q)
      );
    });
  }

  return result;
}

export function paginateNews(news: NewsItem[], page: number) {
  const total = news.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const items = news.slice(start, start + ITEMS_PER_PAGE);
  return { items, total, totalPages, currentPage, start };
}

export interface DayGroup {
  date: string;
  label: string;
  labelEn: string;
  items: NewsItem[];
}

export function groupByDay(news: NewsItem[], locale: string): DayGroup[] {
  const groups = new Map<string, NewsItem[]>();
  for (const item of news) {
    const d = new Date(item.publishedAt);
    const key = d.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateStr, items]) => {
      const d = new Date(dateStr + 'T00:00:00Z');
      let label: string;
      let labelEn: string;
      if (d.getTime() === today.getTime()) {
        label = 'Hoje';
        labelEn = 'Today';
      } else if (d.getTime() === yesterday.getTime()) {
        label = 'Ontem';
        labelEn = 'Yesterday';
      } else {
        label = d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
        labelEn = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      }
      return { date: dateStr, label, labelEn, items };
    });
}

export function getRelatedNews(news: NewsItem[], current: NewsItem, maxCount = 3): NewsItem[] {
  return news
    .filter(item => item.id !== current.id && item.category === current.category)
    .slice(0, maxCount);
}

const MACRO_TERMS: Record<string, string[]> = {
  Norte: ['norte', 'minho', 'viana', 'porto', 'braga', 'caminha', 'espinho'],
  Centro: ['centro', 'nazaré', 'nazare', 'peniche', 'figueira', 'óbidos', 'obidos', 'lourinhã'],
  Lisboa: ['lisboa', 'cascais', 'ericeira', 'guincho', 'carcavelos', 'caparica', 'sintra', 'torres vedras'],
  Alentejo: ['alentejo', 'sines', 'tróia', 'troia', 'comporta'],
  Algarve: ['algarve', 'sagres', 'lagos', 'tavira', 'portimão', 'portimao', 'albufeira'],
  Açores: ['açores', 'acores', 'são miguel', 'sao miguel', 'terceira'],
  Madeira: ['madeira', 'machico', 'porto santo'],
};

function spotSearchTerms(spot: Spot): string[] {
  const slugPhrase = spot.slug.replace(/-/g, ' ');
  return [
    spot.slug,
    spot.id,
    spot.name,
    spot.nameEn,
    slugPhrase,
    spot.region,
    spot.regionEn,
  ]
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 2);
}

/**
 * News relevant to a spot: tag/slug match, place names, macro region, then sport.
 */
export function getRelatedNewsForSpot(
  news: NewsItem[],
  spot: Spot,
  options?: { sport?: SportType; limit?: number },
): NewsItem[] {
  const limit = options?.limit ?? 4;
  const sport = options?.sport;
  const terms = spotSearchTerms(spot);
  const macro = getMacroRegion(spot.region);
  const regionTerms = MACRO_TERMS[macro] ?? [];

  const scored = news
    .map((item) => {
      let score = 0;
      const blob = `${item.title} ${item.titleEn} ${item.summary} ${item.summaryEn} ${(item.tags ?? []).join(' ')}`.toLowerCase();

      if (item.tags?.includes(spot.slug) || item.tags?.includes(spot.id)) score += 50;
      for (const term of terms) {
        if (term.length >= 4 && blob.includes(term)) score += 28;
        else if (term.length >= 3 && blob.includes(term)) score += 12;
      }
      for (const rt of regionTerms) {
        if (blob.includes(rt)) score += 6;
      }
      if (sport && item.category === sport) score += 18;
      else if (spot.compatibleSports?.includes(item.category as SportType)) score += 10;
      if (item.sourceRegion === 'pt') score += 4;

      return { item, score };
    })
    .filter((x) => x.score >= 20)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime();
    });

  const picked = scored.slice(0, limit).map((x) => x.item);
  if (picked.length > 0) return picked;

  const sports = sport
    ? [sport]
    : (spot.compatibleSports?.length ? spot.compatibleSports : [spot.type as SportType]);
  return news
    .filter((item) => sports.includes(item.category as SportType))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);
}
