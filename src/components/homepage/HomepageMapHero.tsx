'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Maximize2 } from 'lucide-react';
import FilterPill from '@/components/ui/FilterPill';
import Button from '@/components/ui/Button';
import HomepageSearch from '@/components/ui/HomepageSearch';
import FreshnessIndicator from '@/components/ui/FreshnessIndicator';
import { DEFAULT_REGION } from '@/lib/gridFilters';
import { filterGridSpots } from '@/lib/gridSpotFilters';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import type { GridSportFilter } from '@/lib/sportRatings';
import { MAP_SPORT_FILTERS } from '@/lib/mapSportFilters';
import { dispatchSportChange, getOnCount, type HomepageSpotData } from '@/lib/homepageSport';
import { buildGridFiltersSearch, syncGridFiltersToUrl } from '@/lib/gridFilters';
import { useUrlGridSport } from '@/hooks/useUrlGridSport';
import { MACRO_REGIONS } from '@/lib/regions';
import { STALE_THRESHOLD_HOURS } from '@/lib/dataFreshness';
import { heroStatusLine } from '@/lib/voice';
import RegionLifestyleImage from '@/components/ui/RegionLifestyleImage';
import { HOME_HERO_REGION_SLUG } from '@/lib/regionImage';

const SpotMapInteractive = dynamic(() => import('@/components/spots/SpotMapInteractive'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-1/[0.04]">
      <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
    </div>
  ),
});

/** One row of core sports on the discovery hero (new visitors). */
const HERO_SPORT_FILTERS = MAP_SPORT_FILTERS.filter((f) =>
  ['all', 'surf', 'kitesurf', 'windsurf'].includes(f.id),
);

interface HomepageMapHeroProps {
  locale: string;
  spotsData: HomepageSpotData[];
  maxTs: number | null;
  variant?: 'featured' | 'compact';
}

export default function HomepageMapHero({
  locale,
  spotsData,
  maxTs,
  variant = 'featured',
}: HomepageMapHeroProps) {
  const isPt = locale === 'pt';
  const isFeatured = variant === 'featured';
  const regions = useMemo(() => [...MACRO_REGIONS], []);
  const sport = useUrlGridSport(regions, 'surf');
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);

  const sportFilters = isFeatured ? HERO_SPORT_FILTERS : MAP_SPORT_FILTERS;

  useEffect(() => {
    if (!maxTs) {
      setHoursAgo(null);
      return;
    }
    setHoursAgo(Math.max(0, Math.floor((Date.now() - maxTs) / 3600000)));
  }, [maxTs]);

  const filtered = useMemo(
    () => filterGridSpots(spotsData as GridSpotData[], sport, DEFAULT_REGION),
    [spotsData, sport],
  );

  const onCount = useMemo(() => getOnCount(spotsData, sport), [spotsData, sport]);
  const liveLine = heroStatusLine(onCount, isPt);

  const handleSportChange = (next: GridSportFilter) => {
    try {
      localStorage.setItem('ventu:sport', next);
    } catch {
      /* noop */
    }
    syncGridFiltersToUrl(next, DEFAULT_REGION, regions);
    dispatchSportChange(next);
  };

  return (
    <section
      role="region"
      aria-label={isPt ? 'Mapa interactivo' : 'Interactive map'}
      className={
        isFeatured
          ? 'hero-sunset-surface relative w-full h-[clamp(420px,65vh,720px)] rounded-b-3xl overflow-hidden border-b border-divider touch-pan-y'
          : 'relative w-full h-[clamp(220px,38vh,360px)] rounded-2xl overflow-hidden border border-divider mx-4 sm:mx-6 lg:mx-auto max-w-7xl touch-pan-y'
      }
    >
      <div className="absolute inset-0 z-0 pointer-events-none [&_.leaflet-marker-icon]:pointer-events-auto">
        <SpotMapInteractive
          spotsData={filtered}
          selectedSport={sport}
          selectedRegion={DEFAULT_REGION}
          locale={locale}
          embedMode="hero"
        />
      </div>

      {isFeatured && (
        <div
          className="absolute inset-x-0 top-0 z-[5] h-[min(42%,320px)] sm:h-[min(38%,360px)] pointer-events-none overflow-hidden"
          aria-hidden
        >
          <div className="relative h-full w-full">
            <RegionLifestyleImage
              slug={HOME_HERO_REGION_SLUG}
              locale={isPt ? 'pt' : 'en'}
              decorative
              className="opacity-35 mix-blend-soft-light"
              priority
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-bg-base/70 via-bg-base/40 to-transparent" />
        </div>
      )}

      <div
        className={
          isFeatured
            ? 'hero-sunset-overlay absolute inset-x-0 top-0 z-10 flex flex-col pointer-events-none max-h-[min(52%,420px)] sm:max-h-none sm:inset-0'
            : 'absolute inset-x-0 top-0 z-10 flex flex-col pointer-events-none pb-2'
        }
      >
        {isFeatured && (
          <>
            <div
              className="absolute inset-0 bg-gradient-to-r from-bg-base/92 via-bg-base/55 to-transparent sm:via-bg-base/35 pointer-events-none"
              aria-hidden
            />
            <div
              className="absolute inset-0 bg-gradient-to-b from-bg-base/88 via-bg-base/35 to-transparent pointer-events-none"
              aria-hidden
            />
            <div
              className="absolute inset-0 hero-map-sunset-corners pointer-events-none"
              aria-hidden
            />
          </>
        )}
        {!isFeatured && (
          <div
            className="absolute inset-x-0 top-0 bottom-0 bg-gradient-to-b from-bg-base/92 via-bg-base/50 to-transparent pointer-events-none"
            aria-hidden
          />
        )}
        <div
          className={
            isFeatured
              ? 'max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-3 flex flex-col gap-2 sm:gap-3 pointer-events-none'
              : 'w-full px-4 pt-3 pb-2 flex flex-col gap-2 pointer-events-none'
          }
        >
          <div className="pointer-events-auto flex flex-col gap-2 sm:gap-3 max-w-xl">
            <h2
              id="home-map-hero-heading"
              className={
                isFeatured
                  ? 'font-display text-display-xl font-bold text-fg tracking-tight leading-[1.02] drop-shadow-sm'
                  : 'font-display text-h2 font-semibold text-fg tracking-tight'
              }
            >
              {isFeatured
                ? isPt
                  ? 'Onde está bom hoje?'
                  : "Where's it firing today?"
                : isPt
                  ? 'Mapa ao vivo'
                  : 'Live map'}
            </h2>

            <div
              className="flex gap-2 overflow-x-auto no-scrollbar edge-fade-x pb-0.5 -mx-1 px-1 touch-pan-x"
              role="group"
              aria-label={isPt ? 'Filtrar por desporto' : 'Filter by sport'}
            >
              {sportFilters.map((item) => {
                const active = sport === item.id;
                return (
                  <FilterPill
                    key={item.id}
                    active={active}
                    onClick={() => handleSportChange(item.id)}
                    compact={!isFeatured}
                    icon={
                      <span className={active ? item.color : 'text-fg-muted'}>{item.icon}</span>
                    }
                  >
                    {isPt ? item.labelPt : item.labelEn}
                  </FilterPill>
                );
              })}
            </div>

            <p className="text-body-sm text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-fg" suppressHydrationWarning>
                {liveLine}
              </span>
              {isFeatured && hoursAgo !== null && hoursAgo < STALE_THRESHOLD_HOURS && (
                <>
                  <span aria-hidden className="text-fg-subtle">
                    ·
                  </span>
                  <FreshnessIndicator size="sm" hoursAgo={hoursAgo} locale={locale} />
                </>
              )}
            </p>

            <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-0.5">
              <Button
                href={`/${locale}/mapa/${buildGridFiltersSearch(sport, DEFAULT_REGION, regions)}`}
                size={isFeatured ? 'lg' : 'md'}
                locale={isPt ? 'pt' : 'en'}
                className="bg-sunset border-transparent hover:opacity-95 active:opacity-90 shadow-card shrink-0"
                rightIcon={<Maximize2 className="w-4 h-4" aria-hidden />}
              >
                {isPt ? 'Explorar mapa' : 'Explore map'}
              </Button>
              {isFeatured && (
                <div className="min-w-0 flex-1 sm:max-w-xs">
                  <HomepageSearch locale={locale} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
