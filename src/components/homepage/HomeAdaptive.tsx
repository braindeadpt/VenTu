'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useHasFavorites } from '@/hooks/useHasFavorites';
import type { HomepageSpotData } from '@/lib/homepageSport';
import { useHomeSport } from '@/hooks/useUrlGridSport';
import { MACRO_REGIONS } from '@/lib/regions';
import HeroTicker from '@/components/homepage/HeroTicker';
import YourDaySection from '@/components/homepage/YourDaySection';
import HomepageRankedSection from '@/components/homepage/HomepageRankedSection';
import BuoyLayerNotice from '@/components/spots/BuoyLayerNotice';
import { DawnPatrolTopSlot } from '@/components/homepage/HomeDawnPatrolSlots';
import WaveDivider from '@/components/ui/WaveDivider';

interface HomeAdaptiveProps {
  locale: string;
  spotsData: HomepageSpotData[];
  maxTs: number | null;
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
  const { sport: activeSport } = useHomeSport(regions, 'surf');

  return (
    <div className="v6h-ext" data-testid="home-unificada-ext">
      {/* #460: «O teu dia» logo abaixo dos destaques v6 para utilizadores com favoritos */}
      {isReturning && (
        <YourDaySection
          locale={locale}
          spotsData={spotsData}
          favoriteIds={favorites.length > 0 ? favorites : []}
          activeSport={activeSport}
          nowMs={tickerNowMs}
        />
      )}

      {/* #460: Dawn Patrol visível para TODOS os utilizadores (com e sem favoritos) quando fresco */}
      <DawnPatrolTopSlot locale={locale} />

      <WaveDivider />

      <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-4" data-testid="home-ticker">
        <div className="max-w-7xl mx-auto space-y-3">
          <HeroTicker
            locale={locale}
            updatedAtTs={maxTs}
            buoyLayer={buoyLayer}
            coastalWarningsLayer={coastalWarningsLayer}
            nowMs={tickerNowMs}
          />
          <div data-testid="home-buoy-notice">
            <BuoyLayerNotice locale={locale} scope="home" />
          </div>
        </div>
      </div>

      <HomepageRankedSection
        spotsData={spotsData}
        sport={activeSport}
        locale={locale}
        bakedAtMs={bakedAtMs}
      />
    </div>
  );
}
