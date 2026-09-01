'use client';

import { ArrowDown, ArrowUp, Minus, Waves } from 'lucide-react';
import type { TideSchedule, TidePhase } from '@/lib/tideSchedule';
import { formatTideTime } from '@/lib/tideSchedule';
import { cn } from '@/lib/cn';
import { getTranslation } from '@/lib/i18n';

interface TideScheduleStripProps {
  schedule: TideSchedule;
  locale: string;
  className?: string;
}

const phaseIcon: Record<TidePhase, typeof ArrowUp> = {
  rising: ArrowUp,
  falling: ArrowDown,
  high: Minus,
  low: Minus,
};

const phaseTone: Record<TidePhase, string> = {
  rising: 'border-data-waves/35 bg-data-waves/[0.08] text-data-waves',
  falling: 'border-data-period/35 bg-data-period/[0.08] text-data-period',
  high: 'border-data-waves/40 bg-data-waves/[0.1] text-data-waves',
  low: 'border-fg-subtle/30 bg-surface-1/[0.06] text-fg-muted',
};

export default function TideScheduleStrip({ schedule, locale, className }: TideScheduleStripProps) {
  const isPt = locale === 'pt';
  const tv = getTranslation(locale).spotVerify;
  const PhaseIcon = phaseIcon[schedule.phase];

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="status"
      aria-label={tv.tideAria.replace('{phase}', schedule.phaseLabel)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-meta-sm font-medium',
          phaseTone[schedule.phase],
        )}
      >
        <Waves className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <PhaseIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
        {schedule.phaseLabel}
      </span>

      {schedule.nextLow && (
        <span className="text-meta-sm text-fg-muted">
          <span className="text-fg-subtle">{tv.tideLow}</span>{' '}
          <span className="font-mono tabular-nums text-fg">
            {formatTideTime(schedule.nextLow, isPt ? 'pt' : 'en')}
          </span>
        </span>
      )}

      {schedule.nextHigh && (
        <span className="text-meta-sm text-fg-muted">
          <span className="text-fg-subtle">{tv.tideHigh}</span>{' '}
          <span className="font-mono tabular-nums text-fg">
            {formatTideTime(schedule.nextHigh, isPt ? 'pt' : 'en')}
          </span>
        </span>
      )}
    </div>
  );
}
