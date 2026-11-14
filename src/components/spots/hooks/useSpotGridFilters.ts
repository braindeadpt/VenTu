'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { GridSportFilter } from '@/lib/sportRatings';
import { filterGridSpots } from '@/lib/gridSpotFilters';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { useGeolocation, calculateDistance } from '@/lib/geolocation';
import { dispatchSportChange, LS_SPORT_KEY, readSportFromStorage } from '@/lib/homepageSport';
import {
  DEFAULT_REGION,
  SPOTS_DEFAULT_SPORT,
  readGridFiltersFromWindow,
  syncGridFiltersToUrl,
} from '@/lib/gridFilters';
import {
  onCount as computeOnCount,
  marginalCount as computeMarginalCount,
  top3 as computeTop3,
  alternativeSport as computeAlternativeSport,
  compareRanking,
} from '../spotGridSelectors';

type SortOption = 'score' | 'distance';

const LS_REGION_KEY = 'windspot:region';

const SPORT_IDS: GridSportFilter[] = [
  'all', 'surf', 'bodyboard', 'kitesurf', 'windsurf', 'big-wave', 'foil', 'sup', 'wakeboard',
];

function resolveInitialFilters(
  regions: readonly string[],
  initialSport?: string,
  initialRegion?: string,
) {
  const fromUrl = typeof window !== 'undefined'
    ? readGridFiltersFromWindow(regions)
    : { sport: SPOTS_DEFAULT_SPORT, region: DEFAULT_REGION };

  const lsSport = typeof window !== 'undefined' ? readSportFromStorage() : null;
  const lsRegion = typeof window !== 'undefined' ? localStorage.getItem(LS_REGION_KEY) : null;

  const hasUrlSport = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sport');
  const hasUrlRegion = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('region');

  let sport = fromUrl.sport;
  if (!hasUrlSport) {
    const candidate = (initialSport || lsSport || SPOTS_DEFAULT_SPORT) as GridSportFilter;
    if (SPORT_IDS.includes(candidate)) sport = candidate;
  }

  let region = fromUrl.region;
  if (!hasUrlRegion) {
    const candidate = initialRegion || lsRegion || DEFAULT_REGION;
    if (regions.includes(candidate)) region = candidate;
  }

  return { sport, region };
}

export function useSpotGridFilters({
  spotsData,
  regions,
  initialSport,
  initialRegion,
  locale = 'pt',
  nowMs = null,
}: {
  spotsData: GridSpotData[];
  regions: string[];
  initialSport?: string;
  initialRegion?: string;
  /** Desempate do ranking por nome localizado. */
  locale?: string;
  /** Relógio do estado «Noite» (`useRelogioNoite`): ordem pela próxima janela. */
  nowMs?: number | null;
}) {
  const skipUrlSync = useRef(false);
  // O primeiro render (e o HTML exportado) usa o mesmo filtro que o efeito resolve sem
  // `?sport=` nem storage; com o `DEFAULT_SPORT` («Todos») o SSR trazia 189 linhas e a
  // hidratação cortava para 147 (#476).
  const [selectedSport, setSelectedSport] = useState<GridSportFilter>(SPOTS_DEFAULT_SPORT);
  const [selectedRegion, setSelectedRegion] = useState<string>(DEFAULT_REGION);
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [mounted, setMounted] = useState(false);
  const { latitude, longitude, loading: geoLoading, requestLocation } = useGeolocation();

  useEffect(() => {
    setMounted(true);
    const { sport, region } = resolveInitialFilters(regions, initialSport, initialRegion);
    setSelectedSport(sport);
    setSelectedRegion(region);
    dispatchSportChange(sport);
  }, [initialSport, initialRegion, regions]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(LS_SPORT_KEY, selectedSport);
    localStorage.setItem(LS_REGION_KEY, selectedRegion);
  }, [selectedSport, selectedRegion, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (skipUrlSync.current) {
      skipUrlSync.current = false;
      return;
    }
    syncGridFiltersToUrl(selectedSport, selectedRegion, regions);
    dispatchSportChange(selectedSport);
  }, [selectedSport, selectedRegion, mounted, regions]);

  useEffect(() => {
    const onPopState = () => {
      const { sport, region } = readGridFiltersFromWindow(regions);
      skipUrlSync.current = true;
      setSelectedSport(sport);
      setSelectedRegion(region);
      dispatchSportChange(sport);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [regions]);

  const filtered = useMemo(
    () => filterGridSpots(spotsData, selectedSport, selectedRegion),
    [spotsData, selectedSport, selectedRegion],
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'distance' && latitude && longitude) {
        const distA = calculateDistance(latitude, longitude, a.spot.lat, a.spot.lon);
        const distB = calculateDistance(latitude, longitude, b.spot.lat, b.spot.lon);
        return distA - distB;
      }
      return compareRanking(a, b, selectedSport, locale, nowMs);
    });
  }, [filtered, selectedSport, sortBy, latitude, longitude, locale, nowMs]);

  const onCountMemo = useMemo(
    () => computeOnCount(sorted, selectedSport),
    [sorted, selectedSport],
  );

  const marginalCountMemo = useMemo(
    () => computeMarginalCount(sorted, selectedSport),
    [sorted, selectedSport],
  );

  const top3Memo = useMemo(
    () => computeTop3(sorted, selectedSport),
    [sorted, selectedSport],
  );

  const alternativeSportMemo = useMemo(
    () => computeAlternativeSport(spotsData, selectedSport, selectedRegion),
    [spotsData, selectedSport, selectedRegion],
  );

  const handleSportChange = (sport: GridSportFilter) => setSelectedSport(sport);
  const handleRegionChange = (region: string) => setSelectedRegion(region);
  const handleReset = () => {
    setSelectedSport(SPOTS_DEFAULT_SPORT);
    setSelectedRegion(DEFAULT_REGION);
  };

  return {
    selectedSport,
    selectedRegion,
    sortBy,
    setSortBy,
    handleSportChange,
    handleRegionChange,
    handleReset,
    filtered,
    sorted,
    onCount: onCountMemo,
    marginalCount: marginalCountMemo,
    top3: top3Memo,
    alternativeSport: alternativeSportMemo,
    latitude,
    longitude,
    geoLoading,
    requestLocation,
  };
}
