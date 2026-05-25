'use client';

import { Filter, RotateCcw } from 'lucide-react';
import FilterPill from '@/components/ui/FilterPill';
import type { GridSportFilter } from '@/lib/sportRatings';

export interface MapHudSportOption {
  id: GridSportFilter;
  label: string;
  icon: React.ReactNode;
  color: string;
}

export interface MapFullscreenHudProps {
  /** When false, nothing is rendered (filters only belong in fullscreen map). */
  visible?: boolean;
  isPt: boolean;
  sports: MapHudSportOption[];
  regions: readonly string[];
  selectedSport: GridSportFilter;
  selectedRegion: string;
  spotCount: number;
  onSportChange: (sport: GridSportFilter) => void;
  onRegionChange: (region: string) => void;
  onResetFilters: () => void;
  clearFiltersLabel: string;
  showClearFilters: boolean;
}

export default function MapFullscreenHud({
  visible = true,
  isPt,
  sports,
  regions,
  selectedSport,
  selectedRegion,
  spotCount,
  onSportChange,
  onRegionChange,
  onResetFilters,
  clearFiltersLabel,
  showClearFilters,
}: MapFullscreenHudProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute bottom-0 inset-x-0 z-[1000] px-2 sm:px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none"
      role="region"
      aria-label={isPt ? 'Filtros do mapa' : 'Map filters'}
    >
      <div className="pointer-events-auto mx-auto max-w-4xl rounded-xl border border-[rgb(var(--divider))] bg-[rgb(var(--bg-elevated))]/95 backdrop-blur-md shadow-lg px-2.5 py-2.5 flex flex-col gap-2.5">
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x"
          role="group"
          aria-label={isPt ? 'Modalidade' : 'Sport'}
        >
          {sports.map((sport) => {
            const active = selectedSport === sport.id;
            return (
              <FilterPill
                key={sport.id}
                active={active}
                onClick={() => onSportChange(sport.id)}
                icon={<span className={active ? sport.color : 'text-fg-muted'}>{sport.icon}</span>}
                className="rounded-full shrink-0"
                compact
              >
                {sport.label}
              </FilterPill>
            );
          })}
        </div>

        <div className="flex items-center gap-2 min-h-[36px]">
          <div className="flex items-center gap-1 shrink-0 text-[rgb(var(--fg-muted))]">
            <Filter className="w-3.5 h-3.5" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              {isPt ? 'Região' : 'Region'}
            </span>
          </div>
          <div
            className="flex items-center gap-1 overflow-x-auto no-scrollbar touch-pan-x flex-1 min-w-0"
            role="group"
            aria-label={isPt ? 'Região' : 'Region'}
          >
            {regions.map((region) => {
              const active = selectedRegion === region;
              return (
                <FilterPill
                  key={region}
                  compact
                  active={active}
                  onClick={() => onRegionChange(region)}
                  activeClassName="bg-surface-2 border-divider-strong text-fg font-medium"
                  inactiveClassName="bg-transparent border-transparent text-fg-subtle hover:text-fg hover:bg-surface-1"
                  className="rounded-md shrink-0"
                >
                  {region}
                </FilterPill>
              );
            })}
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-[rgb(var(--fg-muted))] whitespace-nowrap">
            <span className="font-mono font-semibold text-[rgb(var(--fg))]">{spotCount}</span>
            {isPt ? ' spots' : ''}
          </span>
          {showClearFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface-1))] transition-colors min-h-[36px]"
              aria-label={clearFiltersLabel}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">{clearFiltersLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
