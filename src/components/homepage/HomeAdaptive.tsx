'use client';

import { useEffect, useState } from 'react';
import {
  FAVORITES_CHANGED_EVENT,
  readFavoritesFromStorage,
} from '@/lib/favoritesStorage';
import { useHasFavorites } from '@/hooks/useHasFavorites';
import type { HomepageSpotData } from '@/lib/homepageSport';
import HomepageMapHero from '@/components/homepage/HomepageMapHero';
import HomepageFavoritesNow from '@/components/homepage/HomepageFavoritesNow';
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
}

export default function HomeAdaptive({
  locale,
  spotsData,
  maxTs,
  spotCount,
  sportsCount,
}: HomeAdaptiveProps) {
  const hasFavorites = useHasFavorites();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    if (hasFavorites === null) return;
    const sync = () => setFavoriteIds(readFavoritesFromStorage());
    sync();
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
  }, [hasFavorites]);

  const isReturning = hasFavorites === true;

  return (
    <>
      {isReturning && favoriteIds.length > 0 && (
        <>
          <HomepageFavoritesNow
            locale={locale}
            spotsData={spotsData}
            favoriteIds={favoriteIds}
          />
          <WaveDivider />
        </>
      )}

      <HomepageMapHero
        locale={locale}
        spotsData={spotsData}
        maxTs={maxTs}
        variant={isReturning ? 'compact' : 'featured'}
      />

      <WaveDivider />

      <HomepageTopNow
        spotsData={spotsData}
        locale={locale}
        maxCards={isReturning ? 4 : undefined}
      />

      {!isReturning && (
        <>
          <WaveDivider flip />
          <DawnPatrolTopSlot locale={locale} />
        </>
      )}

      <WaveDivider />

      <HomepageFooterSection
        locale={locale}
        spotCount={spotCount}
        sportsCount={sportsCount}
      />
    </>
  );
}
