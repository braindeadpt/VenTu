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
  sstTitle?: string;
  sstVisible?: boolean;
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
  sstTitle,
  sstVisible = false,
  currentsTitle,
  currentsVisible = false,
}: MapLegendProps) {
  const isPt = locale === 'pt';
  const labels = getLegendLabels(locale);
  const [collapsed, setCollapsed] = useState(true);

  // Auto-expand when a data layer activates — except the homepage hero:
  // there the expanded box (≈156px tall) lands on the sport filter chips and
  // CTA on mobile. Desktop is unaffected either way (`sm:block` keeps the
  // content visible regardless of `collapsed`); on mobile hero the user taps
  // the legend to expand it.
  useEffect(() => {
    if (placement !== 'hero' && (isobathsVisible || hsVisible || sstVisible || currentsVisible)) {
      setCollapsed(false);
    }
  }, [placement, isobathsVisible, hsVisible, sstVisible, currentsVisible]);

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
                  background:
                    'linear-gradient(to right, rgb(3 105 161 / 0.48), rgb(14 165 233 / 0.78) 42%, rgb(14 165 233 / 0.92) 70%, rgb(241 245 249 / 0.88))',
                }}
              />
              <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
                <span>0.5</span>
                <span>0.9</span>
                <span>2.4+</span>
              </div>
            </div>
          )}
          {sstVisible && sstTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-sst-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {sstTitle}
              </p>
              <div
                className="h-2 rounded mb-1"
                style={{
                  background:
                    'linear-gradient(to right, rgb(var(--data-water) / 0.55), rgb(var(--data-water) / 0.8) 48%, rgb(var(--data-period) / 0.92))',
                }}
              />
              <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
                <span>14</span>
                <span>18</span>
                <span>22+</span>
              </div>
            </div>
          )}
          {currentsVisible && currentsTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-currents-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {currentsTitle}
              </p>
              <div className="flex items-end justify-between h-6 mb-1 px-0.5" aria-hidden>
                {[
                  { w: 1.15, op: 0.48 },
                  { w: 1.7, op: 0.72 },
                  { w: 2.35, op: 0.96 },
                ].map((s) => (
                  <svg
                    key={s.w}
                    width={22}
                    height={22}
                    viewBox="0 0 22 22"
                    className="text-data-water"
                  >
                    <path
                      d="M3.8 17.6 C8.2 12.2, 12.4 7.2, 16.6 4.3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={Math.max(0.8, s.w * 0.55)}
                      strokeLinecap="round"
                      opacity={s.op * 0.4}
                    />
                    <circle cx="3.8" cy="17.6" r={0.7 + s.w * 0.12} fill="currentColor" opacity={s.op * 0.45} />
                    <circle cx="8.2" cy="11.4" r={1.05 + s.w * 0.18} fill="currentColor" opacity={s.op * 0.7} />
                    <circle cx="16.6" cy="4.3" r={1.55 + s.w * 0.28} fill="currentColor" opacity={s.op} />
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
