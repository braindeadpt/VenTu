'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Maximize2, Waves, Wind, Droplets, Compass, Clock } from 'lucide-react';
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
import { STALE_THRESHOLD_HOURS } from '@/lib/dataFreshness';
import { heroStatusLine } from '@/lib/voice';
import RegionLifestyleImage from '@/components/ui/RegionLifestyleImage';
import { HOME_HERO_REGION_SLUG } from '@/lib/regionImage';
import BestWindowBanner from '@/components/homepage/BestWindowBanner';
import HeroTicker from '@/components/homepage/HeroTicker';
import {
  estimateBestWindow,
  formatBestWindowHours,
  type BestWindow,
} from '@/lib/bestWindow';
import { SPORT_LABELS, type SportType } from '@/lib/sportRatings';

const SpotMapInteractive = dynamic(() => import('@/components/spots/SpotMapInteractive'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-1/[0.04]">
      <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
    </div>
  ),
});

/** Core sports on the discovery hero — horizontal scroll on mobile. */
const HERO_SPORT_FILTERS = MAP_SPORT_FILTERS.filter((f) =>
  ['all', 'surf', 'bodyboard', 'kitesurf', 'windsurf', 'foil'].includes(f.id),
);

const HERO_PILL_ACTIVE =
  'bg-bg-elevated text-fg border-divider-strong shadow-[0_2px_12px_rgba(0,0,0,0.2)]';
const HERO_PILL_INACTIVE =
  'bg-bg-base/92 text-fg border-divider backdrop-blur-sm shadow-[0_1px_8px_rgba(0,0,0,0.18)] hover:bg-bg-base hover:border-divider-strong';

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
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    if (!maxTs) {
      setHoursAgo(null);
      return;
    }
    setHoursAgo(Math.max(0, Math.floor((Date.now() - maxTs) / 3600000)));
  }, [maxTs]);

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

  // Top spot for the currently filtered sport.
  const topSpot = useMemo(() => {
    const ts = getTopSpotForSport(spotsData, sport as 'surf' | 'kitesurf' | 'windsurf' | 'bodyboard');
    return ts;
  }, [spotsData, sport]);

  // Best window for that top spot, recomputed on mount (now is set in useEffect).
  const bestWindow: BestWindow | null = useMemo(() => {
    if (!now || !topSpot) return null;
    const score =
      topSpot.allScores[sport as SportType]?.score ??
      Math.max(...Object.values(topSpot.allScores).map((s) => s.score), 0);
    return estimateBestWindow(score, sport as SportType, now);
  }, [now, topSpot, sport]);

  // Aggregates for the ticker.
  const aggregates = useMemo(() => {
    const filteredForSport =
      sport === 'all' ? spotsData : spotsData.filter((d) => d.allScores[sport as SportType]?.score);
    const on = filteredForSport.filter((d) => {
      const s = d.allScores[sport as SportType]?.score ?? 0;
      return s >= 40;
    });
    if (on.length === 0) return null;
    const avgWave = on.reduce((sum, d) => sum + (d.conditions.waveHeight ?? 0), 0) / on.length;
    const avgWind = on.reduce((sum, d) => sum + (d.conditions.windSpeed ?? 0), 0) / on.length;
    const avgTemp = on.reduce((sum, d) => sum + (d.conditions.waterTemp ?? 0), 0) / on.length;
    return { avgWave, avgWind, avgTemp, onCount: on.length };
  }, [spotsData, sport]);

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
          ? 'hero-ocean-surface relative w-full h-[clamp(420px,65vh,720px)] rounded-b-3xl overflow-hidden border-b border-divider touch-pan-y'
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
            ? 'hero-ocean-overlay absolute inset-x-0 top-0 z-10 flex flex-col pointer-events-none max-h-[min(52%,420px)] sm:max-h-none sm:inset-0'
            : 'absolute inset-x-0 top-0 z-10 flex flex-col pointer-events-none pb-2'
        }
      >
        {isFeatured && (
          <>
            <div
              className="absolute inset-0 bg-gradient-to-r from-bg-base/96 via-bg-base/72 to-bg-base/25 sm:via-bg-base/35 sm:to-transparent pointer-events-none"
              aria-hidden
            />
            <div
              className="absolute inset-0 bg-gradient-to-b from-bg-base/94 via-bg-base/55 to-transparent sm:via-bg-base/35 pointer-events-none"
              aria-hidden
            />
            <div
              className="absolute inset-0 hero-map-ocean-corners pointer-events-none"
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
            {isFeatured && bestWindow && topSpot && (
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
              className={
                isFeatured
                  ? 'font-display text-display-xl font-bold text-fg tracking-tight leading-[1.02] drop-shadow-sm stagger-fade-in motion-reduce:animate-none'
                  : 'font-display text-h2 font-semibold text-fg tracking-tight'
              }
              style={isFeatured ? ({ '--stagger-delay': 80 } as React.CSSProperties) : undefined}
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

            <p
              className="text-body-sm text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1 stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': 240 } as React.CSSProperties}
            >
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

            <div
              className="flex flex-col sm:flex-row flex-wrap gap-2 pt-0.5 stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': 320 } as React.CSSProperties}
            >
              <Button
                href={`/${locale}/mapa/${buildGridFiltersSearch(sport, DEFAULT_REGION, regions)}`}
                size={isFeatured ? 'lg' : 'md'}
                locale={isPt ? 'pt' : 'en'}
                className="shadow-card shrink-0"
                rightIcon={<Maximize2 className="w-4 h-4" aria-hidden />}
              >
                {isPt ? 'Explorar mapa' : 'Explore map'}
              </Button>
              {isFeatured && (
                <div className="min-w-0 flex-1 sm:max-w-xs">
                  <HomepageSearch locale={locale} variant="hero" />
                </div>
              )}
            </div>
          </div>

          {isFeatured && aggregates && (
            <div
              className="pointer-events-auto self-start sm:self-end mt-auto pb-1 sm:pb-2 max-w-full overflow-x-auto no-scrollbar stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': 400 } as React.CSSProperties}
            >
              <HeroTicker
                locale={locale}
                bestWindowLabel={
                  bestWindow && topSpot
                    ? (isPt
                        ? `Janela ${formatBestWindowHours(bestWindow)} · ${SPORT_LABELS[sport as SportType]?.[isPt ? 'pt' : 'en'] ?? ''} · ${topSpot.spot.name}`
                        : `Window ${formatBestWindowHours(bestWindow)} · ${SPORT_LABELS[sport as SportType]?.[isPt ? 'pt' : 'en'] ?? ''} · ${topSpot.spot.nameEn ?? topSpot.spot.name}`)
                    : undefined
                }
                stats={[
                  {
                    label: isPt ? 'Onda' : 'Wave',
                    value: `${aggregates.avgWave.toFixed(1)}m`,
                    icon: <Waves className="w-3 h-3" />,
                  },
                  {
                    label: isPt ? 'Vento' : 'Wind',
                    value: `${Math.round(aggregates.avgWind)}kt`,
                    icon: <Wind className="w-3 h-3" />,
                  },
                  {
                    label: isPt ? 'Água' : 'Water',
                    value: `${aggregates.avgTemp.toFixed(1)}°C`,
                    icon: <Droplets className="w-3 h-3" />,
                  },
                  ...(hoursAgo !== null
                    ? [
                        {
                          label: isPt ? 'Atualizado' : 'Updated',
                          value: hoursAgo === 0 ? (isPt ? 'agora' : 'now') : `${hoursAgo}h`,
                          icon: <Clock className="w-3 h-3" />,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
