'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Wind, Waves, Zap, Filter, Star, RotateCcw, ArrowRight, MapPin, Navigation } from 'lucide-react';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { getTranslation } from '@/lib/i18n';
import SpotDrawer from './SpotDrawer';
import FilterPill from '@/components/ui/FilterPill';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import SpotGridRankedList from './SpotGridRankedList';
import { useSpotGridFilters } from './hooks/useSpotGridFilters';
import {
  DEFAULT_REGION,
  DEFAULT_SPORT,
} from '@/lib/gridFilters';

const SpotMapInteractive = dynamic(() => import('./SpotMapInteractive'), { ssr: false });

type SpotData = GridSpotData;

const SPORTS: { id: GridSportFilter; labelPt: string; labelEn: string; icon: React.ReactNode; color: string }[] = [
  { id: 'all', labelPt: 'Todos', labelEn: 'All', icon: <Star className="w-4 h-4" />, color: 'text-fg' },
  { id: 'surf', labelPt: 'Surf', labelEn: 'Surf', icon: <Waves className="w-4 h-4" />, color: 'text-sport-surf' },
  { id: 'bodyboard', labelPt: 'Bodyboard', labelEn: 'Bodyboard', icon: <Waves className="w-4 h-4" />, color: 'text-sport-bodyboard' },
  { id: 'kitesurf', labelPt: 'Kitesurf', labelEn: 'Kitesurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-kitesurf' },
  { id: 'windsurf', labelPt: 'Windsurf', labelEn: 'Windsurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-windsurf' },
  { id: 'big-wave', labelPt: 'Big Wave', labelEn: 'Big Wave', icon: <span className="w-4 h-4" />, color: 'text-windDir-offshore' },
  { id: 'foil', labelPt: 'Foil', labelEn: 'Foil', icon: <Zap className="w-4 h-4" />, color: 'text-sport-foil' },
  { id: 'sup', labelPt: 'SUP', labelEn: 'SUP', icon: <Waves className="w-4 h-4" />, color: 'text-sport-sup' },
  { id: 'wakeboard', labelPt: 'Wakeboard', labelEn: 'Wakeboard', icon: <Zap className="w-4 h-4" />, color: 'text-sport-wakeboard' },
];

function getSportIcon(sport: GridSportFilter) {
  return SPORTS.find(s => s.id === sport)?.icon || <Star className="w-4 h-4" />;
}

function getSportColor(sport: GridSportFilter) {
  return SPORTS.find(s => s.id === sport)?.color || 'text-fg';
}

function getSportLabel(sport: unknown, isPt: boolean): string {
  if (typeof sport !== 'string') return '';
  const s = SPORTS.find(x => x.id === sport);
  return isPt ? s?.labelPt || '' : s?.labelEn || '';
}

export function SpotGridClient({
  spotsData,
  locale,
  regions,
  initialSport,
  initialRegion,
  excludeTopNowSlugs,
}: {
  spotsData: SpotData[];
  locale: string;
  regions: string[];
  initialSport?: string;
  initialRegion?: string;
  /** Home: exclude spots already in Top agora */
  excludeTopNowSlugs?: string[];
}) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as any);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  const {
    selectedSport,
    selectedRegion,
    sortBy,
    setSortBy,
    handleSportChange,
    handleRegionChange,
    handleReset,
    filtered,
    sorted,
    onCount,
    marginalCount,
    alternativeSport,
    latitude,
    geoLoading,
    requestLocation,
  } = useSpotGridFilters({ spotsData, regions, initialSport, initialRegion });

  const selectedSpotData = useMemo(() => {
    if (!selectedSpotId) return null;
    return spotsData.find(d => d.spot.id === selectedSpotId) || null;
  }, [selectedSpotId, spotsData]);

  const sportIcon = getSportIcon(selectedSport);
  const sportColor = getSportColor(selectedSport);
  const sportLabel = getSportLabel(selectedSport, isPt);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" suppressHydrationWarning>
      <div className="md:sticky md:top-16 md:z-40 bg-bg-base/95 md:backdrop-blur-sm border-b border-divider -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-3 mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 edge-fade-x">
            {SPORTS.map((sport, i) => {
              const active = selectedSport === sport.id;
              return (
                <span key={sport.id} className="stagger-fade-in" style={{ '--stagger-delay': i * 40 } as React.CSSProperties}>
                  <FilterPill
                    active={active}
                    onClick={() => handleSportChange(sport.id)}
                    icon={<span className={active ? sport.color : 'text-fg-muted'}>{sport.icon}</span>}
                  >
                    {isPt ? sport.labelPt : sport.labelEn}
                  </FilterPill>
                </span>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5 text-fg-muted mr-1">
                <Filter className="w-3.5 h-3.5" />
                <span className="text-meta-sm">{isPt ? 'Região' : 'Region'}</span>
              </div>
              {regions.map((region, i) => {
                const active = selectedRegion === region;
                return (
                  <span key={region} className="stagger-fade-in" style={{ '--stagger-delay': i * 60 } as React.CSSProperties}>
                    <FilterPill
                      compact
                      active={active}
                      onClick={() => handleRegionChange(region)}
                    >
                      {region}
                    </FilterPill>
                  </span>
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
                icon={sortBy === 'distance' ? <Navigation className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
              >
                <span className="hidden sm:inline">
                  {sortBy === 'score' ? 'Score' : (isPt ? 'Distância' : 'Distance')}
                </span>
              </FilterPill>

              {sortBy === 'distance' && !latitude && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={requestLocation}
                  loading={geoLoading}
                  leftIcon={<MapPin className="w-3.5 h-3.5" aria-hidden />}
                  locale={isPt ? 'pt' : 'en'}
                  className="text-data-waves border-data-waves/20 bg-data-waves/10 hover:bg-data-waves/20"
                >
                  <span className="hidden sm:inline">{isPt ? 'Usar minha localização' : 'Use my location'}</span>
                </Button>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                  aria-label={isPt ? t.hero.clearFilters : t.hero.clearFilters}
                  locale={isPt ? 'pt' : 'en'}
                >
                  <span className="hidden sm:inline">{isPt ? t.hero.clearFilters : t.hero.clearFilters}</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div id="explore-map" className="mb-8 map-fullscreen-wrap scroll-mt-24">
        <SpotMapInteractive
          spotsData={filtered}
          selectedSport={selectedSport}
          selectedRegion={selectedRegion}
          locale={locale}
          onSpotSelect={setSelectedSpotId}
          onFullscreenChange={setMapFullscreen}
          mapHud={
            mapFullscreen
              ? {
                  sports: SPORTS.map((s) => ({
                    id: s.id,
                    label: (isPt ? s.labelPt : s.labelEn) ?? s.id,
                    icon: s.icon,
                    color: s.color,
                  })),
                  regions,
                  selectedSport,
                  selectedRegion,
                  spotCount: filtered.length,
                  onSportChange: handleSportChange,
                  onRegionChange: handleRegionChange,
                  onResetFilters: handleReset,
                  clearFiltersLabel: t.hero.clearFilters,
                  showClearFilters:
                    selectedSport !== DEFAULT_SPORT || selectedRegion !== DEFAULT_REGION,
                }
              : undefined
          }
        />
      </div>

      {sorted.length > 0 && (
        <SpotGridRankedList
          sorted={sorted}
          selectedSport={selectedSport}
          locale={locale}
          excludeSlugs={excludeTopNowSlugs}
        />
      )}

      {sorted.length === 0 && (
        <EmptyState
          icon={<Filter className="w-8 h-8 text-fg-muted" aria-hidden />}
          title={
            isPt
              ? t.hero.noSpotsFound.replace('{sport}', sportLabel).replace('{region}', selectedRegion)
              : t.hero.noSpotsFound.replace('{sport}', sportLabel).replace('{region}', selectedRegion)
          }
          description={
            alternativeSport
              ? (isPt
                ? t.hero.tryAlternative.replace('{suggestion}', getSportLabel(alternativeSport, isPt))
                : t.hero.tryAlternative.replace('{suggestion}', getSportLabel(alternativeSport, isPt)))
              : undefined
          }
          action={
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {alternativeSport && (
                <Button
                  variant="secondary"
                  onClick={() => handleSportChange(alternativeSport as GridSportFilter)}
                >
                  <span className={getSportColor(alternativeSport as GridSportFilter)}>
                    {getSportIcon(alternativeSport as GridSportFilter)}
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
        gridSport={selectedSport}
      />
    </section>
  );
}
