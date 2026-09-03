'use client';

import { useEffect, useState, type RefObject } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { mapTimeTrackPaused } from './mapTimeTrackPaused';

interface UseMapTimeTrackOptions {
  length: number;
  index: number;
  onIndexChange: (index: number) => void;
  mapBusyCount?: number;
  userPaused?: boolean;
  /** Scrubbing from a track rendered outside this hook's owner (HUD). */
  externalScrubbing?: boolean;
  tickMs?: number;
  /** Visibility target — badge / carousel root. Off-screen pauses ticks. */
  observeRef: RefObject<Element | null>;
}

/**
 * Shared map time-track animation. Radar is the first mode; session B can
 * drive scores from the same pause + tick rules without owning autoplay.
 */
export function useMapTimeTrack({
  length,
  index,
  onIndexChange,
  mapBusyCount = 0,
  userPaused = false,
  externalScrubbing = false,
  tickMs = 1000,
  observeRef,
}: UseMapTimeTrackOptions) {
  const [scrubbing, setScrubbing] = useState(false);
  const [offScreen, setOffScreen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const paused = mapTimeTrackPaused({
    scrubbing: scrubbing || externalScrubbing,
    mapBusyCount,
    offScreen,
    userPaused,
    reducedMotion,
  });

  useEffect(() => {
    const onVisibility = () => {
      setOffScreen(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const el = observeRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setOffScreen(!entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [observeRef]);

  useEffect(() => {
    if (paused || length <= 1) return;
    const intervalId = window.setInterval(() => {
      onIndexChange((index + 1) % length);
    }, tickMs);
    return () => window.clearInterval(intervalId);
  }, [paused, length, index, onIndexChange, tickMs]);

  return { paused, reducedMotion, setScrubbing };
}
