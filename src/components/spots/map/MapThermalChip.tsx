'use client';

import { Wind } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ThermalKind } from '@/lib/mapThermal';

const kindTone: Record<ThermalKind, string> = {
  sea: 'border-data-period/35 bg-data-period/[0.08]',
  land: 'border-data-water/35 bg-data-water/[0.08]',
};

interface MapThermalChipProps {
  kind: ThermalKind;
  kindLabel: string;
  count: number;
  ariaLabel: string;
}

/** Compact sea/land-breeze chip on the HUD time track — only with honest ΔT. */
export default function MapThermalChip({
  kind,
  kindLabel,
  count,
  ariaLabel,
}: MapThermalChipProps) {
  return (
    <span
      data-map-thermal-chip
      data-map-thermal-kind={kind}
      role="status"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 shrink-0 min-h-[44px] px-2 rounded-input border text-meta-sm text-fg',
        kindTone[kind],
      )}
    >
      <Wind
        className={cn(
          'w-3.5 h-3.5 shrink-0',
          kind === 'sea' ? 'text-data-period' : 'text-data-water',
        )}
        aria-hidden
      />
      <span>{kindLabel}</span>
      <span className="text-fg-muted" aria-hidden>
        ·
      </span>
      <span className="font-mono tabular-nums">{count}</span>
    </span>
  );
}
