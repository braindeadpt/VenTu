'use client';

import { AlertTriangle, Waves } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import {
  seaStateWarningForSpot,
  warningTypeLabel,
  warningsSourceLabel,
  WARNING_LEVEL_META,
} from '@/lib/ipmaWarnings';

function formatEndDate(iso: string | undefined, isPt: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(isPt ? 'pt-PT' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Dangerous-sea safety banner — shown directly in the spot hero when there is
 * an active Agitação Marítima (sea state) warning for the spot. Renders null
 * otherwise, so the hero layout is untouched on normal days.
 */
export default function SeaStateSafetyBanner({
  spotId,
  locale,
}: {
  spotId: string;
  locale: string;
}) {
  const isPt = locale === 'pt';
  const warningsData = useIpmaWarnings();
  const warning = seaStateWarningForSpot(warningsData, spotId);
  if (!warning) return null;

  const level = warning.level;
  const levelMeta = WARNING_LEVEL_META[level];
  const levelLabel = levelMeta?.label[isPt ? 'pt' : 'en'] ?? level;

  const bannerTone =
    level === 'red'
      ? 'border-red-500/40 bg-red-500/10'
      : level === 'orange'
        ? 'border-score-poor/40 bg-score-poor/10'
        : 'border-score-fair/40 bg-score-fair/10';

  const headlineTone =
    level === 'red'
      ? 'text-red-500'
      : level === 'orange'
        ? 'text-score-poor'
        : 'text-score-fair';

  return (
    <div
      role="alert"
      className={cn(
        'relative z-[5] border-b backdrop-blur-sm',
        bannerTone,
      )}
    >
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-display font-bold text-sm sm:text-base',
            headlineTone,
          )}
        >
          <Waves className="w-5 h-5 shrink-0" aria-hidden />
          {isPt ? 'Mar perigoso — não surfar' : 'Dangerous sea — do not surf'}
        </span>
        <span className="text-meta-sm text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {warningTypeLabel(warning.type, isPt)} · {levelLabel}
          </span>
          {warning.endTime && (
            <span>
              {isPt ? 'até' : 'until'} {formatEndDate(warning.endTime, isPt)}
            </span>
          )}
          <span>
            {isPt ? 'Fonte' : 'Source'}: {warningsSourceLabel(warningsData, isPt)}
          </span>
        </span>
      </div>
    </div>
  );
}
