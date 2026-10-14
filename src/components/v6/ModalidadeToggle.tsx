'use client';

/**
 * Selector Kite · Surf (#184; partilhado com a home #183).
 * `role="group"` + `aria-pressed`; cada botão ≥ 44 × 76 px; activo = fill
 * `sol` com texto `ink`. A lista vem de `MODALIDADES_VISIVEIS`.
 */
import type { CSSProperties } from 'react';
import { MODALIDADES_VISIVEIS, type Modalidade } from '@/lib/modalidades';

const ICONES: Record<Modalidade, JSX.Element> = {
  kite: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 9c3-5 15-5 18 0" />
      <path d="M4 9l8 12M20 9l-8 12" />
    </svg>
  ),
  surf: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M2 16c3-1 4-6 9-7 4-1 6 2 4 4-2 1-4-1-3-2" />
      <path d="M2 20c3 0 4-1.5 6.6-1.5S13 20 16 20s4-1.5 6-1.5" />
    </svg>
  ),
};

export interface ModalidadeToggleProps {
  valor: Modalidade;
  onChange: (d: Modalidade) => void;
  rotulos: Record<string, string>;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}

export default function ModalidadeToggle({ valor, onChange, rotulos, ariaLabel, className, style }: ModalidadeToggleProps) {
  return (
    <div className={`modo${className ? ' ' + className : ''}`} role="group" aria-label={ariaLabel} data-d={valor} style={style} data-testid="modalidade-toggle">
      <span className="pista" aria-hidden="true" />
      {MODALIDADES_VISIVEIS.map((d) => (
        <button
          key={d}
          type="button"
          data-d={d}
          aria-pressed={valor === d}
          onClick={() => {
            if (d !== valor) onChange(d);
          }}
        >
          {ICONES[d]}
          {rotulos[d] ?? d}
        </button>
      ))}
    </div>
  );
}
