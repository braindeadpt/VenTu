'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Pausa as animações contínuas dos instrumentos quando a secção sai do
 * ecrã ou o documento fica escondido (mesma semântica de fontes que
 * `useSpotTimelineVisibility` — IntersectionObserver + visibilitychange).
 * O prefers-reduced-motion é tratado em CSS (animation: none no media
 * query), não aqui.
 */
export function useInstrumentPaused(ref: RefObject<Element | null>): boolean {
  const [offScreen, setOffScreen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);

    const el = ref.current;
    let observer: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        // A última entrada é o estado actual: se houver scroll entre o observe()
        // e a 1.ª entrega, chegam duas do mesmo alvo e a [0] já é velha.
        const entry = entries[entries.length - 1];
        if (entry) setOffScreen(!entry.isIntersecting);
      });
      observer.observe(el);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, [ref]);

  return offScreen || hidden;
}
