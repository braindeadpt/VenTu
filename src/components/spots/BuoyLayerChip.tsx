'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buoyLayerCopy, useBuoyLayerNotice } from '@/lib/buoyLayerNotice';
import type { BuoyLayerStatus } from '@/lib/buoyLayerHealth';

/**
 * Compact buoy-layer status for the explore-mode HUD of /mapa — the full
 * banner is at the top of the map, this chip lives with the map controls.
 *
 * Ligado ao mesmo BuoyLayerNotice: shares `useBuoyLayerNotice` (health state +
 * reason-specific dismissal in localStorage), so dismissing the chip hides the
 * banner, dismissing the banner hides the chip, and both clear when the layer
 * heals. Clicking the chip opens a popover with the full copy (mobile has no
 * hover) and a dismiss action.
 */
export default function BuoyLayerChip({ locale }: { locale: string }) {
  const isPt = locale === 'pt';
  const { status, wmo, dismissed, dismiss } = useBuoyLayerNotice();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fecha por clique fora ou Escape (o popover vive no HUD, junto ao fundo).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  // Mesma regra do banner: nada quando a camada está saudável ou já
  // dispensada para EXACTAMENTE este estado.
  if (!status || dismissed?.reason === status) return null;

  const c = buoyLayerCopy(status, wmo, isPt, true);
  const chipLabel: Record<BuoyLayerStatus, string> = {
    'no-key': isPt ? 'Boias desactivadas' : 'Buoys disabled',
    down: isPt ? 'Boias em baixo' : 'Buoys down',
    stale: isPt ? 'Boias antigas' : 'Stale buoys',
    ok: '',
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        data-buoy-layer-chip="true"
        aria-expanded={open}
        aria-label={isPt ? 'Estado da camada de boias' : 'Buoy layer status'}
        title={c.body}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-2.5 py-2 rounded-input border text-meta-sm font-semibold transition-colors duration-150',
          status === 'no-key'
            ? 'border-score-fair/40 bg-score-fair/10 text-fg'
            : 'border-score-poor/40 bg-score-poor/15 text-fg',
          open && 'bg-surface-2/[0.08]',
        )}
      >
        <AlertTriangle
          className={cn(
            'w-4 h-4 shrink-0',
            status === 'no-key' ? 'text-score-fair' : 'text-score-poor',
          )}
          aria-hidden
        />
        <span className="hidden sm:inline">{chipLabel[status]}</span>
      </button>

      {open && (
        <div
          data-buoy-chip-popover="true"
          role="status"
          className="absolute bottom-full right-0 mb-2 w-[min(320px,calc(100vw-2rem))] z-[1200] rounded-card border border-divider bg-bg-elevated/95 backdrop-blur-md shadow-card p-3 pr-8 text-meta-sm"
        >
          <p className="leading-snug">
            <strong className="font-semibold">{c.title}: </strong>
            {c.body}
            {c.wmoNote}
          </p>
          <button
            type="button"
            onClick={dismiss}
            data-buoy-chip-dismiss="true"
            className="mt-2 inline-flex items-center gap-1 rounded-input border border-divider bg-surface-1/[0.04] px-2 py-1 text-meta-sm font-medium text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors duration-150"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
            {isPt ? 'Dispensar este aviso' : 'Dismiss this notice'}
          </button>
        </div>
      )}
    </div>
  );
}