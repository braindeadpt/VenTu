'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { readGridFiltersFromWindow } from '@/lib/gridFilters';
import { readChosenSportFromStorage, SPORT_CHANGE_EVENT } from '@/lib/homepageSport';
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

export interface HomeSportSelection {
  /** Filtro activo dos pills / mapa do hero. */
  sport: GridSportFilter;
  /** true quando o desporto foi ESCOLHIDO: `?sport=` no URL ou um clique
   *  anterior num pill da home (`ventu:sport-chosen`). false = default. */
  explicit: boolean;
}

/**
 * Filtro de desporto da homepage + se foi escolhido pelo utilizador.
 *
 * Prioridade: `?sport=` (deep link / clique na sessão) → escolha guardada
 * nos pills da home → `fallback` (não escolhido). O SSR/1.º paint é sempre
 * `fallback` não escolhido (sem mismatch de hidratação); o cliente corrige
 * depois do subscribe.
 */
export function useHomeSport(
  regions: readonly string[],
  fallback: GridSportFilter,
): HomeSportSelection {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {};
      const notify = () => onStoreChange();
      window.addEventListener('popstate', notify);
      window.addEventListener(SPORT_CHANGE_EVENT, notify);
      window.addEventListener('storage', notify);
      return () => {
        window.removeEventListener('popstate', notify);
        window.removeEventListener(SPORT_CHANGE_EVENT, notify);
        window.removeEventListener('storage', notify);
      };
    },
    () => {
      const params = new URLSearchParams(window.location.search);
      if (params.has('sport')) return `${readGridFiltersFromWindow(regions).sport}|1`;
      const chosen = readChosenSportFromStorage();
      if (chosen) return `${chosen}|1`;
      return `${fallback}|0`;
    },
    () => `${fallback}|0`,
  );
  return useMemo(() => {
    const [sport, flag] = snapshot.split('|');
    return { sport: sport as GridSportFilter, explicit: flag === '1' };
  }, [snapshot]);
}
