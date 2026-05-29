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
import {
  dispatchSportChange,
  getOnCount,
  SPORT_CHANGE_EVENT,
  type HomepageSpotData,
} from '@/lib/homepageSport';
import { buildGridFiltersSearch, readGridFiltersFromWindow, syncGridFiltersToUrl } from '@/lib/gridFilters';
import { MACRO_REGIONS } from '@/lib/regions';

const SpotMapInteractive = dynamic(() => import('@/components/spots/SpotMapInteractive'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-1/[0.04]">
      <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
    </div>
  ),
});

interface HomepageMapHeroProps {
  locale: string;
  spotsData: HomepageSpotData[];
  maxTs: number | null;
}

export default function HomepageMapHero({ locale, spotsData, maxTs }: HomepageMapHeroProps) {
  const isPt = locale === 'pt';
  const regions = useMemo(() => [...MACRO_REGIONS], []);
  /** Must match SSR (readSportFromStorage when `window` is undefined → 'surf'). */
  const [sport, setSport] = useState<GridSportFilter>('surf');
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);

  useEffect(() => {
    if (!maxTs) {
      setHoursAgo(null);
      return;
    }
    setHoursAgo(Math.max(0, Math.floor((Date.now() - maxTs) / 3600000)));
  }, [maxTs]);

  useEffect(() => {
    const sync = () => {
      const { sport: urlSport } = readGridFiltersFromWindow(regions);
      setSport(urlSport);
    };
    sync();

    const onSportChange = (e: Event) => {
      const detail = (e as CustomEvent<GridSportFilter>).detail;
      if (detail) setSport(detail);
    };

    window.addEventListener('popstate', sync);
    window.addEventListener(SPORT_CHANGE_EVENT, onSportChange);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(SPORT_CHANGE_EVENT, onSportChange);
    };
  }, [regions]);

  const filtered = useMemo(
    () => filterGridSpots(spotsData as GridSpotData[], sport, DEFAULT_REGION),
    [spotsData, sport],
  );

  const onCount = useMemo(() => getOnCount(spotsData, sport), [spotsData, sport]);

  const handleSportChange = (next: GridSportFilter) => {
    setSport(next);
    try {
      localStorage.setItem('ventu:sport', next);
    } catch {
      /* noop */
    }
    syncGridFiltersToUrl(next, DEFAULT_REGION, regions);
    dispatchSportChange(next);
  };

  const liveLine =
    onCount > 0
      ? isPt
        ? `${onCount} spot${onCount === 1 ? '' : 's'} a bombar`
        : `${onCount} spot${onCount === 1 ? '' : 's'} firing`
      : isPt
        ? 'Mar calmo — vê o mapa na mesma'
        : 'Calm day — still worth a look';

  return (
    <section
      role="region"
      aria-label={isPt ? 'Mapa interactivo' : 'Interactive map'}
      className="hero-sunset-surface relative w-full h-[clamp(420px,70vh,760px)] rounded-b-3xl overflow-hidden border-b border-divider"
    >
      <div className="absolute inset-0 z-0">
        <SpotMapInteractive
          spotsData={filtered}
          selectedSport={sport}
          selectedRegion={DEFAULT_REGION}
          locale={locale}
          embedMode="hero"
        />
      </div>

      <div className="hero-sunset-overlay absolute inset-0 z-10 flex flex-col pointer-events-none bg-gradient-to-b from-bg-base/85 via-bg-base/25 to-transparent transition-[background] duration-slow">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 pb-4 flex flex-col gap-3 pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-3 max-w-xl">
            <h2
              id="home-map-hero-heading"
              className="text-display-lg text-fg tracking-tight leading-[1.05]"
            >
              {isPt ? 'Onde está bom hoje?' : "Where's it firing today?"}
            </h2>

            <div
              className="flex gap-2 overflow-x-auto no-scrollbar edge-fade-x pb-0.5 -mx-1 px-1"
              role="group"
              aria-label={isPt ? 'Filtrar por desporto' : 'Filter by sport'}
            >
              {MAP_SPORT_FILTERS.map((item) => {
                const active = sport === item.id;
                return (
                  <FilterPill
                    key={item.id}
                    active={active}
                    onClick={() => handleSportChange(item.id)}
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
              <span className="font-medium text-fg">{liveLine}</span>
              <span aria-hidden className="text-fg-subtle">
                ·
              </span>
              <FreshnessIndicator size="sm" hoursAgo={hoursAgo} locale={locale} />
            </p>

            <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
              <Button
                href={`/${locale}/mapa/${buildGridFiltersSearch(sport, DEFAULT_REGION, regions)}`}
                size="lg"
                locale={isPt ? 'pt' : 'en'}
                rightIcon={<Maximize2 className="w-4 h-4" aria-hidden />}
              >
                {isPt ? 'Explorar mapa' : 'Explore map'}
              </Button>
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <HomepageSearch locale={locale} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
