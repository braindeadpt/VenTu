'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import {
  computeMagicWindows,
  type HourlyCondition,
} from '@/lib/magicWindows';
import { getScoreTokens } from '@/lib/sportScore';

interface MagicWindowsProps {
  hourly: HourlyCondition[];
  spotType: string;
  spotBestWind: string;
  locale: string;
}

const DAY_TICKS = [0, 6, 12, 18, 24];
const HOUR_MS = 3_600_000;

function pickWindowTime(hourly: HourlyCondition[], index: number): Date {
  const t = hourly[index]?.time;
  return t ? new Date(t) : new Date();
}

function dayStartUtc(date: Date): number {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export default function MagicWindows({ hourly, spotType, spotBestWind, locale }: MagicWindowsProps) {
  const isPt = locale === 'pt';

  const windows = useMemo(
    () => computeMagicWindows(hourly, spotType, spotBestWind),
    [hourly, spotType, spotBestWind],
  );

  if (!windows.length) {
    return (
      <div className="rounded-input border border-divider bg-surface-1/[0.04] px-3 py-2.5 text-meta-sm text-fg-muted">
        {isPt
          ? 'Sem janelas de score ≥ 60 nas próximas 24h. Vale confirmar Livecam.'
          : 'No score windows ≥ 60 in the next 24h. Check the livecam to confirm.'}
      </div>
    );
  }

  const formatHour = (idx: number) => {
    const t = hourly[idx]?.time;
    if (!t) return '--:--';
    return new Date(t).toLocaleTimeString(isPt ? 'pt-PT' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Reference day-start in UTC for the first hourly slot. The bar is
  // normalised to the 24h day that contains the first window.
  const firstWindow = windows[0];
  const firstWindowTime = pickWindowTime(hourly, firstWindow.start);
  const dayStart = dayStartUtc(firstWindowTime);

  return (
    <div className="space-y-3">
      {windows.map((w, i) => {
        const startTime = pickWindowTime(hourly, w.start);
        const endTime = pickWindowTime(hourly, w.end);
        const startMin = Math.max(0, (startTime.getTime() - dayStart) / HOUR_MS);
        const endMin = Math.min(24, (endTime.getTime() - dayStart) / HOUR_MS);
        const leftPct = (startMin / 24) * 100;
        const widthPct = Math.max(2, ((endMin - startMin) / 24) * 100);

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
                    {formatHour(w.start)} – {formatHour(w.end)}
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

            {/* 24h bar — ticks + labels BELOW the track */}
            <div
              className="relative"
              role="img"
              aria-label={
                isPt
                  ? `Janela entre ${formatHour(w.start)} e ${formatHour(w.end)} com score ${w.score}`
                  : `Window between ${formatHour(w.start)} and ${formatHour(w.end)} with score ${w.score}`
              }
            >
              <div className="relative h-6 rounded-pill bg-surface-1/[0.06] border border-divider overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 right-0 opacity-25"
                  style={{
                    background: `linear-gradient(90deg, ${tierBarGradient(w.score)})`,
                  }}
                  aria-hidden
                />
                <div
                  className="absolute inset-y-1 rounded-pill border"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: `rgb(var(--score-${tokens.tier}) / 0.22)`,
                    borderColor: `rgb(var(--score-${tokens.tier}) / 0.55)`,
                  }}
                  aria-hidden
                />
                <div className="absolute inset-0 flex pointer-events-none" aria-hidden>
                  {DAY_TICKS.map((tick) => (
                    <div
                      key={tick}
                      className="absolute top-0 bottom-0 border-l border-divider/40"
                      style={{ left: `${(tick / 24) * 100}%` }}
                    />
                  ))}
                </div>
              </div>
              {/* Labels below the bar, not overlapping */}
              <div className="flex justify-between px-0.5 mt-0.5 text-[10px] font-mono tabular-nums text-fg-subtle" aria-hidden>
                {DAY_TICKS.map((tick) => (
                  <span key={tick}>{String(tick).padStart(2, '0')}h</span>
                ))}
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

/** Tier → solid bar gradient stops (cool only). */
function tierBarGradient(score: number): string {
  if (score >= 80) return 'rgb(var(--score-epic) / 0.4) 0%, rgb(var(--score-good) / 0.4) 100%';
  if (score >= 60) return 'rgb(var(--score-good) / 0.3) 0%, rgb(var(--score-fair) / 0.3) 100%';
  if (score >= 40) return 'rgb(var(--score-fair) / 0.3) 0%, rgb(var(--score-poor) / 0.3) 100%';
  return 'rgb(var(--score-poor) / 0.3) 0%, rgb(var(--score-closed) / 0.3) 100%';
}
