'use client';

import { useContext, useEffect, type RefObject } from 'react';
import {
  SpotTimelineDataContext,
  SpotTimelineIndexContext,
  type SpotTimelineDataValue,
  type SpotTimelineIndexValue,
} from './SpotTimelineProvider';

/** Dados estáticos do eixo (horas, scores, nowIndex) — não re-renderiza no scrub. */
export function useSpotTimelineData(): SpotTimelineDataValue {
  const ctx = useContext(SpotTimelineDataContext);
  if (!ctx) throw new Error('useSpotTimelineData requer SpotTimelineProvider');
  return ctx;
}

/** Índice e controlos do eixo — re-renderiza a cada mudança de hora. */
export function useSpotTimelineIndex(): SpotTimelineIndexValue {
  const ctx = useContext(SpotTimelineIndexContext);
  if (!ctx) throw new Error('useSpotTimelineIndex requer SpotTimelineProvider');
  return ctx;
}

/**
 * Vista combinada — { hours, index, setIndex, nowIndex, isNow, goNow,
 * step(delta), selectedHour, selectedScore } + autoplay. Usar os hooks
 * separados quando só uma das metades interessa.
 */
export function useSpotTimeline() {
  return { ...useSpotTimelineData(), ...useSpotTimelineIndex() };
}

/**
 * Reporta «fora do ecrã» para o autoplay: IntersectionObserver no elemento
 * (a régua) + document.visibilityState — o mesmo par de fontes e a mesma
 * semântica de último-escritor do useMapTimeTrack. Montar no root da régua.
 */
export function useSpotTimelineVisibility(ref: RefObject<Element | null>) {
  const { setOffScreen } = useSpotTimelineIndex();

  useEffect(() => {
    const onVisibility = () => {
      setOffScreen(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);

    const el = ref.current;
    let observer: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry) setOffScreen(!entry.isIntersecting);
      });
      observer.observe(el);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      setOffScreen(false);
    };
  }, [ref, setOffScreen]);
}
