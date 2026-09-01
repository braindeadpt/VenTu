'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useHasFavorites } from '@/hooks/useHasFavorites';
import type { HomepageSpotData } from '@/lib/homepageSport';
import type { GridSportFilter } from '@/lib/sportRatings';
import { useUrlGridSport } from '@/hooks/useUrlGridSport';
import { DEFAULT_REGION } from '@/lib/gridFilters';
import { MACRO_REGIONS } from '@/lib/regions';
import HomepageMapHero from '@/components/homepage/HomepageMapHero';
import YourDaySection from '@/components/homepage/YourDaySection';
import HomepageTopNow from '@/components/homepage/HomepageTopNow';
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
}

export default function HomeAdaptive({
  locale,
  spotsData,
  maxTs,
  spotCount,
  sportsCount,
  buoyLayer,
  coastalWarningsLayer,
}: HomeAdaptiveProps) {
  const hasFavorites = useHasFavorites();
  const { favorites } = useAuth();
  const isReturning = hasFavorites === true;
  const regions = useMemo(() => [...MACRO_REGIONS], []);
  const activeSport = useUrlGridSport(regions, 'surf');

  return (
    <>
      {isReturning && (
        <>
          <YourDaySection
            locale={locale}
            spotsData={spotsData}
            favoriteIds={favorites.length > 0 ? favorites : []}
            activeSport={activeSport}
          />
          <WaveDivider />
        </>
      )}

      <HomepageMapHero
        locale={locale}
        spotsData={spotsData}
        maxTs={maxTs}
        variant={isReturning ? 'compact' : 'featured'}
        buoyLayer={buoyLayer}
        coastalWarningsLayer={coastalWarningsLayer}
      />

      <WaveDivider />

      <HomepageTopNow
        spotsData={spotsData}
        locale={locale}
        maxCards={isReturning ? 4 : undefined}
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
