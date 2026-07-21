'use client';

import { useEffect, useState } from 'react';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { refreshGridSpotScores } from '@/lib/refreshGridSpotScores';
import { loadConditionsJson } from '@/lib/spotDataCache';

const REFRESH_MS = 15 * 60 * 1000;

export interface UseLiveGridSpotDataOptions {
  /** Delay first refresh so map can paint (e.g. fullscreen /mapa on mobile). */
  deferRefreshMs?: number;
}

/**
 * Hydrates grid/map spot rows with fresh conditions.json.
 * Re-fetches on mount, when the tab becomes visible, and every 15 min.
 */
export function useLiveGridSpotData<T extends GridSpotData>(
  initial: T[],
  options?: UseLiveGridSpotDataOptions,
): T[] {
  const deferRefreshMs = options?.deferRefreshMs ?? 0;
  const [data, setData] = useState<T[]>(initial);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;
    let deferId: number | undefined;

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

    const startPolling = () => {
      intervalId = window.setInterval(refresh, REFRESH_MS);
    };

    if (deferRefreshMs > 0) {
      deferId = window.setTimeout(() => {
        if (cancelled) return;
        refresh();
        startPolling();
      }, deferRefreshMs);
    } else {
      refresh();
      startPolling();
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (deferId !== undefined) window.clearTimeout(deferId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [deferRefreshMs]);

  return data;
}
