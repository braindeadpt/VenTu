'use client';

import { useEffect, useRef, useState } from 'react';

/** Duração máxima do count-up do score (spec §7: ≤320 ms, out-expo). */
const DURATION_MS = 320;

/**
 * cubic-bezier(0.16, 1, 0.3, 1) — a curva «out-expo» da página (a mesma do
 * cursor da régua, das barras e da inversão dos cartões). Avaliação por
 * Newton–Raphson com fallback de bissecção (padrão bezier-easing).
 */
const [X1, Y1, X2, Y2] = [0.16, 1, 0.3, 1];
const sample = (t: number, a: number, b: number) =>
  ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
const sampleDeriv = (t: number, a: number, b: number) =>
  (3 * (1 - 3 * b + 3 * a) * t + 2 * (3 * b - 6 * a)) * t + 3 * a;
function pageEase(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  // Resolve x(t) = p para t (a curva é monótona em x no intervalo).
  let t = p;
  for (let i = 0; i < 8; i++) {
    const err = sample(t, X1, X2) - p;
    if (Math.abs(err) < 1e-6) break;
    const d = sampleDeriv(t, X1, X2);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
    t = Math.min(1, Math.max(0, t));
  }
  if (Math.abs(sample(t, X1, X2) - p) > 1e-4) {
    let lo = 0;
    let hi = 1;
    t = p;
    for (let i = 0; i < 24 && hi - lo > 1e-6; i++) {
      const x = sample(t, X1, X2);
      if (x < p) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
  }
  return sample(t, Y1, Y2);
}

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
      const eased = pageEase(p);
      const v = Math.round(from + (target - from) * eased);
      displayRef.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reducedMotion]);

  // Reduced-motion: o alvo é devolvido já neste render — o state `display`
  // só converge no effect seguinte e um leitor entre o render e o effect
  // veria o valor antigo (o texto tem de bater com aria-valuenow já).
  return reducedMotion ? target : display;
}
