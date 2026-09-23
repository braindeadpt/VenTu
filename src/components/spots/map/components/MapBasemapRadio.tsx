'use client';

import { getTranslation } from '@/lib/i18n';
import type { BasemapMode } from '../../MapLayerToggle';
import { cn } from '@/lib/cn';

/**
 * Radiogroup «Mapa base» (mapa/satélite) — partilhado entre o painel
 * desktop e o «Ver também» do sheet mobile. Mesmo contrato de sempre:
 * role="radiogroup" + role="radio" com aria-checked e ≥44px.
 */
export default function MapBasemapRadio({
  value,
  onChange,
  locale,
}: {
  value: BasemapMode;
  onChange: (mode: BasemapMode) => void;
  locale: string;
}) {
  const t = getTranslation(locale);
  const labels: Record<BasemapMode, string> = {
    map: t.spotsMap.mapWord,
    satellite: t.spotsMap.satellite,
  };
  return (
    <div
      className="flex rounded-input overflow-hidden border border-divider"
      role="radiogroup"
      aria-label={t.spotsMap.basemap}
    >
      {(['map', 'satellite'] as const).map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={labels[mode]}
            onClick={() => onChange(mode)}
            className={cn(
              'flex-1 px-2.5 py-2 min-h-[44px] text-meta-sm font-semibold transition-colors duration-150',
              active
                ? 'bg-bg-elevated text-fg'
                : 'bg-surface-1/[0.04] text-fg-muted hover:bg-bg-elevated hover:text-fg',
            )}
          >
            {labels[mode]}
          </button>
        );
      })}
    </div>
  );
}
