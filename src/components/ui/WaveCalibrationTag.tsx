'use client';

import { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { waveCalibrationTag, type ObservedWave } from '@/lib/observedWave';
import { cn } from '@/lib/cn';

export interface WaveCalibrationTagProps {
  /**
   * Wave whose calibration should be exposed — only `calibration` + the
   * corrected `waveHeight` are read (the hero passes the full observedWave;
   * the TopNow/compare cards pass the row's calibration + corrected height).
   */
  wave: Pick<ObservedWave, 'calibration' | 'waveHeight'> | null | undefined;
  locale: string;
  className?: string;
}

/**
 * Compact cross-border calibration pill — «🔧 ref. PT (-0.9 m · n=4)».
 *
 * Shared by every surface that shows the score/wave without the hero context
 * (hero chip, sticky bar, observed-wave card side-by-side chip, TopNow cards,
 * spot comparator): the Spanish reading was recalibrated to the PT reference,
 * and the user must see that the displayed height is not the raw measurement.
 *
 * The full chain (pair, ME, raw → corrected height) lives in a TOOLTIP on
 * hover (desktop) AND in a clickable popover (tap on mobile / click on any
 * surface): the pill is a real <button> with aria-expanded, the popover is
 * portaled to <body> (never clipped by overflow containers), positioned under
 * the pill — or above when there is no room (sticky bar at the bottom) — and
 * closes on outside click or Escape.
 */
export default function WaveCalibrationTag({
  wave,
  locale,
  className,
}: WaveCalibrationTagProps) {
  const calTag = waveCalibrationTag(wave, locale);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const id = useId();

  // Posiciona (e reposiciona durante scroll/resize — o chip vive em superfícies
  // com scroll próprio, ex. a sticky bar) o popover junto do botão: por baixo,
  // ou por cima quando não há espaço (chip perto do fundo do viewport).
  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    if (!button) return;
    let raf = 0;
    const update = () => {
      const rect = button.getBoundingClientRect();
      const pop = popoverRef.current;
      const width = pop?.offsetWidth ?? 0;
      const height = pop?.offsetHeight ?? 120;
      const below = rect.bottom + 6 + height;
      const flip = below > window.innerHeight && rect.top - 6 - height > 0;
      setPos({
        top: flip ? rect.top - 6 - height : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      });
    };
    update();
    // Captura para apanhar scroll em contentores internos (sticky bar, hero).
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  // Fecha com clique fora (pointerdown, ignorando o próprio botão) ou Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!calTag) return null;

  // O chip é um botão dentro de superfícies clicáveis (ex. SpotListCard é um
  // link inteiro): o clique no chip nunca pode navegar/activar o pai.
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        aria-expanded={open}
        aria-controls={`${id}-popover`}
        onClick={toggle}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 rounded-pill border border-data-period/30 bg-data-period/10 px-2 py-0.5 font-medium whitespace-nowrap text-data-period',
          className,
        )}
        title={calTag.title}
        data-wave-calibrated="compact"
      >
        {calTag.label}
      </button>
      {typeof document !== 'undefined' && open && pos && (
        createPortal(
          <div
            ref={popoverRef}
            id={`${id}-popover`}
            role="tooltip"
            className="fixed z-[5000] w-max max-w-[min(320px,calc(100vw-16px))] rounded-lg border border-divider bg-bg-elevated px-3 py-2 text-xs leading-relaxed text-fg shadow-card"
            style={{ top: pos.top, left: pos.left }}
            data-wave-calibration-popover="true"
          >
            {calTag.title}
          </div>,
          document.body,
        )
      )}
    </>
  );
}