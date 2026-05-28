'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { GridSportFilter } from '@/lib/sportRatings';
import { filterGridSpots } from '@/lib/gridSpotFilters';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { useGeolocation, calculateDistance } from '@/lib/geolocation';
import { dispatchSportChange, LS_SPORT_KEY, readSportFromStorage } from '@/lib/homepageSport';
import {
  DEFAULT_REGION,
  DEFAULT_SPORT,
  readGridFiltersFromWindow,
  syncGridFiltersToUrl,
} from '@/lib/gridFilters';
import {
  onCount as computeOnCount,
  marginalCount as computeMarginalCount,
  top3 as computeTop3,
  alternativeSport as computeAlternativeSport,
  getScoreSport,
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
    : { sport: DEFAULT_SPORT as GridSportFilter, region: DEFAULT_REGION };

  const lsSport = typeof window !== 'undefined' ? readSportFromStorage() : null;
  const lsRegion = typeof window !== 'undefined' ? localStorage.getItem(LS_REGION_KEY) : null;

  const hasUrlSport = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sport');
  const hasUrlRegion = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('region');

  let sport = fromUrl.sport;
  if (!hasUrlSport) {
    const candidate = (initialSport || lsSport || DEFAULT_SPORT) as GridSportFilter;
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
}: {
  spotsData: GridSpotData[];
  regions: string[];
  initialSport?: string;
  initialRegion?: string;
}) {
  const skipUrlSync = useRef(false);
  const [selectedSport, setSelectedSport] = useState<GridSportFilter>(DEFAULT_SPORT);
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
      if (selectedSport === 'all') {
        const bestA = Math.max(...Object.values(a.allScores).map(s => s.score || 0));
        const bestB = Math.max(...Object.values(b.allScores).map(s => s.score || 0));
        return bestB - bestA;
      }
      const scoreKey = getScoreSport(selectedSport)!;
      return (b.allScores[scoreKey]?.score || 0) - (a.allScores[scoreKey]?.score || 0);
    });
  }, [filtered, selectedSport, sortBy, latitude, longitude]);

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
    setSelectedSport(DEFAULT_SPORT);
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
