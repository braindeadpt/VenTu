'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useHasFavorites } from '@/hooks/useHasFavorites';
import { isConditionDriven, type HomepageSpotData } from '@/lib/homepageSport';
import type { GridSportFilter } from '@/lib/sportRatings';
import { useHomeSport } from '@/hooks/useUrlGridSport';
import { DEFAULT_REGION } from '@/lib/gridFilters';
import { MACRO_REGIONS } from '@/lib/regions';
import HeroTicker from '@/components/homepage/HeroTicker';
import YourDaySection from '@/components/homepage/YourDaySection';
import HomepageTopNow from '@/components/homepage/HomepageTopNow';
import HomepageRankedSection from '@/components/homepage/HomepageRankedSection';
import HomepageFooterSection from '@/components/homepage/HomepageFooterSection';
import { DawnPatrolTopSlot } from '@/components/homepage/HomeDawnPatrolSlots';
import WaveDivider from '@/components/ui/WaveDivider';

interface HomeAdaptiveProps {
  locale: string;
  spotsData: HomepageSpotData[];
  maxTs: number | null;
  spotCount: number;
  sportsCount: number;
  /** IH buoy layer state from pipeline-meta.json (ticker diagnostics). */
  buoyLayer?: import('@/lib/pipelineMeta').BuoyLayerMeta | null;
  /** Coastal warnings (IH) layer state from pipeline-meta.json (ticker). */
  coastalWarningsLayer?: import('@/lib/pipelineMeta').CoastalWarningsLayerMeta | null;
  /** Build-time clock (SSG) for hydration parity of freshness gates (#418 guard). */
  bakedAtMs: number;
}

export default function HomeAdaptive({
  locale,
  spotsData,
  maxTs,
  spotCount,
  sportsCount,
  buoyLayer,
  coastalWarningsLayer,
  bakedAtMs,
}: HomeAdaptiveProps) {
  const hasFavorites = useHasFavorites();
  const { favorites } = useAuth();
  const isReturning = hasFavorites === true;
  const regions = useMemo(() => [...MACRO_REGIONS], []);
  // Relógio do ticker: o do build no primeiro render (paridade com o HTML SSG — React #418)
  // e o real depois de montar (o mesmo padrão do HomepageRankedSection).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const tickerNowMs = mounted ? Date.now() : bakedAtMs;
  const { sport: activeSport, explicit: sportChosen } = useHomeSport(regions, 'surf');
  // «A bombar agora» só fica preso a um desporto quando o utilizador o
  // escolheu; por defeito (ou com «Todos») mostra o que está mesmo a dar.
  const topNowSport: GridSportFilter = isConditionDriven(activeSport, sportChosen)
    ? 'all'
    : activeSport;

  return (
    <>
      {isReturning && (
        <>
          <YourDaySection
            locale={locale}
            spotsData={spotsData}
            favoriteIds={favorites.length > 0 ? favorites : []}
            activeSport={activeSport}
            nowMs={tickerNowMs}
          />
          <WaveDivider />
        </>
      )}

      {/* #183: o hero e o mapa da home são a v6 «Atlântico» (HomeV6, por cima). O ticker de
          estado dos dados (frescura, boias, avisos costeiros) fica aqui, à cabeça das secções
          que se mantêm até decisão do Pedro («Em aberto» da issue). */}
      <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-2" data-testid="home-ticker">
        <div className="max-w-7xl mx-auto">
          <HeroTicker
            locale={locale}
            updatedAtTs={maxTs}
            buoyLayer={buoyLayer}
            coastalWarningsLayer={coastalWarningsLayer}
            nowMs={tickerNowMs}
          />
        </div>
      </div>

      <WaveDivider />

      <HomepageTopNow
        spotsData={spotsData}
        sport={topNowSport}
        locale={locale}
        maxCards={isReturning ? 4 : undefined}
        bakedAtMs={bakedAtMs}
      />

      <HomepageRankedSection
        spotsData={spotsData}
        sport={activeSport}
        locale={locale}
        bakedAtMs={bakedAtMs}
      />

      {/* Dawn Patrol owns its own divider — avoids empty double-waves outside morning hours */}
      {!isReturning && <DawnPatrolTopSlot locale={locale} />}

      <WaveDivider />

      <HomepageFooterSection
        locale={locale}
        spotCount={spotCount}
        sportsCount={sportsCount}
      />
    </>
  );
}
