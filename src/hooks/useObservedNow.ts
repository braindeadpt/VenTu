'use client';

import { useEffect, useState } from 'react';
import type { ObservedConditions } from '@/lib/observations';
import { isObservedFresh } from '@/lib/observations';
import {
  buildObsWorkerUrl,
  normalizeWorkerObserved,
  parseWorkerObservedResponse,
} from '@/lib/observationsWorker';

export type UseObservedNowState = {
  observed: ObservedConditions | null;
  loading: boolean;
  error: string | null;
};

export function useObservedNow(lat: number, lon: number): UseObservedNowState {
  const [observed, setObserved] = useState<ObservedConditions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerUrl = buildObsWorkerUrl(lat, lon);

  useEffect(() => {
    if (!workerUrl) {
      setObserved(null);
      setLoading(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(workerUrl, {
          signal: ac.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`obs worker ${res.status}`);
        }
        const json: unknown = await res.json();
        const raw = parseWorkerObservedResponse(json);
        if (!raw || !isObservedFresh(raw.observedAt)) {
          setObserved(null);
          return;
        }
        setObserved(normalizeWorkerObserved(raw));
      } catch (e: unknown) {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setObserved(null);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [workerUrl]);

  if (!workerUrl) {
    return { observed: null, loading: false, error: null };
  }

  return { observed, loading, error };
}
