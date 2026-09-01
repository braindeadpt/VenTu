'use client';

import { ISOBATH_DEPTH_STYLE } from '@/lib/isobaths';

interface IsobathLegendProps {
  /** Localized title («Profundidade — isóbatas IH»). */
  title: string;
  /** Chip shell classes (positioning) — defaults to a floating chip. */
  className?: string;
  /** Compact variant for the map legends (no outer shell). */
  bare?: boolean;
}

/**
 * Legenda de profundidade das isóbatas 8/16/30 m (IH) — partilhada pelo mapa
 * da página de spot (chip flutuante) e pelo mapa interactivo (rows dentro da
 * MapLegend), para as cores/etiquetas nunca divergirem.
 */
export default function IsobathLegend({
  title,
  className = 'absolute left-2 bottom-8 z-[1000]',
  bare = false,
}: IsobathLegendProps) {
  const rows = (
    <div className="space-y-1" data-testid="isobaths-legend-rows">
      {Object.entries(ISOBATH_DEPTH_STYLE).map(([depth, s]) => (
        <div
          key={depth}
          className="flex items-center gap-1.5 text-meta-sm text-fg-muted"
        >
          <span
            className="w-4 h-[3px] rounded-full shrink-0"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          <span className="tabular-nums">{s.label}</span>
        </div>
      ))}
    </div>
  );

  if (bare) return rows;

  return (
    <div
      className={`${className} bg-bg-elevated/95 backdrop-blur-sm border border-divider rounded-lg px-2.5 py-1.5 shadow-card pointer-events-none`}
      data-testid="isobaths-legend"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
        {title}
      </p>
      {rows}
    </div>
  );
}
