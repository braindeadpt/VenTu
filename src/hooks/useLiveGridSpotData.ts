'use client';

import { useEffect, useState } from 'react';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { refreshGridSpotScores } from '@/lib/refreshGridSpotScores';
import { loadConditionsJson } from '@/lib/spotDataCache';

/**
 * Hydrates grid/map spot rows with fresh conditions.json on mount.
 * Baked SSG scores may lag behind the latest pipeline run.
 */
export function useLiveGridSpotData<T extends GridSpotData>(initial: T[]): T[] {
  const [data, setData] = useState<T[]>(initial);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;

    loadConditionsJson({ force: true })
      .then((json) => {
        if (cancelled) return;
        setData((prev) => refreshGridSpotScores(prev, json));
      })
      .catch(() => {
        /* keep baked scores */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
