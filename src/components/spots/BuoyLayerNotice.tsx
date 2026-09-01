'use client';

import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buoyLayerCopy, useBuoyLayerNotice } from '@/lib/buoyLayerNotice';

/**
 * Honest notice when the measured-wave layer can't produce readings for a
 * spot: distinguishes "IH_API_KEY não configurada" from "IH em baixo", flags
 * stale readings, and names the WMO/Copernicus fallback state («WMO em baixo»)
 * when the cross-border fallback also has no fresh data. Renders nothing when
 * either source is healthy (IH or WMO fresh) or the spot already shows a
 * fresh buoy reading (parent gates on that).
 *
 * Dispensable: the «já vi» choice persists in localStorage (reason-specific)
 * until the layer heals — shared with the compact HUD chip via
 * `useBuoyLayerNotice`, so dismissing one surface hides both.
 *
 * `scope` adapts the copy: 'spot' (default) talks about "this page", 'home'
 * about "the map and cards" — the homepage has no single spot to point at.
 */
export default function BuoyLayerNotice({
  locale,
  scope = 'spot',
  overlay = false,
}: {
  locale: string;
  scope?: 'spot' | 'home';
  /** Over a map/image: give the card a solid backdrop + blur for readability. */
  overlay?: boolean;
}) {
  const isPt = locale === 'pt';
  const isHome = scope === 'home';
  const { status, wmo, dismissed, dismiss } = useBuoyLayerNotice();

  // O aviso só aparece quando NENHUMA fonte tem leituras frescas (se o WMO
  // cobre, o ObservedWaveCard renderiza e não há nada a avisar).
  if (!status) return null;
  // Dispensa persistida para EXACTAMENTE este estado: «já vi» → esconder.
  // Um estado diferente volta a avisar (ex. dispensou no-key, IH sobe e cai
  // depois → «down» é um problema novo).
  if (dismissed?.reason === status) return null;

  const dismissLabel = isPt ? 'Dispensar aviso das boias' : 'Dismiss buoy notice';
  const c = buoyLayerCopy(status, wmo, isPt, isHome);

  return (
    <div
      role="status"
      className={cn(
        'relative rounded-card border p-3 pr-8 flex items-start gap-2.5 text-meta-sm pointer-events-auto',
        status === 'no-key'
          ? 'border-score-fair/40 text-fg'
          : 'border-score-poor/40 text-fg',
        overlay
          ? 'bg-bg-elevated/95 backdrop-blur-sm shadow-card'
          : status === 'no-key'
            ? 'bg-score-fair/10'
            : 'bg-score-poor/10',
      )}
    >
      <AlertTriangle
        className={cn(
          'w-4 h-4 mt-0.5 shrink-0',
          status === 'no-key' ? 'text-score-fair' : 'text-score-poor',
        )}
        aria-hidden
      />
      <p className="leading-snug">
        <strong className="font-semibold">{c.title}: </strong>
        {c.body}
        {c.wmoNote}
      </p>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={dismiss}
        data-buoy-notice-dismiss="true"
        className="absolute top-1.5 right-1.5 rounded-full p-1 text-fg-muted transition-colors hover:text-fg hover:bg-bg-base/60"
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}