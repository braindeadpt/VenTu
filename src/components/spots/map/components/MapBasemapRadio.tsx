'use client';

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
  isPt,
}: {
  value: BasemapMode;
  onChange: (mode: BasemapMode) => void;
  isPt: boolean;
}) {
  const labels: Record<BasemapMode, string> = {
    map: isPt ? 'Mapa' : 'Map',
    satellite: isPt ? 'Satélite' : 'Satellite',
  };
  return (
    <div
      className="flex rounded-input overflow-hidden border border-divider"
      role="radiogroup"
      aria-label={isPt ? 'Mapa base' : 'Basemap'}
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
