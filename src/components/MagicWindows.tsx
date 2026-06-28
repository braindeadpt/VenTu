'use client';

import { useMemo } from 'react';
import { Clock, Sparkles } from 'lucide-react';
import {
  computeMagicWindows,
  type HourlyCondition,
} from '@/lib/magicWindows';
import { toBcp47 } from '@/lib/i18n';

interface MagicWindowsProps {
  hourly: HourlyCondition[];
  spotType: string;
  spotBestWind: string;
  locale: string;
}

export default function MagicWindows({ hourly, spotType, spotBestWind, locale }: MagicWindowsProps) {
  const isPt = locale === 'pt';

  const windows = useMemo(
    () => computeMagicWindows(hourly, spotType, spotBestWind),
    [hourly, spotType, spotBestWind],
  );

  if (!windows.length) {
    return null;
  }

  const formatHour = (idx: number) => {
    const h = hourly[idx];
    if (!h?.time) return '--:--';
    const date = new Date(h.time);
    return date.toLocaleTimeString(toBcp47(locale), { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-3">
      {windows.map((w, i) => (
        <div
          key={i}
          className={`card-1 p-4 border-l-4 ${
            w.score >= 80
              ? 'border-l-windDir-offshore'
              : w.score >= 60
                ? 'border-l-score-fair'
                : 'border-l-data-waves'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-score-fair/10">
                <Clock className="w-5 h-5 text-score-fair" />
              </div>
              <div>
                <div className="font-bold text-fg">
                  {formatHour(w.start)} — {formatHour(w.end)}
                </div>
                <div className="text-xs text-fg-muted">
                  {isPt ? `${w.duration}h de condições boas` : `${w.duration}h of good conditions`}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div
                className={`text-2xl font-bold ${
                  w.score >= 80
                    ? 'text-windDir-offshore'
                    : w.score >= 60
                      ? 'text-score-fair'
                      : 'text-data-waves'
                }`}
              >
                {w.score}
              </div>
              <div className="text-xs text-fg-muted">/100</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {(isPt ? w.reason : w.reasonEn).split(' + ').map((r, ri) => (
              <span
                key={ri}
                className="text-xs px-2.5 py-1 rounded-full bg-surface-1/[0.04] text-fg-muted border border-divider"
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export { computeMagicWindows };
