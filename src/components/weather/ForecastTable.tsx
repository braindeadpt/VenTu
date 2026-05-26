'use client';

import { Fragment, useMemo, useState, useEffect, useRef, useCallback } from 'react';

import { getCardinalLabel, getWindArrow, getWindRelationToCoast } from '@/lib/wind';
import { getScoreTokens } from '@/lib/sportScore';
import { getTranslation } from '@/lib/i18n';
import { cn } from '@/lib/cn';

export interface ForecastHour {
  time: string;
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  windDirection: number;
  windGust?: number;
  waterTemp?: number;
  tideHeight?: number;
  score?: number;
}

interface ForecastTableProps {
  hourly: ForecastHour[];
  hours?: number;
  startTime?: Date;
  coastOrientation?: number;
  locale: 'pt' | 'en';
  compact?: boolean;
}

const MAX_HOURS = 120;

function waveBg(h: number): string {
  if (h < 0.5) return 'bg-surface-1';
  if (h < 1.0) return 'bg-data-waves/20';
  if (h < 2.0) return 'bg-data-waves/35';
  if (h < 3.0) return 'bg-data-waves/50';
  return 'bg-data-waves/65';
}

function periodBg(p: number): string {
  if (p < 6) return 'bg-surface-1';
  if (p < 9) return 'bg-data-period/20';
  if (p < 12) return 'bg-data-period/35';
  return 'bg-data-period/50';
}

function windBg(kt: number): string {
  if (kt < 8) return 'bg-surface-1';
  if (kt < 14) return 'bg-data-wind/20';
  if (kt < 20) return 'bg-data-wind/35';
  if (kt < 28) return 'bg-data-wind/50';
  return 'bg-data-wind/65';
}

function gustBg(kt: number): string {
  if (kt < 8) return 'bg-surface-1';
  if (kt < 14) return 'bg-data-wind/12';
  if (kt < 20) return 'bg-data-wind/25';
  return 'bg-data-wind/40';
}

function waterBg(t: number): string {
  if (t < 14) return 'bg-surface-1';
  if (t < 18) return 'bg-data-water/20';
  if (t < 22) return 'bg-data-water/35';
  return 'bg-data-water/50';
}

function windDirBg(direction: number, coastOrientation: number | undefined): string {
  if (coastOrientation === undefined) return 'bg-surface-1';
  const relation = getWindRelationToCoast(direction, coastOrientation);
  if (relation === 'offshore') return 'bg-windDir-offshore/12';
  if (relation === 'onshore') return 'bg-windDir-onshore/12';
  return 'bg-surface-1';
}

function parseHourLabel(iso: string): string {
  return `${new Date(iso).getHours()}h`;
}

function isCurrentHour(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getHours() === now.getHours() &&
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

function scoreRowTint(score: number): React.CSSProperties {
  const { tier } = getScoreTokens(score);
  return { backgroundColor: `rgb(var(--score-${tier}) / 0.06)` };
}

export default function ForecastTable({
  hourly,
  hours = 24,
  startTime,
  coastOrientation,
  locale,
  compact = false,
}: ForecastTableProps) {
  const t = getTranslation(locale).forecastTable;
  const isPt = locale === 'pt';
  const visibleCount = Math.min(hours, MAX_HOURS);

  const visible = useMemo(() => {
    let startIndex = 0;
    if (startTime) {
      startIndex = hourly.findIndex((h) => new Date(h.time) >= startTime);
      if (startIndex === -1) startIndex = 0;
    }
    return hourly.slice(startIndex, startIndex + visibleCount);
  }, [hourly, startTime, visibleCount]);

  const now = useMemo(() => new Date(), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLTableRowElement>(null);

  const hourColW = compact ? 'w-11 min-w-[44px]' : 'w-[52px] min-w-[52px]';
  const scoreColW = compact ? 'w-10 min-w-[40px]' : 'w-12 min-w-[48px]';
  const metricColW = compact ? 'min-w-[36px] w-9' : 'min-w-[44px] w-11';
  const cellPx = compact ? 'px-1 py-1.5' : 'px-2 py-2';
  const numText = compact ? 'text-[10px] leading-tight' : 'text-num-xs';
  const metaText = compact ? 'text-[9px] leading-tight' : 'text-meta-sm';

  const currentHourIndex = useMemo(
    () => visible.findIndex((h) => isCurrentHour(h.time, now)),
    [visible, now],
  );

  const dayGroups = useMemo(() => {
    const groups: { day: string; dayLabel: string; startIndex: number }[] = [];
    let currentDay = '';
    visible.forEach((h, i) => {
      const dayKey = new Date(h.time).toDateString();
      if (dayKey !== currentDay) {
        currentDay = dayKey;
        groups.push({
          day: dayKey,
          dayLabel: new Date(h.time).toLocaleDateString(locale, {
            weekday: 'short',
            day: 'numeric',
          }),
          startIndex: i,
        });
      }
    });
    return groups;
  }, [visible, locale]);

  const [activeDayGroupIndex, setActiveDayGroupIndex] = useState(0);

  const dayIndexForColumn = useCallback(
    (rowIndex: number) => {
      let idx = 0;
      for (let i = dayGroups.length - 1; i >= 0; i--) {
        if (rowIndex >= dayGroups[i].startIndex) {
          idx = i;
          break;
        }
      }
      return idx;
    },
    [dayGroups],
  );

  const scrollToDayGroup = (groupIndex: number) => {
    const group = dayGroups[groupIndex];
    if (!group || !scrollRef.current) return;
    setActiveDayGroupIndex(groupIndex);
    const row = scrollRef.current.querySelector(`[data-row-index="${group.startIndex}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  useEffect(() => {
    if (currentHourIndex >= 0) {
      setActiveDayGroupIndex(dayIndexForColumn(currentHourIndex));
    }
  }, [currentHourIndex, dayIndexForColumn]);

  useEffect(() => {
    if (currentRowRef.current) {
      currentRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentHourIndex]);

  const hasGust = visible.some((h) => typeof h.windGust === 'number');
  const hasWaterTemp = visible.some((h) => typeof h.waterTemp === 'number');
  const hasTide = visible.some((h) => typeof h.tideHeight === 'number');
  const hasAnyScore = visible.some((h) => typeof h.score === 'number');

  const stickyHour = cn(
    'sticky left-0 z-20 bg-bg-base border-r border-divider',
    hourColW,
    cellPx,
  );
  const stickyScore = cn(
    'sticky z-20 bg-bg-base border-r-2 border-divider-strong',
    scoreColW,
    cellPx,
    compact ? 'left-[44px]' : 'left-[52px]',
  );

  const stickyHourHeader = cn(stickyHour, 'z-40');
  const stickyScoreHeader = cn(stickyScore, 'z-40');

  const metricHeaders = [
    { key: 'waves', label: t.waves, show: true },
    { key: 'period', label: t.period, show: true },
    { key: 'wind', label: t.wind, show: true },
    { key: 'direction', label: t.direction, show: true },
    { key: 'gust', label: t.gust, show: hasGust },
    { key: 'water', label: t.water, show: hasWaterTemp },
    { key: 'tide', label: t.tide, show: hasTide },
  ].filter((h) => h.show);

  return (
    <div className="space-y-2">
      {currentHourIndex >= 0 && (
        <p className="text-meta-sm text-fg-muted flex items-center gap-2 px-0.5">
          <span className="w-2 h-2 rounded-full bg-score-good shrink-0" aria-hidden />
          {isPt ? 'Hora actual destacada' : 'Current hour highlighted'}
        </p>
      )}

      {dayGroups.length > 1 && (
        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 edge-fade-x">
          {dayGroups.map((group, i) => (
            <button
              key={group.day}
              type="button"
              onClick={() => scrollToDayGroup(i)}
              className={cn(
                'pill shrink-0 px-2.5 py-1 min-h-0 text-meta-sm transition-colors duration-150',
                activeDayGroupIndex === i ? 'pill-active' : 'pill-ghost',
              )}
            >
              {group.dayLabel}
            </button>
          ))}
        </div>
      )}

      <div className="edge-fade-x rounded-card">
        <div
          ref={scrollRef}
          className="overflow-x-auto overscroll-x-contain touch-pan-x border border-divider rounded-card bg-bg-base max-h-[min(70vh,520px)] overflow-y-auto"
          tabIndex={0}
          role="region"
          aria-label={t.caption.replace('{hours}', String(visible.length))}
        >
          <table className="border-collapse text-center w-max min-w-full">
            <caption className="sr-only">
              {t.caption.replace('{hours}', String(visible.length))}
            </caption>
            <thead className="sticky top-0 z-30 bg-bg-base shadow-[inset_0_-1px_0_rgb(var(--divider))]">
              <tr>
                <th
                  scope="col"
                  className={cn(stickyHourHeader, metaText, 'text-left font-semibold text-fg')}
                >
                  {isPt ? 'Hora' : 'Hour'}
                </th>
                {hasAnyScore && (
                  <th
                    scope="col"
                    className={cn(stickyScoreHeader, metaText, 'font-semibold text-fg')}
                  >
                    {t.score}
                  </th>
                )}
                {metricHeaders.map((h) => (
                  <th
                    key={h.key}
                    scope="col"
                    className={cn(
                      metricColW,
                      cellPx,
                      metaText,
                      'font-medium text-fg-muted border-b border-divider',
                    )}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((h, i) => {
                const current = isCurrentHour(h.time, now);
                const isNewDay =
                  i === 0 ||
                  new Date(h.time).toDateString() !==
                    new Date(visible[i - 1].time).toDateString();
                const windKt = Math.round(h.windSpeed * 1.94384);
                const gustKt =
                  typeof h.windGust === 'number' ? Math.round(h.windGust * 1.94384) : null;
                const hasScore = typeof h.score === 'number';
                const tokens = hasScore ? getScoreTokens(h.score!) : null;
                const rowStyle = hasScore ? scoreRowTint(h.score!) : undefined;

                return (
                  <Fragment key={h.time}>
                    {isNewDay && dayGroups.length > 1 && (
                      <tr className="bg-surface-1">
                        <td
                          colSpan={(hasAnyScore ? 2 : 1) + metricHeaders.length}
                          className="text-left px-3 py-1.5 text-meta-sm font-semibold text-fg-muted"
                        >
                          {new Date(h.time).toLocaleDateString(locale, {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </td>
                      </tr>
                    )}
                    <tr
                      ref={current ? currentRowRef : undefined}
                      data-row-index={i}
                      className={cn(
                        'transition-colors duration-150 motion-reduce:transition-none',
                        current && 'ring-1 ring-inset ring-score-good/40',
                      )}
                      style={rowStyle}
                    >
                      <th
                        scope="row"
                        className={cn(
                          stickyHour,
                          metaText,
                          'font-mono tabular-nums text-left font-semibold',
                          current ? 'text-fg bg-score-good/10' : 'text-fg-muted',
                        )}
                      >
                        {parseHourLabel(h.time)}
                      </th>

                      {hasAnyScore && (
                        <td
                          className={cn(
                            stickyScore,
                            numText,
                            'font-mono tabular-nums font-semibold',
                            tokens?.bg,
                            tokens?.text,
                          )}
                        >
                          {hasScore ? h.score : '—'}
                        </td>
                      )}

                      <td
                        className={cn(
                          metricColW,
                          cellPx,
                          waveBg(h.waveHeight),
                          numText,
                          'font-mono tabular-nums',
                        )}
                      >
                        {h.waveHeight.toFixed(1)}
                      </td>
                      <td
                        className={cn(
                          metricColW,
                          cellPx,
                          periodBg(h.wavePeriod),
                          numText,
                          'font-mono tabular-nums',
                        )}
                      >
                        {Math.round(h.wavePeriod)}
                      </td>
                      <td
                        className={cn(
                          metricColW,
                          cellPx,
                          windBg(windKt),
                          numText,
                          'font-mono tabular-nums',
                        )}
                      >
                        {windKt}
                      </td>
                      <td
                        className={cn(
                          metricColW,
                          cellPx,
                          windDirBg(h.windDirection, coastOrientation),
                          metaText,
                          'font-mono',
                        )}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {getWindArrow(h.windDirection)}
                          {!compact && (
                            <span className="hidden sm:inline">
                              {getCardinalLabel(h.windDirection)}
                            </span>
                          )}
                        </span>
                      </td>

                      {hasGust && (
                        <td
                          className={cn(
                            metricColW,
                            cellPx,
                            gustKt !== null ? gustBg(gustKt) : 'bg-surface-1',
                            numText,
                            'font-mono tabular-nums text-fg-muted',
                          )}
                        >
                          {gustKt ?? '—'}
                        </td>
                      )}
                      {hasWaterTemp && (
                        <td
                          className={cn(
                            metricColW,
                            cellPx,
                            typeof h.waterTemp === 'number' ? waterBg(h.waterTemp) : 'bg-surface-1',
                            numText,
                            'font-mono tabular-nums',
                          )}
                        >
                          {typeof h.waterTemp === 'number' ? h.waterTemp.toFixed(1) : '—'}
                        </td>
                      )}
                      {hasTide && (
                        <td
                          className={cn(
                            metricColW,
                            cellPx,
                            'bg-surface-1',
                            numText,
                            'font-mono tabular-nums text-fg-muted',
                          )}
                        >
                          {typeof h.tideHeight === 'number' ? h.tideHeight.toFixed(1) : '—'}
                        </td>
                      )}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-meta-sm text-fg-muted md:hidden px-0.5">
        {isPt ? 'Deslize → para ver ondas, vento e mais' : 'Swipe → for waves, wind and more'}
      </p>
    </div>
  );
}
