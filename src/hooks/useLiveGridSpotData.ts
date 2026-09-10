'use client';

import { useEffect, useState } from 'react';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { refreshGridSpotScores } from '@/lib/refreshGridSpotScores';
import { loadConditionsJson } from '@/lib/spotDataCache';
import { loadWaveBiasRegions } from '@/lib/waveBias';

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
    const deferred = deferRefreshMs > 0;

    const refresh = () => {
      // wave-bias.json (client, session cache) alimenta o fallback do viés
      // regional no refresh do mapa/grid — o mesmo gate da página de spot,
      // nunca bloqueia o carregamento (404/corrupt → null).
      Promise.all([loadConditionsJson({ force: true }), loadWaveBiasRegions()])
        .then(([json, waveBiasFile]) => {
          if (cancelled) return;
          setData((prev) => refreshGridSpotScores(prev, json, waveBiasFile));
        })
        .catch(() => {
          /* keep baked scores */
        })
        .finally(() => {
          // Deterministic e2e seam: consumers with a deferred refresh (the
          // homepage hero, deferRefreshMs=4000, so the map can paint first)
          // render BAKED data until this resolves. The visual-regression gate
          // captures a few seconds in, so without a completion signal it could
          // screenshot the bake (build data) instead of the committed fixture —
          // the home hero's best-window score then drifted with every data
          // commit. Stamping completion lets the spec wait for the fixture-
          // driven render. Inert unless something reads the attribute.
          if (deferred && !cancelled && typeof document !== 'undefined') {
            document.documentElement.dataset.gridLiveDeferred = 'done';
          }
        });
    };

    const startPolling = () => {
      intervalId = window.setInterval(refresh, REFRESH_MS);
    };

    if (deferRefreshMs > 0) {
      // Announce the pending deferred refresh so e2e can wait for it only when
      // it actually exists (never on routes without a deferred consumer).
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.gridLiveDeferred = 'pending';
      }
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
