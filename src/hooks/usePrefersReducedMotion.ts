'use client';

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Client `prefers-reduced-motion`. Starts unknown (`null`) so SSR and the
 * first client paint both treat motion as reduced — autoplay stays off until
 * `matchMedia` resolves. Returning `false` before that let the 48 h track
 * tick once in CI (`reducedMotion: 'reduce'`).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return reduced !== false;
}
