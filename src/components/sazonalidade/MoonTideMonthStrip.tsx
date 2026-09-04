'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { getTideRegimeForLisbonDay } from '@/lib/moonPhase';
import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

interface MoonTideMonthStripProps {
  locale: string;
  /** Year-month to display (defaults to current month in Lisbon). */
  yearMonth?: { year: number; month: number };
}

const regimeBg: Record<string, string> = {
  vivas: 'bg-data-waves/25',
  mortas: 'bg-fg-subtle/15',
  'transição': 'bg-surface-2/[0.12]',
};

export default function MoonTideMonthStrip({ locale, yearMonth }: MoonTideMonthStripProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as Locale);
  const mt = t.moonTide;

  const { year, month, daysInMonth, todayKey } = useMemo(() => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Lisbon',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = yearMonth?.year ?? Number(parts.find((p) => p.type === 'year')?.value);
    const m = yearMonth?.month ?? Number(parts.find((p) => p.type === 'month')?.value);
    const dim = new Date(y, m, 0).getDate();
    const today = `${y}-${String(m).padStart(2, '0')}-${parts.find((p) => p.type === 'day')?.value}`;
    return { year: y, month: m, daysInMonth: dim, todayKey: today };
  }, [yearMonth]);

  const monthLabel = new Intl.DateTimeFormat(isPt ? 'pt-PT' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  }).format(new Date(year, month - 1, 15));

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const regime = getTideRegimeForLisbonDay(year, month, day);
    return { day, key, regime };
  });

  return (
    <section
      className="rounded-2xl border border-divider bg-surface-1/[0.04] p-4 sm:p-5 space-y-3"
      aria-label={mt.monthStripTitle}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-fg capitalize" data-visual-dynamic>{monthLabel}</h2>
        <p className="text-meta-sm text-fg-muted">{mt.monthStripHint}</p>
      </div>

      <div className="flex flex-wrap gap-1" role="list" data-visual-dynamic>
        {days.map(({ day, key, regime }) => {
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              role="listitem"
              title={`${day} — ${mt.regime[regime]}`}
              className={cn(
                'flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-md text-meta-sm font-mono tabular-nums',
                regimeBg[regime],
                isToday ? 'ring-2 ring-data-waves/60 font-semibold text-fg' : 'text-fg-muted',
              )}
            >
              {day}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-meta-sm text-fg-muted pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-data-waves/25" aria-hidden />
          {mt.regime.vivas}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-fg-subtle/15" aria-hidden />
          {mt.regime.mortas}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-surface-2/[0.12] ring-1 ring-divider" aria-hidden />
          {mt.regime['transição']}
        </span>
      </div>
    </section>
  );
}
