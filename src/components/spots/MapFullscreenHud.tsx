'use client';

import { RotateCcw } from 'lucide-react';
interface MapFullscreenHudProps {
  isPt: boolean;
  sportLabel: string;
  regionLabel: string;
  spotCount: number;
  onCount: number;
  marginalCount: number;
  lastUpdated: string | null;
  showClearFilters: boolean;
  onResetFilters: () => void;
  clearFiltersLabel: string;
}

export default function MapFullscreenHud({
  isPt,
  sportLabel,
  regionLabel,
  spotCount,
  onCount,
  marginalCount,
  lastUpdated,
  showClearFilters,
  onResetFilters,
  clearFiltersLabel,
}: MapFullscreenHudProps) {
  return (
    <div
      className="absolute bottom-0 inset-x-0 z-[1000] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none"
      role="region"
      aria-label={isPt ? 'Resumo do mapa' : 'Map summary'}
    >
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl border border-[rgb(var(--divider))] bg-[rgb(var(--bg-elevated))]/95 backdrop-blur-md shadow-lg px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="font-semibold text-[rgb(var(--fg))]">
          {sportLabel}
          <span className="text-[rgb(var(--fg-muted))] font-normal"> · {regionLabel}</span>
        </span>
        <span className="text-[rgb(var(--fg-muted))] tabular-nums">
          <span className="font-mono text-[rgb(var(--fg))]">{spotCount}</span>
          {isPt ? ' spots' : ' spots'}
          {onCount > 0 && (
            <>
              {' · '}
              <span className="font-mono text-[rgb(var(--score-good))]">{onCount}</span> ON
            </>
          )}
          {marginalCount > 0 && (
            <>
              {' · '}
              <span className="font-mono text-[rgb(var(--score-fair))]">{marginalCount}</span>
              {isPt ? ' marginal' : ' marginal'}
            </>
          )}
        </span>
        {lastUpdated && (
          <span className="text-[rgb(var(--fg-subtle))]">
            {isPt ? 'Actualizado' : 'Updated'} {lastUpdated}
          </span>
        )}
        {showClearFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-[rgb(var(--fg-muted))] hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--surface-1))] transition-colors min-h-[36px]"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden />
            {clearFiltersLabel}
          </button>
        )}
      </div>
    </div>
  );
}
