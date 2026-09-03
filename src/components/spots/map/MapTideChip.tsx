'use client';

import { Waves } from 'lucide-react';
import type { TidePhase } from '@/lib/tideSchedule';
import { cn } from '@/lib/cn';

const phaseTone: Record<TidePhase, string> = {
  rising: 'border-data-waves/35 bg-data-waves/[0.08]',
  falling: 'border-data-period/35 bg-data-period/[0.08]',
  high: 'border-data-waves/40 bg-data-waves/[0.1]',
  low: 'border-fg-subtle/30 bg-surface-1/[0.06]',
};

interface MapTideChipProps {
  phase: TidePhase;
  phaseLabel: string;
  nextTime: string | null;
  ariaLabel: string;
}

/** Compact tide phase + next extremum on the HUD time track. */
export default function MapTideChip({
  phase,
  phaseLabel,
  nextTime,
  ariaLabel,
}: MapTideChipProps) {
  return (
    <span
      data-map-tide-chip
      role="status"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 shrink-0 min-h-[44px] px-2 rounded-input border text-meta-sm text-fg',
        phaseTone[phase],
      )}
    >
      <Waves className="w-3.5 h-3.5 text-data-waves shrink-0" aria-hidden />
      <span>{phaseLabel}</span>
      {nextTime && (
        <>
          <span className="text-fg-muted" aria-hidden>
            ·
          </span>
          <span className="font-mono tabular-nums">{nextTime}</span>
        </>
      )}
    </span>
  );
}
