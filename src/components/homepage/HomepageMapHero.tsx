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

  getTopSpotForSport,

  type HomepageSpotData,

} from '@/lib/homepageSport';

import { buildGridFiltersSearch, syncGridFiltersToUrl } from '@/lib/gridFilters';

import { useUrlGridSport } from '@/hooks/useUrlGridSport';

import { MACRO_REGIONS } from '@/lib/regions';

import { heroStatusLine } from '@/lib/voice';

import BestWindowBanner from '@/components/homepage/BestWindowBanner';

import HeroTicker from '@/components/homepage/HeroTicker';

import {

  formatBestWindowHours,

  toBestWindowWithTier,

  type BestWindow,

} from '@/lib/bestWindow';

import { resolveBestWindowForSport } from '@/lib/bestWindowToday';

import { SPORT_LABELS, type SportType } from '@/lib/sportRatings';



const SpotMapInteractive = dynamic(() => import('@/components/spots/SpotMapInteractive'), {

  ssr: false,

  loading: () => (

    <div className="absolute inset-0 flex items-center justify-center bg-bg-base">

      <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />

    </div>

  ),

});



/** Core sports on the discovery hero — horizontal scroll on mobile. */

const HERO_SPORT_FILTERS = MAP_SPORT_FILTERS.filter((f) =>

  ['all', 'surf', 'bodyboard', 'kitesurf', 'windsurf', 'foil'].includes(f.id),

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



  useEffect(() => {

    if (!maxTs) {

      setHoursAgo(null);

      return;

    }

    setHoursAgo(Math.max(0, Math.floor((Date.now() - maxTs) / 3600000)));

  }, [maxTs]);



  const sportFilters = isFeatured ? HERO_SPORT_FILTERS : MAP_SPORT_FILTERS;



  const filtered = useMemo(

    () => filterGridSpots(spotsData as GridSpotData[], sport, DEFAULT_REGION),

    [spotsData, sport],

  );



  const onCount = useMemo(() => getOnCount(spotsData, sport), [spotsData, sport]);

  const liveLine = heroStatusLine(onCount, isPt);



  const topSpot = useMemo(() => {

    const ts = getTopSpotForSport(spotsData, sport as 'surf' | 'kitesurf' | 'windsurf' | 'bodyboard');

    return ts;

  }, [spotsData, sport]);



  const bestWindow: BestWindow | null = useMemo(() => {

    if (!topSpot) return null;

    const sportFilter = sport === 'all' ? 'all' : (sport as SportType);

    const resolved = resolveBestWindowForSport(

      topSpot.bestWindowToday,

      topSpot.bestWindowsBySport,

      sportFilter,

    );

    return resolved ? toBestWindowWithTier(resolved) : null;

  }, [topSpot, sport]);

  const handleSportChange = (next: GridSportFilter) => {

    try {

      localStorage.setItem('ventu:sport', next);

    } catch {

      /* noop */

    }

    syncGridFiltersToUrl(next, DEFAULT_REGION, regions);

    dispatchSportChange(next);

  };



  if (!isFeatured) {

    return (

      <section

        role="region"

        aria-label={isPt ? 'Mapa interactivo' : 'Interactive map'}

        className="relative w-full h-[clamp(220px,38vh,360px)] rounded-2xl overflow-hidden border border-divider mx-4 sm:mx-6 lg:mx-auto max-w-7xl touch-pan-y bg-bg-base"

      >

        <div className="absolute inset-0 [&_.leaflet-marker-icon]:pointer-events-auto">

          <SpotMapInteractive

            spotsData={filtered}

            selectedSport={sport}

            selectedRegion={DEFAULT_REGION}

            locale={locale}

            embedMode="default"

          />

        </div>

        <div className="absolute inset-x-0 top-0 z-10 flex flex-col pointer-events-none pb-2">

          <div

            className="absolute inset-x-0 top-0 bottom-0 bg-gradient-to-b from-bg-base/92 via-bg-base/50 to-transparent pointer-events-none"

            aria-hidden

          />

          <div className="w-full px-4 pt-3 pb-2 flex flex-col gap-2 pointer-events-none relative">

            <div className="pointer-events-auto flex flex-col gap-2 max-w-xl">

              <h2 className="font-display text-h2 font-semibold text-fg tracking-tight">

                {isPt ? 'Mapa ao vivo' : 'Live map'}

              </h2>

            </div>

          </div>

        </div>

      </section>

    );

  }



  return (

    <section

      role="region"

      aria-label={isPt ? 'Mapa interactivo' : 'Interactive map'}

      className="relative w-full min-h-[480px] h-[min(760px,72vh)] bg-bg-base overflow-hidden rounded-b-3xl border-b border-divider touch-pan-y"

    >

      <div className="absolute inset-0 z-0 [&_.leaflet-marker-icon]:pointer-events-auto">

        <SpotMapInteractive

          spotsData={filtered}

          selectedSport={sport}

          selectedRegion={DEFAULT_REGION}

          locale={locale}

          embedMode="hero"

        />

      </div>



      <div

        className="absolute inset-0 z-[1] pointer-events-none bg-gradient-to-r from-bg-base from-0% via-bg-base/85 via-[36%] to-transparent to-[68%]"

        aria-hidden

      />



      <div className="relative z-10 flex h-full min-h-[inherit] flex-col pointer-events-none">

        <div className="max-w-7xl mx-auto w-full flex-1 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-4 flex flex-col gap-2 sm:gap-3">

          <div className="pointer-events-auto flex flex-col gap-2 sm:gap-3 max-w-xl">

            {bestWindow && topSpot && (

              <div

                className="stagger-fade-in motion-reduce:animate-none"

                style={{ '--stagger-delay': 0 } as React.CSSProperties}

              >

                <BestWindowBanner

                  window={bestWindow}

                  spotSlug={topSpot.spot.slug}

                  spotName={isPt ? topSpot.spot.name : topSpot.spot.nameEn}

                  locale={locale}

                />

              </div>

            )}

            <h2

              id="home-map-hero-heading"

              className="font-display text-display-xl font-bold text-fg tracking-tight leading-[1.02] stagger-fade-in motion-reduce:animate-none"

              style={{ '--stagger-delay': 80 } as React.CSSProperties}

            >

              {isPt ? 'Onde está bom hoje?' : "Where's it firing today?"}

            </h2>



            <div

              className="flex gap-2 overflow-x-auto no-scrollbar edge-fade-x pb-0.5 -mx-1 px-1 touch-pan-x stagger-fade-in motion-reduce:animate-none"

              role="group"

              aria-label={isPt ? 'Filtrar por desporto' : 'Filter by sport'}

              style={{ '--stagger-delay': 160 } as React.CSSProperties}

            >

              {sportFilters.map((item) => {

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



            <p

              className="text-body-sm text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1 stagger-fade-in motion-reduce:animate-none"

              style={{ '--stagger-delay': 240 } as React.CSSProperties}

            >

              <span className="font-medium text-fg" suppressHydrationWarning>

                {liveLine}

              </span>

              {maxTs !== null && (

                <>

                  <span aria-hidden className="text-fg-subtle">

                    ·

                  </span>

                  <FreshnessIndicator size="sm" hoursAgo={hoursAgo} updatedAtTs={maxTs} locale={locale} />

                </>

              )}

            </p>



            <div

              className="flex flex-col sm:flex-row flex-wrap gap-2 pt-0.5 stagger-fade-in motion-reduce:animate-none"

              style={{ '--stagger-delay': 320 } as React.CSSProperties}

            >

              <Button

                href={`/${locale}/mapa/${buildGridFiltersSearch(sport, DEFAULT_REGION, regions)}`}

                size="lg"

                locale={isPt ? 'pt' : 'en'}

                className="shadow-card shrink-0"

                rightIcon={<Maximize2 className="w-4 h-4" aria-hidden />}

              >

                {isPt ? 'Explorar mapa' : 'Explore map'}

              </Button>

              <div className="min-w-0 flex-1 sm:max-w-xs">

                <HomepageSearch locale={locale} variant="hero" />

              </div>

            </div>

          </div>

        </div>



        <div

          className="pointer-events-auto mt-auto px-4 sm:px-6 lg:px-8 pb-2.5 pt-8 bg-gradient-to-t from-bg-base via-bg-base/55 to-transparent stagger-fade-in motion-reduce:animate-none"

          style={{ '--stagger-delay': 400 } as React.CSSProperties}

        >

          <div className="max-w-7xl mx-auto">

            <HeroTicker

              locale={locale}

              updatedAtTs={maxTs}

            />

          </div>

        </div>

      </div>

    </section>

  );

}


