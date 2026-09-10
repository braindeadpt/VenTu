'use client';



import { useEffect, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { MapPin, Maximize2 } from 'lucide-react';

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

  // Sem fallback animado: o poster estático (HeroMapPoster) cobre a área do
  // mapa desde o primeiro paint e desvanece quando o mapa inicializa (onReady).
  loading: () => null,

});



/** Core sports on the discovery hero — horizontal scroll on mobile. */

const HERO_SPORT_FILTERS = MAP_SPORT_FILTERS.filter((f) =>

  ['all', 'surf', 'bodyboard', 'kitesurf', 'windsurf', 'foil'].includes(f.id),

);

/**
 * Poster estático do hero (primeiro paint): sem anel de loading nem animação.
 * Grelha subtil + pontos de spot decorativos + «A preparar o mapa…». Fica
 * cozido no shell, cobre a área do mapa e desvanece quando o mapa interactivo
 * inicializa (data-map-ready → CSS). aria-hidden: é decoração, o mapa real
 * anuncia-se a si próprio quando revela.
 */
function HeroMapPoster({ isPt }: { isPt: boolean }) {
  return (
    <div
      data-map-hero-poster
      aria-hidden="true"
      className="absolute inset-0 z-[2] flex items-center justify-center bg-bg-base pointer-events-none transition-opacity duration-300 motion-reduce:transition-none"
      style={{
        backgroundImage: [
          'linear-gradient(rgb(var(--data-waves) / 0.05) 1px, transparent 1px)',
          'linear-gradient(90deg, rgb(var(--data-waves) / 0.05) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '44px 44px',
      }}
    >
      {/* Pontos de spot decorativos — stand-ins estáticos dos marcadores. */}
      <span className="absolute left-[16%] top-[34%] w-2 h-2 rounded-full bg-data-water/40" />
      <span className="absolute left-[31%] top-[58%] w-2.5 h-2.5 rounded-full bg-data-waves/50" />
      <span className="absolute left-[58%] top-[26%] w-2 h-2 rounded-full bg-data-water/40" />
      <span className="absolute left-[72%] top-[52%] w-2 h-2 rounded-full bg-data-waves/50" />
      <span className="absolute left-[47%] top-[70%] w-1.5 h-1.5 rounded-full bg-data-wind/40" />

      <div className="flex flex-col items-center gap-2 text-fg-muted">
        <MapPin className="w-6 h-6" strokeWidth={1.5} aria-hidden />
        <p className="text-sm">{isPt ? 'A preparar o mapa…' : 'Preparing the map…'}</p>
      </div>
    </div>
  );
}

interface HomepageMapHeroProps {
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

  const [mapReady, setMapReady] = useState(false);

  // A resolução de isReturning troca o ramo featured↔compact e remonta o mapa
  // (early return → árvore nova): o poster volta a cobrir o novo mapa a carregar.
  useEffect(() => {

    setMapReady(false);

  }, [variant]);

  const regions = useMemo(() => [...MACRO_REGIONS], []);

  const sport = useUrlGridSport(regions, 'surf');

  const sportFilters = isFeatured ? HERO_SPORT_FILTERS : MAP_SPORT_FILTERS;

  // Let the hero map paint tiles before re-scoring from conditions.json.
  const liveSpotsData = useLiveGridSpotData(spotsData, { deferRefreshMs: 4000 });



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
    // Returning-user teaser: the map is the picture, not a second
    // fullscreen chrome. A display heading over the tiles sat behind
    // Leaflet panes and the MapControls stack was clipped in a 360px box.
    return (
      <section
        role="region"
        aria-label={isPt ? 'Mapa interactivo' : 'Interactive map'}
        className="relative w-full h-[clamp(220px,38vh,360px)] rounded-2xl overflow-hidden border border-divider mx-4 sm:mx-6 lg:mx-auto max-w-7xl touch-pan-y bg-bg-base"
        data-map-ready={mapReady}
      >
        <h2 className="sr-only">{isPt ? 'Mapa ao vivo' : 'Live map'}</h2>
        <HeroMapPoster isPt={isPt} />
        <div className="absolute inset-0 z-0 [&_.leaflet-marker-icon]:pointer-events-auto">
          <SpotMapInteractive
            spotsData={filtered}
            selectedSport={sport}
            selectedRegion={DEFAULT_REGION}
            locale={locale}
            embedMode="hero"
            showBuoyNotice={false}
            onReady={() => setMapReady(true)}
          />
        </div>
        <div className="absolute top-3 left-3 z-20 pointer-events-auto">
          <Button
            href={`/${locale}/mapa/${buildGridFiltersSearch(sport, DEFAULT_REGION, regions)}`}
            size="md"
            locale={isPt ? 'pt' : 'en'}
            className="shadow-card"
            rightIcon={<Maximize2 className="w-4 h-4" aria-hidden />}
          >
            {isPt ? 'Explorar mapa' : 'Explore map'}
          </Button>
        </div>
      </section>
    );
  }



  return (

    <section

      role="region"

      aria-label={isPt ? 'Mapa interactivo' : 'Interactive map'}

      className="relative w-full min-h-[480px] h-[min(760px,72vh)] bg-bg-base overflow-hidden rounded-b-3xl border-b border-divider touch-pan-y"
      data-map-ready={mapReady}

    >

      <HeroMapPoster isPt={isPt} />

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

          onReady={() => setMapReady(true)}

        />

      </div>



      {/* Desktop: wash the left so copy sits on a solid pane and the map
          reads on the right. On a phone that same L→R wash covers ~68% of
          a 390px screen — the tiles are there, the user just cannot see them. */}
      <div
        className="absolute inset-0 z-[3] pointer-events-none hidden md:block bg-gradient-to-r from-bg-base from-0% via-bg-base/85 via-[36%] to-transparent to-[68%]"
        aria-hidden
        data-map-hero-scrim="side"
      />
      <div
        className="absolute inset-x-0 top-0 z-[3] h-[min(240px,46%)] pointer-events-none bg-gradient-to-b from-bg-base/80 via-bg-base/30 to-transparent md:hidden"
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


