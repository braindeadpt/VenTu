'use client';

import { useEffect, useRef, useState } from 'react';

/** Duração máxima do count-up do score (spec: ≤320 ms, ease ≈ cubic-bezier(.16,1,.3,1)). */
const DURATION_MS = 320;

/**
 * Count-up do score do veredicto via requestAnimationFrame. Com reduced
 * motion (ou quando o valor não muda) salta directo para o alvo — nunca
 * mostra estados intermédios. Re-anima a partir do valor actualmente
 * mostrado quando o alvo muda a meio de uma animação.
 */
export function useCountUp(target: number, reducedMotion: boolean): number {
  const [display, setDisplay] = useState(target);
  // Valor actualmente mostrado — origem da próxima animação.
  const displayRef = useRef(target);

  useEffect(() => {
    if (reducedMotion || displayRef.current === target) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const from = displayRef.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / DURATION_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (target - from) * eased);
      displayRef.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reducedMotion]);

  return display;
}
