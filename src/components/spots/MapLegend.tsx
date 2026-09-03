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
  hsTitle?: string;
  hsVisible?: boolean;
  currentsTitle?: string;
  currentsVisible?: boolean;
}

export default function MapLegend({
  locale,
  reserveHudSpace = false,
  hudLift = 0,
  placement = 'map',
  isobathsTitle,
  isobathsVisible = false,
  hsTitle,
  hsVisible = false,
  currentsTitle,
  currentsVisible = false,
}: MapLegendProps) {
  const isPt = locale === 'pt';
  const labels = getLegendLabels(locale);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (isobathsVisible || hsVisible || currentsVisible) setCollapsed(false);
  }, [isobathsVisible, hsVisible, currentsVisible]);

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

          <div className="grid grid-cols-5 gap-0.5 text-center text-[8px] leading-tight text-fg-subtle">
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
          {hsVisible && hsTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-hs-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {hsTitle}
              </p>
              <div
                className="h-2 rounded mb-1"
                style={{
                  background: 'linear-gradient(to right, rgb(var(--data-waves) / 0.14), rgb(var(--data-waves) / 0.78))',
                }}
              />
              <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
                <span>0.4</span>
                <span>1.2</span>
                <span>2.4+</span>
              </div>
            </div>
          )}
          {currentsVisible && currentsTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-currents-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {currentsTitle}
              </p>
              <div className="flex items-end justify-between h-5 mb-1 px-0.5" aria-hidden>
                {[0.55, 0.78, 1].map((s) => (
                  <svg
                    key={s}
                    width={10 + s * 4}
                    height={12 + s * 6}
                    viewBox="0 0 12 16"
                    className="text-data-water"
                  >
                    <path
                      d="M6 15 V3 M6 3 L3.2 7.2 M6 3 L8.8 7.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ))}
              </div>
              <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
                <span>0.1</span>
                <span>0.2</span>
                <span>0.4+</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
