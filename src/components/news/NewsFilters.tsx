'use client';

import { Search, X } from 'lucide-react';
import { CATEGORIES, DATE_FILTERS, REGION_FILTERS, NEWS_CATEGORY_LABELS, NEWS_CATEGORY_COLORS, type NewsCategory, type DateFilter, type RegionFilter, type NewsFiltersState } from '@/lib/news';
import FilterPill from '@/components/ui/FilterPill';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface NewsFiltersProps {
  filters: NewsFiltersState;
  onChange: (filters: Partial<NewsFiltersState>) => void;
  locale: string;
  total: number;
  debouncing?: boolean;
}

const categoryLabels = NEWS_CATEGORY_LABELS;

const dateLabels: Record<string, { pt: string; en: string }> = {
  today:  { pt: 'Hoje',     en: 'Today' },
  '7d':   { pt: '7 dias',   en: '7 days' },
  '30d':  { pt: '30 dias',  en: '30 days' },
  all:    { pt: 'Tudo',     en: 'All' },
};

const categoryColors = NEWS_CATEGORY_COLORS;

const regionLabels: Record<string, { pt: string; en: string }> = {
  all:   { pt: 'Tudo',           en: 'All' },
  pt:    { pt: '🇵🇹 Cena PT',    en: '🇵🇹 PT Scene' },
  intl:  { pt: '🌍 Internacional', en: '🌍 International' },
};

export default function NewsFilters({ filters, onChange, locale, total, debouncing }: NewsFiltersProps) {
  const isPt = locale === 'pt';
  const hasActiveFilters = filters.category !== 'all' || filters.region !== 'all' || filters.period !== 'all' || filters.query !== '';

  return (
    <div className="space-y-4">
      {/* Region pills (Cena PT) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label={isPt ? 'Filtrar por origem' : 'Filter by region'}>
        {REGION_FILTERS.map((reg) => {
          const active = filters.region === reg;
          return (
            <FilterPill
              key={reg}
              active={active}
              onClick={() => onChange({ region: reg as RegionFilter, page: 1 })}
              activeClassName="bg-data-waves/15 text-data-waves border-data-waves/30"
            >
              {isPt ? regionLabels[reg]?.pt : regionLabels[reg]?.en}
            </FilterPill>
          );
        })}
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label={isPt ? 'Filtrar por categoria' : 'Filter by category'}>
        {CATEGORIES.map(cat => {
          const active = filters.category === cat;
          const colorClass = cat === 'all' ? '' : categoryColors[cat];
          return (
            <button
              key={cat}
              onClick={() => onChange({ category: cat as NewsCategory, page: 1 })}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium min-h-[44px]',
                'transition-all duration-200 whitespace-nowrap shrink-0',
                active
                  ? cat === 'all'
                    ? 'bg-surface-2/[0.08] border border-divider-strong text-fg'
                    : `${colorClass} border`
                  : 'bg-surface-1/[0.04] border border-divider text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg',
              ].join(' ')}
              aria-pressed={active}
            >
              {cat !== 'all' && <span className={active ? 'opacity-100' : 'opacity-50'}>{categoryLabels[cat]?.pt[0]}</span>}
              <span>{cat === 'all' ? (isPt ? 'Todas' : 'All') : (isPt ? categoryLabels[cat]?.pt : categoryLabels[cat]?.en)}</span>
            </button>
          );
        })}
      </div>

      {/* Date pills + Search + Clear */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-1.5" role="group" aria-label={isPt ? 'Filtrar por data' : 'Filter by date'}>
          {DATE_FILTERS.map(period => {
            const active = filters.period === period;
            return (
              <button
                key={period}
                onClick={() => onChange({ period: period as DateFilter, page: 1 })}
                className={[
                  'px-2.5 py-1.5 rounded-md text-sm min-h-[36px]',
                  'transition-all duration-200 whitespace-nowrap',
                  active
                    ? 'bg-surface-2/[0.08] border border-divider-strong text-fg font-medium'
                    : 'bg-transparent border border-transparent text-fg-subtle hover:text-fg hover:bg-surface-1/[0.04]',
                ].join(' ')}
                aria-pressed={active}
              >
                {isPt ? dateLabels[period]?.pt : dateLabels[period]?.en}
              </button>
            );
          })}
        </div>

        <Input
          type="search"
          value={filters.query}
          onChange={e => onChange({ query: e.target.value, page: 1 })}
          placeholder={isPt ? 'Pesquisar notícias...' : 'Search news...'}
          aria-label={isPt ? 'Pesquisar notícias' : 'Search news'}
          icon={
            debouncing ? (
              <div className="w-4 h-4 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )
          }
          wrapperClassName="flex-1 w-full sm:max-w-xs"
        />

        <span className="text-xs text-fg-subtle whitespace-nowrap">
          {total} {isPt ? 'notícias' : 'news'}
        </span>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ category: 'all', region: 'all', period: 'all', query: '', page: 1 })}
          >
            <X className="w-3.5 h-3.5" aria-hidden />
            {isPt ? 'Limpar filtros' : 'Clear filters'}
          </Button>
        )}
      </div>
    </div>
  );
}
