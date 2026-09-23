'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buoyLayerCopy, useBuoyLayerNotice } from '@/lib/buoyLayerNotice';
import type { BuoyLayerStatus } from '@/lib/buoyLayerHealth';
import { dispatchEnableMapBuoys } from '@/lib/mapBuoyDots';
import { getTranslation, validateLocale } from '@/lib/i18n';

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
  const t = getTranslation(validateLocale(locale));
  const { status, wmo, dismissed, dismiss } = useBuoyLayerNotice();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Posição fixa calculada ao abrir — o popover sai por portal para o body
  // porque dentro do sheet (overflow-hidden) o `bottom-full` era cortado.
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setAnchor({
      left: Math.min(rect.left, Math.max(8, window.innerWidth - 320 - 16)),
      bottom: window.innerHeight - rect.top + 8,
    });
  }, [open]);

  // Fecha por clique fora ou Escape (o popover é portal — vive no body).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Sem stopPropagation o Escape chegava ao listener do window e saía
      // do fullscreen além de fechar o popover.
      e.stopPropagation();
      setOpen(false);
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

  const c = buoyLayerCopy(status, wmo, locale, true);
  const chipLabel: Record<BuoyLayerStatus, string> = {
    'no-key': t.spotsUi.buoysDisabled,
    down: t.spotsUi.buoysDown,
    stale: t.spotsUi.staleBuoys,
    ok: '',
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        data-buoy-layer-chip="true"
        aria-expanded={open}
        aria-label={t.spotsUi.buoyLayerStatusAria}
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

      {open && anchor && createPortal(
        <div
          ref={popoverRef}
          data-buoy-chip-popover="true"
          style={{ position: 'fixed', left: anchor.left, bottom: anchor.bottom }}
          className="w-[min(320px,calc(100vw-2rem))] z-[1250] rounded-card border border-divider bg-bg-elevated/95 backdrop-blur-md shadow-card p-3 pr-8 text-meta-sm"
        >
          {/* role="status" no texto, não no popover — a live region não deve
              embrulhar os botões de acção (audit 2026-09-16 P2). */}
          <p role="status" className="leading-snug">
            <strong className="font-semibold">{c.title}: </strong>
            {c.body}
            {c.wmoNote}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={dismiss}
            data-buoy-chip-dismiss="true"
            className="inline-flex items-center gap-1 rounded-input border border-divider bg-surface-1/[0.04] px-2 py-1 text-meta-sm font-medium text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors duration-150 min-h-[44px]"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
            {t.spotsUi.dismissThisNotice}
          </button>
          {status === 'stale' && (
            <button
              type="button"
              onClick={() => {
                dispatchEnableMapBuoys();
                setOpen(false);
              }}
              data-buoy-show-on-map="true"
              className="inline-flex items-center gap-1 rounded-input border border-divider bg-surface-1/[0.04] px-2 py-1 text-meta-sm font-medium text-fg hover:bg-surface-2/[0.08] transition-colors duration-150 min-h-[44px]"
            >
              {t.map.buoysShowOnMap}
            </button>
          )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}