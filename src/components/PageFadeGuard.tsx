'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const isMapRoute = pathname.match(/^\/[a-z]{2}\/mapa\/?.*/) != null;

  // Leaving /mapa/ (or toggling fullscreen) can leave body locks; reset on
  // route change — but never on /mapa itself: the fullscreen map applies its
  // own body lock on mount, and this effect runs AFTER that mount, so an
  // unconditional unlock would erase it (the /mapa footer would scroll
  // back in under the fixed-height map).
  useEffect(() => {
    if (isMapRoute) return;
    unlockPageInteraction();
  }, [pathname]);

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isMapRoute is a derived constant, stable for the mount that created this main.

    // On /mapa we must NOT clear the body scroll-lock (the map owns it), but
    // we still guarantee the fade-in content becomes visible — so only the
    // animation is reset there, not unlockPageInteraction().
    const unlock = () => {
      if (isMapRoute) {
        main.style.animation = 'none';
        main.style.opacity = '1';
        main.style.pointerEvents = '';
        return;
      }
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
