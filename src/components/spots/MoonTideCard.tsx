'use client';

import MoonIcon from '@/components/ui/MoonIcon';
import { cn } from '@/lib/cn';
import { getMoonPhase, type TideRegime } from '@/lib/moonPhase';
import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { TideHourPoint } from '@/lib/tideSchedule';
import { dailyTideAmplitudeMetres } from '@/lib/tideAmplitude';

interface MoonTideCardProps {
  locale: string;
  tideHourly?: TideHourPoint[];
  date?: Date;
  title?: string;
  className?: string;
}

const regimeTone: Record<TideRegime, string> = {
  vivas: 'border-data-waves/40 bg-data-waves/[0.08] text-data-waves',
  mortas: 'border-fg-subtle/35 bg-surface-1/[0.06] text-fg-muted',
  'transição': 'border-score-fair/35 bg-score-fair/[0.08] text-score-fair',
};

export default function MoonTideCard({
  locale,
  tideHourly,
  date = new Date(),
  title,
  className,
}: MoonTideCardProps) {
  const loc = (locale === 'pt' ? 'pt' : 'en') as Locale;
  const mt = getTranslation(loc).moonTide;
  const moon = getMoonPhase(date);
  const amplitude =
    tideHourly && tideHourly.length > 0
      ? dailyTideAmplitudeMetres(tideHourly, date)
      : null;

  const cardTitle = title ?? mt.title;

  return (
    <div
      className={cn(
        'rounded-card border border-divider bg-surface-1/[0.03] px-3 py-3',
        className,
      )}
    >
      <p className="text-meta-sm font-semibold text-fg-muted mb-2">{cardTitle}</p>
      <div className="flex items-start gap-3">
        <MoonIcon
          illumination={moon.illumination}
          waxing={moon.waxing}
          size={32}
          title={mt.phase[moon.name]}
        />
        <div className="min-w-0 space-y-1.5">
          <p className="text-body-sm font-medium text-fg leading-snug">
            {mt.phase[moon.name]}
          </p>
          <span
            className={cn(
              'inline-flex items-center rounded-pill border px-2 py-0.5 text-meta-sm font-medium',
              regimeTone[moon.tideRegime],
            )}
          >
            {mt.regime[moon.tideRegime]}
          </span>
          <p className="text-meta-sm text-fg-muted leading-snug">
            {mt.meaning[moon.tideRegime]}
          </p>
          {amplitude != null ? (
            <p className="text-meta-sm font-mono tabular-nums text-fg">
              {mt.amplitudeToday.replace('{value}', amplitude.toFixed(1))}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
