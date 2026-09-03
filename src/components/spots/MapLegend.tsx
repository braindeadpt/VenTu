'use client';

import { useEffect, useState } from 'react';
import { getLegendLabels } from '@/lib/map-constants';
import { ChevronDown } from 'lucide-react';
import IsobathLegend from './IsobathLegend';

interface MapLegendProps {
  locale: string;
  /** Extra bottom offset when fullscreen filter bar is visible. */
  reserveHudSpace?: boolean;
  /** Measured HUD height (px). Legend sits just above it in fullscreen. */
  hudLift?: number;
  /**
   * `hero` = under the homepage isobaths chip (top-right), clear of the
   * heading and ticker. `map` = bottom-right (fullscreen / embed).
   */
  placement?: 'map' | 'hero';
  /** Legenda de profundidade das isóbatas quando a camada está activa. */
  isobathsTitle?: string;
  isobathsVisible?: boolean;
}

export default function MapLegend({
  locale,
  reserveHudSpace = false,
  hudLift = 0,
  placement = 'map',
  isobathsTitle,
  isobathsVisible = false,
}: MapLegendProps) {
  const isPt = locale === 'pt';
  const labels = getLegendLabels(locale);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (isobathsVisible) setCollapsed(false);
  }, [isobathsVisible]);

  const isHero = placement === 'hero';
  const bottomPx = !isHero && reserveHudSpace
    ? (hudLift > 0 ? hudLift + 12 : 220)
    : undefined;

  return (
    <div
      className={
        isHero
          ? 'absolute top-[6.75rem] right-3 z-[1000]'
          : `absolute z-[1000] right-0 mr-3 ${bottomPx == null ? 'bottom-0 mb-3' : ''}`
      }
      style={bottomPx != null ? { bottom: bottomPx } : undefined}
      role="region"
      aria-label={isPt ? 'Legenda do mapa' : 'Map legend'}
    >
      <div className="bg-bg-elevated border border-divider rounded-lg px-3 py-2 shadow-lg min-w-[130px] sm:min-w-[140px]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-between w-full text-[11px] font-semibold uppercase tracking-wide text-fg-muted mb-1 sm:mb-1.5 sm:cursor-default sm:hover:opacity-100"
          aria-expanded={!collapsed}
        >
          <span>{isPt ? 'Score Náutico' : 'Nautical Score'}</span>
          <ChevronDown
            className={`w-3 h-3 sm:hidden transition-transform ${collapsed ? '' : 'rotate-180'}`}
          />
        </button>

        <div className={`${collapsed ? 'hidden' : 'block'} sm:block`}>
          <div
            className="h-2 rounded mb-1.5"
            style={{
              background: `linear-gradient(to right,
                rgb(var(--score-closed)) 0%,
                rgb(var(--score-poor)) 25%,
                rgb(var(--score-fair)) 50%,
                rgb(var(--score-good)) 75%,
                rgb(var(--score-epic)) 100%
              )`,
            }}
          />

          <div className="flex justify-between text-[9px] text-fg-subtle">
            {labels.map((l) => (
              <span key={l.label}>{l.label}</span>
            ))}
          </div>

          {isobathsVisible && isobathsTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-testid="isobaths-legend-inline">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {isobathsTitle}
              </p>
              <IsobathLegend bare title={isobathsTitle} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
