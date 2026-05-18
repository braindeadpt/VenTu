'use client';

import { Search, X } from 'lucide-react';
import { CATEGORIES, DATE_FILTERS, type NewsCategory, type DateFilter, type NewsFiltersState } from '@/lib/news';

interface NewsFiltersProps {
  filters: NewsFiltersState;
  onChange: (filters: Partial<NewsFiltersState>) => void;
  locale: string;
  total: number;
  debouncing?: boolean;
}

const categoryLabels: Record<string, { pt: string; en: string }> = {
  all:        { pt: 'Todas',       en: 'All' },
  surf:       { pt: 'Surf',        en: 'Surf' },
  kitesurf:   { pt: 'Kitesurf',    en: 'Kitesurf' },
  windsurf:   { pt: 'Windsurf',    en: 'Windsurf' },
  'big-wave': { pt: 'Big Wave',    en: 'Big Wave' },
  sup:        { pt: 'SUP',         en: 'SUP' },
  foil:       { pt: 'Foil',        en: 'Foil' },
  bodyboard:  { pt: 'Bodyboard',   en: 'Bodyboard' },
  wakeboard:  { pt: 'Wakeboard',   en: 'Wakeboard' },
  competition:{ pt: 'Competição',  en: 'Competition' },
  safety:     { pt: 'Segurança',   en: 'Safety' },
  general:    { pt: 'Geral',       en: 'General' },
  alert:      { pt: 'Alerta',      en: 'Alert' },
};

const dateLabels: Record<string, { pt: string; en: string }> = {
  today:  { pt: 'Hoje',     en: 'Today' },
  '7d':   { pt: '7 dias',   en: '7 days' },
  '30d':  { pt: '30 dias',  en: '30 days' },
  all:    { pt: 'Tudo',     en: 'All' },
};

const categoryColors: Record<string, string> = {
  surf:       'bg-data-waves/12 text-data-waves border border-data-waves/25',
  kitesurf:   'bg-data-wind/12 text-data-wind border border-data-wind/25',
  windsurf:   'bg-data-waves/12 text-data-waves border border-data-waves/25',
  'big-wave': 'bg-windDir-offshore/12 text-windDir-offshore border border-windDir-offshore/25',
  sup:        'bg-data-water/12 text-data-water border border-data-water/25',
  foil:       'bg-score-fair/12 text-score-fair border border-score-fair/25',
  bodyboard:  'bg-data-period/12 text-data-period border border-data-period/25',
  wakeboard:  'bg-score-good/12 text-score-good border border-score-good/25',
  competition:'bg-data-period/12 text-data-period border border-data-period/25',
  safety:     'bg-windDir-onshore/12 text-windDir-onshore border border-windDir-onshore/25',
  general:    'bg-data-water/12 text-data-water border border-data-water/25',
  alert:      'bg-windDir-onshore/20 text-windDir-onshore border border-windDir-onshore/35',
};

export default function NewsFilters({ filters, onChange, locale, total, debouncing }: NewsFiltersProps) {
  const isPt = locale === 'pt';
  const hasActiveFilters = filters.category !== 'all' || filters.period !== 'all' || filters.query !== '';

  return (
    <div className="space-y-4">
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
                    ? 'bg-surface-2 border border-divider-strong text-fg'
                    : `${colorClass} border`
                  : 'bg-surface-1 border border-divider text-fg-muted hover:bg-surface-2 hover:text-fg',
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
                    ? 'bg-surface-2 border border-divider-strong text-fg font-medium'
                    : 'bg-transparent border border-transparent text-fg-subtle hover:text-fg hover:bg-surface-1',
                ].join(' ')}
                aria-pressed={active}
              >
                {isPt ? dateLabels[period]?.pt : dateLabels[period]?.en}
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 w-full sm:max-w-xs">
          {debouncing ? (
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
            </div>
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" />
          )}
          <input
            type="search"
            value={filters.query}
            onChange={e => onChange({ query: e.target.value, page: 1 })}
            placeholder={isPt ? 'Pesquisar notícias...' : 'Search news...'}
            className="w-full pl-9 pr-3 py-2 rounded-md border border-divider bg-surface-1 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-data-waves/30 focus:border-data-waves transition-all"
            aria-label={isPt ? 'Pesquisar notícias' : 'Search news'}
          />
        </div>

        <span className="text-xs text-fg-subtle whitespace-nowrap">
          {total} {isPt ? 'notícias' : 'news'}
        </span>

        {hasActiveFilters && (
          <button
            onClick={() => onChange({ category: 'all', period: 'all', query: '', page: 1 })}
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg transition-colors min-h-[36px]"
          >
            <X className="w-3.5 h-3.5" />
            {isPt ? 'Limpar filtros' : 'Clear filters'}
          </button>
        )}
      </div>
    </div>
  );
}
