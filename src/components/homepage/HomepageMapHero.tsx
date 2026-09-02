'use client';



import { useMemo } from 'react';

import dynamic from 'next/dynamic';

import { Maximize2 } from 'lucide-react';

import FilterPill from '@/components/ui/FilterPill';

import Button from '@/components/ui/Button';

import HomepageSearch from '@/components/ui/HomepageSearch';

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
import { useLiveGridSpotData } from '@/hooks/useLiveGridSpotData';

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

);interface HomepageMapHeroProps {
  locale: string;
  spotsData: HomepageSpotData[];
  maxTs: number | null;
  variant?: 'featured' | 'compact';
  /** IH buoy layer state from pipeline-meta.json (ticker diagnostics). */
  buoyLayer?: import('@/lib/pipelineMeta').BuoyLayerMeta | null;
  /** Coastal warnings (IH) layer state from pipeline-meta.json (ticker). */
  coastalWarningsLayer?: import('@/lib/pipelineMeta').CoastalWarningsLayerMeta | null;
}

export default function HomepageMapHero({
  locale,
  spotsData,
  maxTs,
  variant = 'featured',
  buoyLayer,
  coastalWarningsLayer,
}: HomepageMapHeroProps) {

  const isPt = locale === 'pt';

  const isFeatured = variant === 'featured';

  const regions = useMemo(() => [...MACRO_REGIONS], []);

  const sport = useUrlGridSport(regions, 'surf');

  const sportFilters = isFeatured ? HERO_SPORT_FILTERS : MAP_SPORT_FILTERS;

  const liveSpotsData = useLiveGridSpotData(spotsData);



  const filtered = useMemo(

    () => filterGridSpots(liveSpotsData, sport, DEFAULT_REGION),

    [liveSpotsData, sport],

  );



  const onCount = useMemo(() => getOnCount(liveSpotsData, sport), [liveSpotsData, sport]);

  const liveLine = heroStatusLine(onCount, isPt);



  const topSpot = useMemo(() => {
    // Best available for hero tip — not the «A bombar» threshold
    const ts = getTopSpotForSport(
      liveSpotsData,
      sport as 'surf' | 'kitesurf' | 'windsurf' | 'bodyboard',
      1,
    );
    return ts;
  }, [liveSpotsData, sport]);



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

            // The homepage already shows the single buoy notice above the
            // TopNow cards — never duplicate it over this map.
            showBuoyNotice={false}

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

          // Same decision as the compact variant: the TopNow notice is the
          // homepage's single buoy banner; the map overlay only renders on
          // surfaces without TopNow (real /mapa/, explorer grid).
          showBuoyNotice={false}

        />

      </div>



      {/* Desktop: wash the left so copy sits on a solid pane and the map
          reads on the right. On a phone that same L→R wash covers ~68% of
          a 390px screen — the tiles are there, the user just cannot see them. */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none hidden md:block bg-gradient-to-r from-bg-base from-0% via-bg-base/85 via-[36%] to-transparent to-[68%]"
        aria-hidden
        data-map-hero-scrim="side"
      />
      <div
        className="absolute inset-x-0 top-0 z-[1] h-[min(240px,46%)] pointer-events-none bg-gradient-to-b from-bg-base/80 via-bg-base/30 to-transparent md:hidden"
        aria-hidden
        data-map-hero-scrim="top"
      />



      <div className="relative z-10 flex h-full min-h-[inherit] flex-col pointer-events-none">

        <div className="max-w-7xl mx-auto w-full flex-1 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-4 flex flex-col gap-2 sm:gap-3">

          <div className="pointer-events-auto flex flex-col gap-2 sm:gap-3 max-w-xl">

            <p
              className="font-display text-meta font-semibold tracking-[0.18em] uppercase text-accent stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': 40 } as React.CSSProperties}
            >
              VenTu
            </p>

            <h2

              id="home-map-hero-heading"

              className="font-display text-display-xl font-bold text-fg tracking-tight leading-[1.02] stagger-fade-in motion-reduce:animate-none"

              style={{ '--stagger-delay': 80 } as React.CSSProperties}

            >

              {isPt ? 'Onde está bom hoje?' : "Where's it firing today?"}

            </h2>



            <div

              className="flex gap-2 overflow-x-auto no-scrollbar edge-fade-x-end pb-0.5 -mx-1 px-1 touch-pan-x stagger-fade-in motion-reduce:animate-none"

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



            <div

              className="flex flex-col sm:flex-row flex-wrap gap-2 pt-0.5 stagger-fade-in motion-reduce:animate-none"

              style={{ '--stagger-delay': 240 } as React.CSSProperties}

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

            {bestWindow && topSpot && (
              <div
                className="stagger-fade-in motion-reduce:animate-none pt-1"
                style={{ '--stagger-delay': 280 } as React.CSSProperties}
              >
                <BestWindowBanner
                  window={bestWindow}
                  spotSlug={topSpot.spot.slug}
                  spotName={isPt ? topSpot.spot.name : topSpot.spot.nameEn}
                  locale={locale}
                />
              </div>
            )}

          </div>

        </div>



        <div

          className="pointer-events-auto mt-auto px-4 sm:px-6 lg:px-8 pb-2.5 pt-8 bg-gradient-to-t from-bg-base via-bg-base/55 to-transparent stagger-fade-in motion-reduce:animate-none"

          style={{ '--stagger-delay': 400 } as React.CSSProperties}

        >

          <div className="max-w-7xl mx-auto">            <HeroTicker
              locale={locale}
              updatedAtTs={maxTs}
              statusLine={liveLine}
              buoyLayer={buoyLayer}
              coastalWarningsLayer={coastalWarningsLayer}
            />

          </div>

        </div>

      </div>

    </section>

  );

}


