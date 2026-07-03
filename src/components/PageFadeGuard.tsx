'use client';

import { useEffect } from 'react';
import { unlockPageInteraction } from '@/lib/mapFullscreen';

/**
 * Safety net for the `page-fade-in` entrance animation on `#main-content`
 * (globals.css). On back/forward navigation the CSS animation timeline can
 * freeze at 0% and leave the whole page stuck at opacity 0 — the "blank site
 * after leaving the map" bug. Guarantee the content becomes visible by
 * clearing the animation once it finishes, on bfcache restores, and after a
 * hard timeout fallback.
 */
export default function PageFadeGuard() {
  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;

    const unlock = () => {
      unlockPageInteraction();
    };

    const onAnimationEnd = (e: AnimationEvent) => {
      if (e.target === main && e.animationName === 'page-fade-in') unlock();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) unlock();
    };

    main.addEventListener('animationend', onAnimationEnd);
    window.addEventListener('pageshow', onPageShow);
    const fallback = window.setTimeout(unlock, 700);

    return () => {
      main.removeEventListener('animationend', onAnimationEnd);
      window.removeEventListener('pageshow', onPageShow);
      window.clearTimeout(fallback);
    };
  }, []);

  return null;
}
