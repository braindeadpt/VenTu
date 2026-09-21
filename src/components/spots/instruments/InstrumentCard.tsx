'use client';

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import styles from './instruments.module.css';

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
    <div className={styles.card} data-instrument={instrument} data-open={open || undefined}>
      <span className={`${styles.cm} ${styles.cmTl}`} aria-hidden="true" />
      <span className={`${styles.cm} ${styles.cmTr}`} aria-hidden="true" />
      <span className={`${styles.cm} ${styles.cmBl}`} aria-hidden="true" />
      <span className={`${styles.cm} ${styles.cmBr}`} aria-hidden="true" />
      <button
        type="button"
        className={styles.hit}
        aria-expanded={open}
        aria-controls={INSTRUMENT_DETAIL_ID}
        onClick={() => onToggle(instrument)}
      >
        <span className={styles.head}>
          <span className={styles.label}>{label}</span>
          {chip != null && <span className={styles.chip}>{chip}</span>}
        </span>
        {fig}
        <span className={styles.readout}>{children}</span>
      </button>
      {coherence && (
        <a className={styles.coherence} href="#como-sabemos">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            {coherence.text} · {coherence.linkLabel}
          </span>
        </a>
      )}
    </div>
  );
}
