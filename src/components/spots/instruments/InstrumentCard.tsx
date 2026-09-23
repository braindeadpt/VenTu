'use client';

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Id do painel de detalhe único por baixo dos três cartões. */
export const INSTRUMENT_DETAIL_ID = 'instrumentos-detalhe';

export type InstrumentId = 'wind' | 'wave' | 'tide';

export interface InstrumentCardProps {
  instrument: InstrumentId;
  label: string;
  chip?: ReactNode;
  /** true quando este cartão tem o painel de detalhe aberto. */
  open: boolean;
  onToggle: (instrument: InstrumentId) => void;
  /** Figura (rosa ou curva de maré). */
  fig: ReactNode;
  /** Leitura — big + sub + foot. */
  children: ReactNode;
  /**
   * Marca de coerência discreta: texto + ícone + ligação a #como-sabemos.
   * Renderizada fora do botão (HTML válido — nunca <a> dentro de <button>).
   */
  coherence?: { text: string; linkLabel: string } | null;
}

/* Marcas de corte nos cantos — a cor (--vi-s2) troca com o material. */
const CM = 'pointer-events-none absolute h-[9px] w-[9px] border-[color:var(--vi-s2)] transition-colors duration-200 motion-reduce:transition-none';

export default function InstrumentCard({
  instrument,
  label,
  chip,
  open,
  onToggle,
  fig,
  children,
  coherence,
}: InstrumentCardProps) {
  return (
    <div
      className="ventu-inst-card relative rounded-lg border border-divider bg-surface-1/[0.05] text-fg"
      data-instrument={instrument}
      data-open={open || undefined}
    >
      <span className={`${CM} left-[9px] top-[9px] border-l border-t`} aria-hidden="true" />
      <span className={`${CM} right-[9px] top-[9px] border-r border-t`} aria-hidden="true" />
      <span className={`${CM} bottom-[9px] left-[9px] border-b border-l`} aria-hidden="true" />
      <span
        className={`${CM} bottom-[9px] right-[9px] border-b border-r`}
        aria-hidden="true"
      />
      <button
        type="button"
        className="ventu-inst-hit grid w-full min-w-0 grid-cols-[128px_minmax(0,1fr)] items-center gap-x-[18px] gap-y-[10px] rounded-[inherit] p-5 text-left min-h-11 min-[760px]:grid-cols-1 min-[760px]:items-stretch min-[760px]:gap-y-[14px] min-[760px]:px-6 min-[760px]:pb-5 min-[760px]:pt-6 focus-visible:outline-none"
        aria-expanded={open}
        aria-controls={INSTRUMENT_DETAIL_ID}
        onClick={() => onToggle(instrument)}
      >
        <span className="col-span-full flex items-center justify-between gap-2.5">
          <span className="text-[13px] font-medium tracking-[0.02em]">{label}</span>
          {chip != null && (
            <span className="whitespace-nowrap rounded-full border border-[color:var(--vi-s2)] px-[9px] py-[5px] text-[11px] leading-none text-[color:var(--vi-m)] transition-colors duration-200 motion-reduce:transition-none">
              {chip}
            </span>
          )}
        </span>
        {fig}
        <span className="grid min-w-0 gap-[3px]">{children}</span>
      </button>
      {coherence && (
        <a
          className="mx-6 mb-3.5 inline-flex min-h-11 w-fit items-center gap-1.5 text-[12px] text-[color:var(--vi-m)] no-underline transition-colors duration-200 hover:text-[color:var(--vi-ink)] hover:underline motion-reduce:transition-none"
          href="#como-sabemos"
        >
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            {coherence.text} · {coherence.linkLabel}
          </span>
        </a>
      )}
    </div>
  );
}
