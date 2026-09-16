'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import {
  computeMagicWindows,
  type HourlyCondition,
} from '@/lib/magicWindows';
import { getScoreTokens } from '@/lib/sportScore';
import SessionStrip from '@/components/spots/SessionStrip';

interface StripHourly extends HourlyCondition {
  tideHeight?: number;
}

interface MagicWindowsProps {
  hourly: StripHourly[];
  /** Score real por hora (mesmo índice que `hourly`) — alimenta a faixa. */
  scores?: number[];
  spotType: string;
  spotBestWind: string;
  locale: string;
  nowMs?: number;
}

function pickWindowTime(hourly: HourlyCondition[], index: number): Date {
  const t = hourly[index]?.time;
  return t ? new Date(t) : new Date();
}

/** Floor a date to the start of its hour (local time). */
function hourFloor(date: Date): number {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function MagicWindows({ hourly, scores, spotType, spotBestWind, locale, nowMs }: MagicWindowsProps) {
  const isPt = locale === 'pt';

  const windows = useMemo(
    () => computeMagicWindows(hourly, spotType, spotBestWind, scores),
    [hourly, scores, spotType, spotBestWind],
  );

  const stripHours = useMemo(
    () =>
      hourly.map((h, i) => ({
        time: h.time,
        score: scores?.[i] ?? 0,
        tideHeight: h.tideHeight,
      })),
    [hourly, scores],
  );

  // Rolling axis: from the first forecast hour (≈ now) to +24h. Matches the
  // "Próximas 24h" header, so no window ever falls outside the track.
  const axisStart = hourFloor(new Date(hourly[0]?.time ?? Date.now()));
  const axisStartDate = new Date(axisStart);

  const formatHour = (idx: number) => {
    const t = hourly[idx]?.time;
    if (!t) return '--:--';
    return new Date(t).toLocaleTimeString(isPt ? 'pt-PT' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-3" data-visual-dynamic>
      {scores && scores.length === hourly.length && (
        <SessionStrip
          hours={stripHours}
          windows={windows}
          isPt={isPt}
          nowMs={nowMs ?? Date.now()}
        />
      )}

      {!windows.length && (
        <div className="rounded-input border border-divider bg-surface-1/[0.04] px-3 py-2.5 text-meta-sm text-fg-muted">
          {isPt
            ? 'Sem janelas de score ≥ 60 nas próximas 24h. Vale confirmar Livecam.'
            : 'No score windows ≥ 60 in the next 24h. Check the livecam to confirm.'}
        </div>
      )}

      {windows.map((w, i) => {
        const startTime = pickWindowTime(hourly, w.start);
        const endTime = pickWindowTime(hourly, w.end);

        // Day hints: flag windows that start tomorrow, and ranges that cross
        // midnight, so "05:00 – 04:00" can't be read as going backwards.
        const startsTomorrow = !isSameCalendarDay(startTime, axisStartDate);
        const crossesMidnight = !isSameCalendarDay(startTime, endTime);
        const tomorrowLabel = isPt ? 'amanhã' : 'tomorrow';

        const tokens = getScoreTokens(w.score);
        const reasons = (isPt ? w.reason : w.reasonEn).split(' + ').filter(Boolean);

        return (
          <div
            key={i}
            className={[
              'card-1 p-3 md:p-4 border-l-4',
              tokens.border,
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={[
                    'shrink-0 flex items-center justify-center w-9 h-9 rounded-pill border',
                    tokens.bg,
                    tokens.border,
                  ].join(' ')}
                  aria-hidden
                >
                  <Clock className={['w-4 h-4', tokens.text].join(' ')} aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-h3 text-fg font-semibold leading-tight tabular-nums">
                    {startsTomorrow && (
                      <span className="text-meta text-fg-muted font-sans font-medium mr-1.5 capitalize">
                        {tomorrowLabel}
                      </span>
                    )}
                    {formatHour(w.start)} – {formatHour(w.end)}
                    {!startsTomorrow && crossesMidnight && (
                      <span className="text-meta text-fg-muted font-sans font-medium ml-1.5">
                        ({tomorrowLabel})
                      </span>
                    )}
                  </div>
                  <div className="text-meta-sm text-fg-muted">
                    {isPt
                      ? `${w.duration}h de condições boas`
                      : `${w.duration}h of good conditions`}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={[
                    'font-mono font-semibold tabular-nums text-h2 leading-none',
                    tokens.text,
                  ].join(' ')}
                >
                  {w.score}
                </div>
                <div className="text-meta-sm text-fg-muted font-mono tabular-nums mt-0.5">
                  /100
                </div>
              </div>
            </div>

            {reasons.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 mt-4 list-none p-0 m-0">
                {reasons.map((r, ri) => (
                  <li
                    key={ri}
                    className="text-meta-sm px-2.5 py-1 rounded-pill bg-surface-1/[0.04] text-fg-muted border border-divider"
                  >
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
