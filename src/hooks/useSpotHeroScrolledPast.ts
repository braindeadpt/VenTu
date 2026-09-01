'use client';

import { useEffect, useState } from 'react';

export interface UseSpotHeroScrolledPastOptions {
  /** Top offset (px) the hero must clear before it counts as left the viewport. */
  headerOffsetPx?: number;
  /**
   * Only observe once the hero is actually mounted. The parent can pass
   * `!loading` — while loading, the hero isn't rendered yet and `heroRef.current`
   * is null, so an effect that runs once at mount would never attach the
   * observer (the ref object itself never changes identity).
   */
  enabled?: boolean;
}

/**
 * Whether the spot hero has scrolled past the top of the viewport (clearing
 * the header). Shared by the `SpotStickyBar` (show/hide) and the standalone
 * sport-tabs line (hide when the bar takes over) so the two never diverge.
 *
 * Mirrors the previous IntersectionObserver logic that lived inside the
 * sticky bar: the hero is "gone" when its top is above the viewport minus the
 * header offset (rootMargin -64px).
 */
export function useSpotHeroScrolledPast(
  heroRef: React.RefObject<HTMLElement | null>,
  options: UseSpotHeroScrolledPastOptions = {},
): boolean {
  const headerOffsetPx = options.headerOffsetPx ?? 64;
  const enabled = options.enabled ?? true;
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    if (!enabled || !heroRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0, rootMargin: `-${headerOffsetPx}px 0px 0px 0px` },
    );
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, [heroRef, headerOffsetPx, enabled]);

  return scrolledPast;
}