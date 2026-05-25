'use client';

import { useState } from 'react';
import { getLegendLabels } from '@/lib/map-constants';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface MapLegendProps {
  locale: string;
  /** Extra bottom margin when fullscreen filter bar is visible. */
  reserveHudSpace?: boolean;
}

export default function MapLegend({ locale, reserveHudSpace = false }: MapLegendProps) {
  const isPt = locale === 'pt';
  const labels = getLegendLabels(locale);
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div
      className={`absolute bottom-0 right-0 z-[1000] mr-3 ${reserveHudSpace ? 'mb-[60px]' : 'mb-3'}`}
      role="region"
      aria-label={isPt ? 'Legenda do mapa' : 'Map legend'}
    >
      <div className="bg-[rgb(var(--bg-elevated))] border border-[rgb(var(--divider))] rounded-lg px-3 py-2 shadow-lg min-w-[130px] sm:min-w-[140px]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-between w-full text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--fg-muted))] mb-1 sm:mb-1.5 sm:cursor-default sm:hover:opacity-100"
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

          <div className="flex justify-between text-[9px] text-[rgb(var(--fg-subtle))]">
            {labels.map((l) => (
              <span key={l.label}>{l.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
