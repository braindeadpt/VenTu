'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Wind, Waves, Zap, Filter, Star, RotateCcw, ArrowRight, MapPin, Navigation, Ship } from 'lucide-react';
import { getCompatibleSports, type SportType, type GridSportFilter } from '@/lib/sportRatings';
import {
  filterGridSpots,
  spotMatchesSportFilter,
  spotMatchesRegionFilter,
  PLAYABLE_THRESHOLD,
  type GridSpotData,
} from '@/lib/gridSpotFilters';
import type { SportScore } from '@/lib/sportScore';
import { getTranslation } from '@/lib/i18n';
import { useGeolocation, calculateDistance } from '@/lib/geolocation';
import type { Spot } from '@/types';
import SpotDrawer from './SpotDrawer';
import FilterPill from '@/components/ui/FilterPill';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { dispatchSportChange, LS_SPORT_KEY } from '@/lib/homepageSport';
import {
  DEFAULT_REGION,
  DEFAULT_SPORT,
  readGridFiltersFromWindow,
  syncGridFiltersToUrl,
} from '@/lib/gridFilters';

const SpotMapInteractive = dynamic(() => import('./SpotMapInteractive'), { ssr: false });

type SpotData = GridSpotData;

const SPORTS: { id: GridSportFilter; labelPt: string; labelEn: string; icon: React.ReactNode; color: string }[] = [
  { id: 'all', labelPt: 'Todos', labelEn: 'All', icon: <Star className="w-4 h-4" />, color: 'text-fg' },
  { id: 'surf', labelPt: 'Surf', labelEn: 'Surf', icon: <Waves className="w-4 h-4" />, color: 'text-sport-surf' },
  { id: 'bodyboard', labelPt: 'Bodyboard', labelEn: 'Bodyboard', icon: <Waves className="w-4 h-4" />, color: 'text-sport-bodyboard' },
  { id: 'kitesurf', labelPt: 'Kitesurf', labelEn: 'Kitesurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-kitesurf' },
  { id: 'windsurf', labelPt: 'Windsurf', labelEn: 'Windsurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-windsurf' },
  { id: 'big-wave', labelPt: 'Big Wave', labelEn: 'Big Wave', icon: <Ship className="w-4 h-4" />, color: 'text-windDir-offshore' },
  { id: 'foil', labelPt: 'Foil', labelEn: 'Foil', icon: <Zap className="w-4 h-4" />, color: 'text-sport-foil' },
  { id: 'sup', labelPt: 'SUP', labelEn: 'SUP', icon: <Waves className="w-4 h-4" />, color: 'text-sport-sup' },
  { id: 'wakeboard', labelPt: 'Wakeboard', labelEn: 'Wakeboard', icon: <Zap className="w-4 h-4" />, color: 'text-sport-wakeboard' },
];

const LS_REGION_KEY = 'windspot:region';

type SortOption = 'score' | 'distance';

function getSportIcon(sport: GridSportFilter) {
  return SPORTS.find(s => s.id === sport)?.icon || <Star className="w-4 h-4" />;
}

function getSportColor(sport: GridSportFilter) {
  return SPORTS.find(s => s.id === sport)?.color || 'text-fg';
}

function getSportLabel(sport: GridSportFilter, isPt: boolean) {
  const s = SPORTS.find(x => x.id === sport);
  return isPt ? s?.labelPt : s?.labelEn;
}

function getScoreSport(sport: GridSportFilter): SportType | null {
  if (sport === 'all' || sport === 'big-wave') return sport === 'big-wave' ? 'surf' : null;
  return sport;
}

function getAlternativeSport(
  spotsData: SpotData[],
  currentSport: GridSportFilter,
  region: string,
): SportType | null {
  if (currentSport === 'all' || currentSport === 'big-wave') return null;
  const counts: Record<string, number> = {};
  for (const data of spotsData) {
    if (!spotMatchesRegionFilter(data, region)) continue;
    for (const sport of Object.keys(data.allScores) as SportType[]) {
      if (sport === currentSport) continue;
      if ((data.allScores[sport]?.score ?? 0) >= PLAYABLE_THRESHOLD) {
        counts[sport] = (counts[sport] || 0) + 1;
      }
    }
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? (entries[0][0] as SportType) : null;
}

function resolveInitialFilters(
  regions: readonly string[],
  initialSport?: string,
  initialRegion?: string,
) {
  const fromUrl = typeof window !== 'undefined'
    ? readGridFiltersFromWindow(regions)
    : { sport: DEFAULT_SPORT as GridSportFilter, region: DEFAULT_REGION };

  const lsSport = typeof window !== 'undefined' ? localStorage.getItem(LS_SPORT_KEY) : null;
  const lsRegion = typeof window !== 'undefined' ? localStorage.getItem(LS_REGION_KEY) : null;

  const hasUrlSport = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sport');
  const hasUrlRegion = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('region');

  let sport = fromUrl.sport;
  if (!hasUrlSport) {
    const candidate = (initialSport || lsSport || DEFAULT_SPORT) as GridSportFilter;
    if (SPORTS.some(s => s.id === candidate)) sport = candidate;
  }

  let region = fromUrl.region;
  if (!hasUrlRegion) {
    const candidate = initialRegion || lsRegion || DEFAULT_REGION;
    if (regions.includes(candidate)) region = candidate;
  }

  return { sport, region };
}

export function SpotGridClient({
  spotsData,
  locale,
  regions,
  initialSport,
  initialRegion,
}: {
  spotsData: SpotData[];
  locale: string;
  regions: string[];
  initialSport?: string;
  initialRegion?: string;
}) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as any);
  const skipUrlSync = useRef(false);

  const [selectedSport, setSelectedSport] = useState<GridSportFilter>(DEFAULT_SPORT);
  const [selectedRegion, setSelectedRegion] = useState<string>(DEFAULT_REGION);
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
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

  const mapLastUpdated = useMemo(() => {
    let latest: string | null = null;
    for (const d of filtered) {
      const at = d.conditions.updatedAt;
      if (!at) continue;
      if (!latest || at > latest) latest = at;
    }
    if (!latest) return null;
    try {
      return new Date(latest).toLocaleTimeString(isPt ? 'pt-PT' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  }, [filtered, isPt]);

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

  const selectedSpotData = useMemo(() => {
    if (!selectedSpotId) return null;
    return spotsData.find(d => d.spot.id === selectedSpotId) || null;
  }, [selectedSpotId, spotsData]);

  const onCount = sorted.filter(d => {
    if (selectedSport === 'all') {
      return Math.max(...Object.values(d.allScores).map(s => s.score || 0)) >= 70;
    }
    const scoreKey = getScoreSport(selectedSport)!;
    return (d.allScores[scoreKey]?.score || 0) >= 70;
  }).length;

  const marginalCount = sorted.filter(d => {
    if (selectedSport === 'all') {
      const best = Math.max(...Object.values(d.allScores).map(s => s.score || 0));
      return best >= 40 && best < 70;
    }
    const scoreKey = getScoreSport(selectedSport)!;
    const s = d.allScores[scoreKey]?.score || 0;
    return s >= 40 && s < 70;
  }).length;

  const top3 = useMemo(() => {
    if (selectedSport === 'all') return [];
    const scoreKey = getScoreSport(selectedSport)!;
    return sorted
      .filter(d => (d.allScores[scoreKey]?.score || 0) >= PLAYABLE_THRESHOLD)
      .slice(0, 3);
  }, [sorted, selectedSport]);

  const alternativeSport = useMemo(() => {
    if (sorted.length > 0) return null;
    return getAlternativeSport(spotsData, selectedSport, selectedRegion);
  }, [spotsData, selectedSport, selectedRegion, sorted.length]);

  const handleSportChange = (sport: GridSportFilter) => setSelectedSport(sport);
  const handleRegionChange = (region: string) => setSelectedRegion(region);
  const handleReset = () => {
    setSelectedSport(DEFAULT_SPORT);
    setSelectedRegion(DEFAULT_REGION);
  };

  const sportIcon = getSportIcon(selectedSport);
  const sportColor = getSportColor(selectedSport);
  const sportLabel = getSportLabel(selectedSport, isPt);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" suppressHydrationWarning>
      <div className="md:sticky md:top-16 md:z-40 bg-bg-base/90 backdrop-blur-md border-b border-divider -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-3 mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 edge-fade-x">
            {SPORTS.map(sport => {
              const active = selectedSport === sport.id;
              return (
                <FilterPill
                  key={sport.id}
                  active={active}
                  onClick={() => handleSportChange(sport.id)}
                  icon={<span className={active ? sport.color : 'text-fg-muted'}>{sport.icon}</span>}
                  className="rounded-full"
                >
                  {isPt ? sport.labelPt : sport.labelEn}
                </FilterPill>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5 text-fg-muted mr-1">
                <Filter className="w-3.5 h-3.5" />
                <span className="text-meta-sm">{isPt ? 'Região' : 'Region'}</span>
              </div>
              {regions.map(region => {
                const active = selectedRegion === region;
                return (
                  <FilterPill
                    key={region}
                    compact
                    active={active}
                    onClick={() => handleRegionChange(region)}
                    activeClassName="bg-surface-2 border-divider-strong text-fg font-medium"
                    inactiveClassName="bg-transparent border-transparent text-fg-subtle hover:text-fg hover:bg-surface-1"
                    className="rounded-md"
                  >
                    {region}
                  </FilterPill>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <FilterPill
                compact
                active={sortBy === 'distance' && !!latitude}
                onClick={() => setSortBy(sortBy === 'score' ? 'distance' : 'score')}
                disabled={sortBy === 'distance' && !latitude}
                aria-label={
                  sortBy === 'score'
                    ? (isPt ? 'Ordenar por score' : 'Sort by score')
                    : (isPt ? 'Ordenar por distância' : 'Sort by distance')
                }
                activeClassName="bg-surface-2 border-divider-strong text-fg font-medium"
                inactiveClassName="bg-transparent border-transparent text-fg-subtle hover:text-fg hover:bg-surface-1"
                className="rounded-md"
                icon={sortBy === 'distance' ? <Navigation className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
              >
                <span className="hidden sm:inline">
                  {sortBy === 'score' ? 'Score' : (isPt ? 'Distância' : 'Distance')}
                </span>
              </FilterPill>

              {sortBy === 'distance' && !latitude && (
                <button
                  onClick={requestLocation}
                  disabled={geoLoading}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-sm min-h-[40px] bg-data-waves/10 text-data-waves hover:bg-data-waves/20 transition-colors"
                >
                  <MapPin className={`w-3.5 h-3.5 ${geoLoading ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline">{isPt ? 'Usar minha localização' : 'Use my location'}</span>
                </button>
              )}

              <span className="text-meta-sm text-fg-muted">
                <span className="font-mono tabular-nums text-fg">{sorted.length}</span>
                {' '}{isPt ? t.hero.spotsCount : t.hero.spotsCount}
                {onCount > 0 && (
                  <span className="ml-2">
                    · <span className="font-mono tabular-nums text-[rgb(var(--score-good))]">{onCount}</span>{' '}
                    {isPt ? t.hero.onCount : 'ON'}
                  </span>
                )}
                {marginalCount > 0 && (
                  <span className="ml-1">
                    · <span className="font-mono tabular-nums text-[rgb(var(--score-fair))]">{marginalCount}</span>{' '}
                    {isPt ? t.hero.marginalCount : t.hero.marginalCount}
                  </span>
                )}
              </span>

              {(selectedSport !== DEFAULT_SPORT || selectedRegion !== DEFAULT_REGION) && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
                  aria-label={isPt ? t.hero.clearFilters : t.hero.clearFilters}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isPt ? t.hero.clearFilters : t.hero.clearFilters}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <SpotMapInteractive
          spotsData={filtered}
          selectedSport={selectedSport}
          selectedRegion={selectedRegion}
          locale={locale}
          onSpotSelect={setSelectedSpotId}
          mapHud={{
            sportLabel: sportLabel || (isPt ? 'Todos' : 'All'),
            regionLabel: selectedRegion,
            spotCount: filtered.length,
            onCount,
            marginalCount,
            lastUpdated: mapLastUpdated,
            showClearFilters:
              selectedSport !== DEFAULT_SPORT || selectedRegion !== DEFAULT_REGION,
            onResetFilters: handleReset,
            clearFiltersLabel: t.hero.clearFilters,
          }}
        />
      </div>

      {sorted.length === 0 && (
        <EmptyState
          icon={<Filter className="w-8 h-8 text-fg-muted" aria-hidden />}
          title={
            isPt
              ? t.hero.noSpotsFound.replace('{sport}', sportLabel || '').replace('{region}', selectedRegion)
              : t.hero.noSpotsFound.replace('{sport}', sportLabel || '').replace('{region}', selectedRegion)
          }
          description={
            alternativeSport
              ? (isPt
                ? t.hero.tryAlternative.replace('{suggestion}', getSportLabel(alternativeSport, isPt) || '')
                : t.hero.tryAlternative.replace('{suggestion}', getSportLabel(alternativeSport, isPt) || ''))
              : undefined
          }
          action={
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {alternativeSport && (
                <Button
                  variant="secondary"
                  onClick={() => handleSportChange(alternativeSport)}
                >
                  <span className={getSportColor(alternativeSport)}>
                    {getSportIcon(alternativeSport)}
                  </span>
                  {isPt ? 'Ver' : 'View'} {getSportLabel(alternativeSport, isPt)}
                </Button>
              )}
              <Button variant="secondary" onClick={handleReset}>
                <RotateCcw className="w-4 h-4" aria-hidden />
                {t.hero.clearFilters}
              </Button>
              <Button href={`/${locale}/spots/`} variant="ghost" size="sm">
                {t.hero.exploreAll}
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Button>
            </div>
          }
        />
      )}

      <SpotDrawer
        spotData={selectedSpotData}
        onClose={() => setSelectedSpotId(null)}
        locale={locale}
      />
    </section>
  );
}
