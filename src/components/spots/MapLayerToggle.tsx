'use client';

export type BasemapMode = 'map' | 'satellite';

interface MapLayerToggleProps {
  current: BasemapMode;
  onChange: (mode: BasemapMode) => void;
  locale: string;
}

export default function MapLayerToggle({ current, onChange, locale }: MapLayerToggleProps) {
  const t = getTranslation(locale).spotsMap;
  return (
    <div
      className="absolute top-3 right-3 z-[1000] flex rounded-lg overflow-hidden border border-divider shadow-lg"
      role="radiogroup"
      aria-label={t.mapType}
    >
      {(['map', 'satellite'] as const).map((mode) => {
        const label = mode === 'map'
          ? t.mapWord
          : t.satellite;
        const active = current === mode;
        return (
          <button
            key={mode}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(mode)}
            className={`px-3 py-1.5 min-h-[44px] text-xs font-semibold transition-colors duration-150 ${
              active
                ? 'bg-bg-elevated text-fg' // opaque: readable over any tile
                : 'bg-bg-elevated text-fg-muted hover:bg-surface-1/[0.04] hover:text-fg'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}import { getTranslation } from '@/lib/i18n';

