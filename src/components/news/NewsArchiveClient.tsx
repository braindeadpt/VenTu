'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { NewsItem } from '@/types';
import { filterNews, paginateNews, groupByDay, getDefaultNewsRegion, CATEGORIES, DATE_FILTERS, REGION_FILTERS, type NewsCategory, type DateFilter, type RegionFilter } from '@/lib/news';
import NewsFilters from './NewsFilters';
import NewsListGrouped from './NewsListGrouped';
import NewsPagination from './NewsPagination';
import { Newspaper, Search } from 'lucide-react';

interface NewsArchiveClientProps {
  news: NewsItem[];
  locale: string;
}

export default function NewsArchiveClient({ news, locale }: NewsArchiveClientProps) {
  const isPt = locale === 'pt';
  const [category, setCategory] = useState<NewsCategory>('all');
  const [region, setRegion] = useState<RegionFilter>(() => getDefaultNewsRegion(locale));
  const [period, setPeriod] = useState<DateFilter>('all');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const syncRef = useRef(false);

  // Read URL params on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('category');
      const reg = params.get('region');
      const p = params.get('period');
      const q = params.get('q');
      const pn = params.get('page');

      if (cat && (CATEGORIES as readonly string[]).includes(cat)) setCategory(cat as NewsCategory);
      if (reg && (REGION_FILTERS as readonly string[]).includes(reg)) setRegion(reg as RegionFilter);
      if (p && (DATE_FILTERS as readonly string[]).includes(p)) setPeriod(p as DateFilter);
      if (q) { setSearchInput(q); setDebouncedQuery(q); }
      if (pn) { const n = parseInt(pn, 10); if (!isNaN(n) && n > 0) setPage(n); }
    } catch { /* noop */ }
    setHydrated(true);
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sync URL to state
  const syncUrl = useCallback((cat: string, reg: string, per: string, q: string, pg: number) => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('category');
      url.searchParams.delete('region');
      url.searchParams.delete('period');
      url.searchParams.delete('q');
      url.searchParams.delete('page');
      if (cat !== 'all') url.searchParams.set('category', cat);
      if (reg !== 'all') url.searchParams.set('region', reg);
      if (per !== 'all') url.searchParams.set('period', per);
      if (q) url.searchParams.set('q', q);
      if (pg > 1) url.searchParams.set('page', String(pg));
      window.history.replaceState({}, '', url.toString());
    } catch { /* noop */ }
  }, []);

  // Sync URL after debounced query settles
  useEffect(() => {
    if (!hydrated) return;
    syncUrl(category, region, period, debouncedQuery, page);
  }, [category, region, period, debouncedQuery, page, hydrated, syncUrl]);

  // Sync URL immediately for non-debounced filters
  const handleCategoryChange = useCallback((cat: NewsCategory) => {
    setCategory(cat);
    setPage(1);
  }, []);

  const handleRegionChange = useCallback((r: RegionFilter) => {
    setRegion(r);
    setPage(1);
  }, []);

  const handlePeriodChange = useCallback((p: DateFilter) => {
    setPeriod(p);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((q: string) => {
    setSearchInput(q);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleClear = useCallback(() => {
    setCategory('all');
    setRegion('all');
    setPeriod('all');
    setSearchInput('');
    setDebouncedQuery('');
    setPage(1);
  }, []);

  const currentFilters = useMemo(() => ({
    category,
    region,
    period,
    query: debouncedQuery,
    page,
  }), [category, region, period, debouncedQuery, page]);

  const isDebouncing = searchInput !== debouncedQuery && searchInput !== '';
  const filteredAll = useMemo(() => filterNews(news, currentFilters), [news, currentFilters]);
  const { items: pageItems, total, totalPages, currentPage } = useMemo(
    () => paginateNews(filteredAll, page),
    [filteredAll, page],
  );
  const groups = useMemo(() => groupByDay(pageItems, locale), [pageItems, locale]);

  // Show nothing during SSR to avoid hydration mismatch with URL params
  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Newspaper className="w-8 h-8 text-data-waves" />
        <div>
          <h1 className="text-4xl font-bold text-fg">{isPt ? 'Notícias' : 'News'}</h1>
          <p className="text-fg-muted mt-1">
            {isPt ? 'Cena PT e notícias internacionais de desportos náuticos' : 'Portuguese scene and international water sports news'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-40 bg-bg-base/90 backdrop-blur-md border-b border-divider -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto">
          <NewsFilters
            filters={{ category, region, period, query: searchInput, page }}
            onChange={({ category: cat, region: reg, period: per, query: q, page: pg }) => {
              if (cat !== undefined) handleCategoryChange(cat);
              if (reg !== undefined) handleRegionChange(reg);
              if (per !== undefined) handlePeriodChange(per);
              if (q !== undefined) handleSearchChange(q);
              if (pg !== undefined) handlePageChange(pg);
            }}
            locale={locale}
            total={filteredAll.length}
            debouncing={isDebouncing}
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {pageItems.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Search className="w-16 h-16 text-fg-subtle mx-auto" />
            <p className="text-fg-subtle text-lg">
              {isPt
                ? (debouncedQuery
                  ? `Nenhuma notícia encontrada para "${debouncedQuery}"`
                  : 'Nenhuma notícia com este filtro.')
                : (debouncedQuery
                  ? `No news found for "${debouncedQuery}"`
                  : 'No news matching these filters.')}
            </p>
            <p className="text-fg-subtle/80 text-sm">
              {isPt ? 'Tenta remover filtros ou alargar o período.' : 'Try removing filters or expanding the time period.'}
            </p>
            {(category !== 'all' || region !== 'all' || period !== 'all' || debouncedQuery) && (
              <button
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-2/[0.08] border border-divider text-sm text-fg hover:bg-surface-3/[0.12] transition-colors"
              >
                {isPt ? 'Limpar todos os filtros' : 'Clear all filters'}
              </button>
            )}
          </div>
        ) : (
          <NewsListGrouped groups={groups} locale={locale} />
        )}
      </div>

      {/* Pagination */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <NewsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          locale={locale}
        />
      </div>
    </div>
  );
}
