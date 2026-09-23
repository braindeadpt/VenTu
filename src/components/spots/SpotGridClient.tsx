'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Wind, Waves, Zap, Filter, Star, RotateCcw, ArrowRight, MapPin, Navigation, Mountain, Table2, LayoutGrid, Map as MapIcon, ChevronDown } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { getTranslation } from '@/lib/i18n';
import SpotDrawer from './SpotDrawer';
import FilterPill from '@/components/ui/FilterPill';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { getPlayfulEmptyCopy } from '@/lib/emptyStateCopy';
import SpotGridRankedList from './SpotGridRankedList';
import SpotRankedTable from './SpotRankedTable';
import { useSpotGridFilters } from './hooks/useSpotGridFilters';
import { useLiveGridSpotData } from '@/hooks/useLiveGridSpotData';
import {
  DEFAULT_REGION,
  DEFAULT_SPORT,
} from '@/lib/gridFilters';
import {
  MAP_DIFFICULTY_LS_KEY,
  MAP_DIFFICULTY_OPTIONS,
  readMapDifficultyFromStorage,
  spotMatchesDifficultyFilter,
  type MapDifficultyFilter,
} from '@/lib/mapDifficulty';

const SpotMapInteractive = dynamic(() => import('./SpotMapInteractive'), { ssr: false });

type SpotData = GridSpotData;

const SPORTS: { id: GridSportFilter; labelPt: string; labelEn: string; icon: React.ReactNode; color: string }[] = [
  { id: 'all', labelPt: 'Todos', labelEn: 'All', icon: <Star className="w-4 h-4" />, color: 'text-fg' },
  { id: 'surf', labelPt: 'Surf', labelEn: 'Surf', icon: <Waves className="w-4 h-4" />, color: 'text-sport-surf' },
  { id: 'bodyboard', labelPt: 'Bodyboard', labelEn: 'Bodyboard', icon: <Waves className="w-4 h-4" />, color: 'text-sport-bodyboard' },
  { id: 'kitesurf', labelPt: 'Kitesurf', labelEn: 'Kitesurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-kitesurf' },
  { id: 'windsurf', labelPt: 'Windsurf', labelEn: 'Windsurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-windsurf' },
  { id: 'big-wave', labelPt: 'Big Wave', labelEn: 'Big Wave', icon: <Mountain className="w-4 h-4" />, color: 'text-windDir-offshore' },
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
  const t = getTranslation(locale as Locale);
  const liveSpotsData = useLiveGridSpotData(spotsData);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [mapDifficulty, setMapDifficulty] = useState<MapDifficultyFilter>('all');
  // Auditoria 2026-09-16 (C1): a tabela densa é a vista por omissão — responde
  // «onde ir?» sem scroll; os cards ficam como alternativa visual.
  const [view, setView] = useState<'table' | 'cards'>('table');
  // O mapa embebido deixa de comer o primeiro viewport em ecrãs pequenos:
  // fechado <lg (lazy — o Leaflet nem monta), aberto em desktop.
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    setMapDifficulty(readMapDifficultyFromStorage());
    if (window.matchMedia('(min-width: 1024px)').matches) setMapOpen(true);
    try {
      const saved = localStorage.getItem('ventu:grid-view');
      if (saved === 'cards' || saved === 'table') setView(saved);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('ventu:grid-view', view);
    } catch {
      /* noop */
    }
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem(MAP_DIFFICULTY_LS_KEY, mapDifficulty);
    } catch {
      /* noop */
    }
  }, [mapDifficulty]);

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
  } = useSpotGridFilters({ spotsData: liveSpotsData, regions, initialSport, initialRegion });

  const mapSpotsData = useMemo(() => {
    if (mapDifficulty === 'all') return filtered;
    return filtered.filter((d) => spotMatchesDifficultyFilter(d.spot, mapDifficulty));
  }, [filtered, mapDifficulty]);

  const handleMapReset = useCallback(() => {
    handleReset();
    setMapDifficulty('all');
  }, [handleReset]);

  const selectedSpotData = useMemo(() => {
    if (!selectedSpotId) return null;
    return liveSpotsData.find(d => d.spot.id === selectedSpotId) || null;
  }, [selectedSpotId, liveSpotsData]);

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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar min-w-0 flex-1 basis-48">
              <div className="flex items-center gap-1.5 text-fg-muted mr-1">
                <Filter className="w-3.5 h-3.5" />
                <span className="text-meta-sm">{t.spots.region}</span>
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

            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <div
                role="group"
                aria-label={isPt ? 'Vista da lista' : 'List view'}
                className="flex items-center gap-1"
              >
                <FilterPill
                  compact
                  active={view === 'table'}
                  onClick={() => setView('table')}
                  aria-label={isPt ? 'Vista em tabela' : 'Table view'}
                  icon={<Table2 className="w-3.5 h-3.5" />}
                >
                  <span className="hidden sm:inline">{isPt ? 'Tabela' : 'Table'}</span>
                </FilterPill>
                <FilterPill
                  compact
                  active={view === 'cards'}
                  onClick={() => setView('cards')}
                  aria-label={isPt ? 'Vista em cards' : 'Cards view'}
                  icon={<LayoutGrid className="w-3.5 h-3.5" />}
                >
                  <span className="hidden sm:inline">Cards</span>
                </FilterPill>
              </div>

              <FilterPill
                compact
                active={sortBy === 'distance' && !!latitude}
                onClick={() => setSortBy(sortBy === 'score' ? 'distance' : 'score')}
                disabled={sortBy === 'distance' && !latitude}
                aria-label={
                  sortBy === 'score'
                    ? t.spots.sortByScoreHint
                    : t.spots.sortByDistanceHint
                }
                icon={sortBy === 'distance' ? <Navigation className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
              >
                <span className="hidden sm:inline">{t.spots.sort}</span>
              </FilterPill>

              {sortBy === 'distance' && !latitude && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={requestLocation}
                  loading={geoLoading}
                  leftIcon={<MapPin className="w-3.5 h-3.5" aria-hidden />}
                  locale={locale as Locale}
                  className="text-data-waves border-data-waves/20 bg-data-waves/10 hover:bg-data-waves/20"
                >
                  <span className="hidden sm:inline">{t.spots.useMyLocation}</span>
                </Button>
              )}

              <span className="text-meta-sm text-fg-muted">
                <span className="font-mono tabular-nums text-fg">{sorted.length}</span>
                {(selectedSport !== DEFAULT_SPORT || selectedRegion !== DEFAULT_REGION) && (
                  <span className="text-fg-subtle">
                    {' '}{isPt ? 'de' : 'of'}{' '}
                    <span className="font-mono tabular-nums">{liveSpotsData.length}</span>
                  </span>
                )}
                {' '}{t.hero.spotsCount}
                {onCount > 0 && (
                  <span className="ml-2">
                    · <span className="font-mono tabular-nums text-score-good">{onCount}</span>{' '}
                    {t.hero.onCount}
                  </span>
                )}
                {marginalCount > 0 && (
                  <span className="ml-1">
                    · <span className="font-mono tabular-nums text-score-fair">{marginalCount}</span>{' '}
                    {t.hero.marginalCount}
                  </span>
                )}
              </span>

              {(selectedSport !== DEFAULT_SPORT || selectedRegion !== DEFAULT_REGION) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                  aria-label={t.hero.clearFilters}
                  locale={locale as Locale}
                >
                  <span className="hidden sm:inline">{t.hero.clearFilters}</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div id="explore-map" className="mb-8 map-fullscreen-wrap scroll-mt-24">
        <button
          type="button"
          onClick={() => setMapOpen((o) => !o)}
          aria-expanded={mapOpen}
          className="w-full flex items-center gap-2 min-h-[44px] px-3 mb-2 rounded-input border border-divider bg-surface-1/[0.03] text-meta font-medium text-fg hover:border-divider-strong transition-colors duration-150"
        >
          <MapIcon className="w-4 h-4 text-fg-muted" aria-hidden />
          <span className="flex-1 text-left">
            {isPt ? 'Mapa' : 'Map'}
            <span className="text-fg-muted font-mono tabular-nums">
              {' '}· {mapSpotsData.length} {t.hero.spotsCount}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-fg-muted transition-transform duration-150 ${mapOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {mapOpen && (
        <SpotMapInteractive
          spotsData={mapSpotsData}
          selectedSport={selectedSport}
          selectedRegion={selectedRegion}
          locale={locale as Locale}
          onSpotSelect={setSelectedSpotId}
          fullscreenBelowHeader
          mapHud={{
            sports: SPORTS.map((s) => ({
              id: s.id,
              label: (isPt ? s.labelPt : s.labelEn) ?? s.id,
              icon: s.icon,
              color: s.color,
            })),
            regions,
            selectedSport,
            selectedRegion,
            spotCount: mapSpotsData.length,
            onSportChange: handleSportChange,
            onRegionChange: handleRegionChange,
            onResetFilters: handleMapReset,
            clearFiltersLabel: t.hero.clearFilters,
            showClearFilters:
              selectedSport !== DEFAULT_SPORT ||
              selectedRegion !== DEFAULT_REGION ||
              mapDifficulty !== 'all',
            difficulties: MAP_DIFFICULTY_OPTIONS.map((d) => ({
              id: d.id,
              label: isPt ? d.labelPt : d.labelEn,
            })),
            selectedDifficulty: mapDifficulty,
            onDifficultyChange: setMapDifficulty,
            difficultyGroupLabel: t.spots.level,
            layersLabel: t.map.layersMenu,
          }}
        />
        )}
      </div>

      {sorted.length > 0 &&
        (view === 'table' ? (
          <SpotRankedTable
            sorted={sorted}
            selectedSport={selectedSport}
            locale={locale as Locale}
          />
        ) : (
          <SpotGridRankedList
            sorted={sorted}
            selectedSport={selectedSport}
            locale={locale as Locale}
            excludeSlugs={excludeTopNowSlugs}
          />
        ))}

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
              : getPlayfulEmptyCopy('no-spots-filter', locale).description
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
                  {t.spots.view} {getSportLabel(alternativeSport, isPt)}
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
        locale={locale as Locale}
        gridSport={selectedSport}
      />
    </section>
  );
}
