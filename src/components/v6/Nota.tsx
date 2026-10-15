/**
 * Nota /10 no fill da banda (#184; partilhado com a #183). Inteira 0–10;
 * nunca «/100». De noite mostra a lua no fill `noite`.
 * `role="meter"` com o valor e a banda por extenso para leitores de ecrã.
 */
import type { CSSProperties } from 'react';
import { bandaDe } from '@/lib/modalidades';
import { bandaVars } from '@/lib/v6Tokens';

export interface NotaProps {
  n: number | null;
  /** Texto acessível («Nota 9 em 10, Muito bom»). */
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}

export default function Nota({ n, ariaLabel, className, style }: NotaProps) {
  const b = bandaDe(n);
  const vars = { ...bandaVars(b), ...style } as CSSProperties;
  if (n == null)
    return (
      <span className={`nota${className ? ' ' + className : ''}`} style={vars} role="img" aria-label={ariaLabel} data-banda={b}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor" />
        </svg>
      </span>
    );
  const v = Math.max(0, Math.min(10, Math.round(n)));
  return (
    <span
      className={`nota${className ? ' ' + className : ''}`}
      style={vars}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={v}
      aria-label={ariaLabel}
      data-banda={b}
      data-nota={v}
    >
      {v}
      <small aria-hidden="true">/10</small>
    </span>
  );
}
