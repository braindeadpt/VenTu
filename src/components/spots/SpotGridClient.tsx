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
}: {
  spotsData: SpotData[];
  locale: string;
  regions: string[];
  initialSport?: string;
  initialRegion?: string;
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
      />
    </section>
  );
}
