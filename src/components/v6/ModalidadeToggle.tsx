'use client';

/**
 * Selector Kite · Surf (#184; partilhado com a home #183).
 * `role="group"` + `aria-pressed`; cada botão ≥ 44 × 76 px; activo = fill
 * `sol` com texto `ink`. A lista vem de `MODALIDADES_VISIVEIS`.
 */
import type { CSSProperties } from 'react';
import { MODALIDADES_VISIVEIS, type Modalidade } from '@/lib/modalidades';
import type { SpotModalidadeAtiva } from '@/lib/spotV6Modalidade';

const ICONES: Partial<Record<SpotModalidadeAtiva, JSX.Element>> = {
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

export interface ModalidadeToggleProps<T extends string = Modalidade> {
  valor: T;
  onChange: (d: T) => void;
  rotulos: Record<string, string>;
  ariaLabel: string;
  /** Lista de opções do toggle (omissão: `MODALIDADES_VISIVEIS` — Kite · Surf). */
  opcoes?: readonly T[];
  className?: string;
  style?: CSSProperties;
}

export default function ModalidadeToggle<T extends string = Modalidade>({
  valor,
  onChange,
  rotulos,
  ariaLabel,
  opcoes,
  className,
  style,
}: ModalidadeToggleProps<T>) {
  const lista = (opcoes ?? (MODALIDADES_VISIVEIS as unknown as readonly T[]));
  const idx = lista.indexOf(valor);
  const duasOpcoes = lista.length === 2;
  return (
    <div
      className={`modo${duasOpcoes ? '' : ' modo-flex'}${className ? ' ' + className : ''}`}
      role="group"
      aria-label={ariaLabel}
      data-d={valor}
      data-idx={idx >= 0 ? String(idx) : undefined}
      style={style}
      data-testid="modalidade-toggle"
    >
      {duasOpcoes && idx >= 0 ? <span className="pista" aria-hidden="true" /> : null}
      {lista.map((d) => (
        <button
          key={d}
          type="button"
          data-d={d}
          aria-pressed={valor === d}
          onClick={() => {
            if (d !== valor) onChange(d);
          }}
        >
          {ICONES[d as SpotModalidadeAtiva] ?? null}
          {rotulos[d] ?? d}
        </button>
      ))}
    </div>
  );
}
