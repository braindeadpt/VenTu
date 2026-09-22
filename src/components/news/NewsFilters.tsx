'use client';

import { Search, X } from 'lucide-react';
import { CATEGORIES, DATE_FILTERS, REGION_FILTERS, type NewsCategory, type DateFilter, type RegionFilter, type NewsFiltersState } from '@/lib/news';
import { newsCategoryLabel } from '@/lib/newsCategories';
import { getTranslation } from '@/lib/i18n';
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
  const t = getTranslation(locale).news;
  const hasActiveFilters = filters.category !== 'all' || filters.region !== 'all' || filters.period !== 'all' || filters.query !== '';

  return (
    <div className="space-y-4">
      {/* Region pills (Cena PT) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label={t.filterRegionAria}>
        {REGION_FILTERS.map((reg) => {
          const active = filters.region === reg;
          return (
            <FilterPill
              key={reg}
              active={active}
              onClick={() => onChange({ region: reg as RegionFilter, page: 1 })}
              activeClassName="bg-data-waves/15 text-data-waves border-data-waves/30"
            >
              {reg === 'all' ? t.regionAll : reg === 'pt' ? t.regionPt : t.regionIntl}
            </FilterPill>
          );
        })}
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label={t.filterCategoryAria}>
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
              {cat !== 'all' && <span className={active ? 'opacity-100' : 'opacity-50'}>{newsCategoryLabel(cat, locale).charAt(0)}</span>}
              <span>{cat === 'all' ? t.all : newsCategoryLabel(cat, locale)}</span>
            </button>
          );
        })}
      </div>

      {/* Date pills + Search + Clear */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-1.5" role="group" aria-label={t.filterDateAria}>
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
                {period === 'today' ? t.dateToday : period === '7d' ? t.date7d : period === '30d' ? t.date30d : t.dateAll}
              </button>
            );
          })}
        </div>

        <Input
          type="search"
          value={filters.query}
          onChange={e => onChange({ query: e.target.value, page: 1 })}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchAria}
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
          {total} {t.countLabel}
        </span>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ category: 'all', region: 'all', period: 'all', query: '', page: 1 })}
          >
            <X className="w-3.5 h-3.5" aria-hidden />
            {t.clearFilters}
          </Button>
        )}
      </div>
    </div>
  );
}
