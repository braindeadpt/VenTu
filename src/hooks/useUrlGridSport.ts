'use client';

import { useSyncExternalStore } from 'react';
import { readGridFiltersFromWindow } from '@/lib/gridFilters';
import { SPORT_CHANGE_EVENT } from '@/lib/homepageSport';
import type { GridSportFilter } from '@/lib/sportRatings';

/**
 * Sport filter synced to `?sport=` without hydration mismatch:
 * server/static HTML uses `fallback`; client reads URL after subscribe.
 *
 * Missing `?sport=` → fallback (homepage defaults to surf).
 * Explicit `?sport=all` → «Todos» (must not remap to fallback).
 */
export function useUrlGridSport(
  regions: readonly string[],
  fallback: GridSportFilter,
): GridSportFilter {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {};
      const notify = () => onStoreChange();
      window.addEventListener('popstate', notify);
      window.addEventListener(SPORT_CHANGE_EVENT, notify);
      return () => {
        window.removeEventListener('popstate', notify);
        window.removeEventListener(SPORT_CHANGE_EVENT, notify);
      };
    },
    () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('sport')) return fallback;
      return readGridFiltersFromWindow(regions).sport;
    },
    () => fallback,
  );
}
