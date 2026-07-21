'use client';

import { useEffect, useState } from 'react';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { refreshGridSpotScores } from '@/lib/refreshGridSpotScores';
import { loadConditionsJson } from '@/lib/spotDataCache';

const REFRESH_MS = 15 * 60 * 1000;

/**
 * Hydrates grid/map spot rows with fresh conditions.json.
 * Re-fetches on mount, when the tab becomes visible, and every 15 min.
 */
export function useLiveGridSpotData<T extends GridSpotData>(initial: T[]): T[] {
  const [data, setData] = useState<T[]>(initial);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      loadConditionsJson({ force: true })
        .then((json) => {
          if (cancelled) return;
          setData((prev) => refreshGridSpotScores(prev, json));
        })
        .catch(() => {
          /* keep baked scores */
        });
    };

    refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return data;
}
