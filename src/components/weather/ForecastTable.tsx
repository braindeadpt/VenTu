'use client';

import { useMemo, useState, useCallback } from 'react';

import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import {
  getCardinalLabel,
  getWindArrow,
  getWindRelationToCoast,
} from '@/lib/wind';
import { getTranslation } from '@/lib/i18n';

/* ═══════════════════════════════════════════════════════════════════════
 *  ForecastTable — Dense hourly forecast table (Windguru-style).
 *
 *  Signature feature. Shows 24-120 hours of wave, wind, and score data
 *  in a compact colour-coded table with sticky headers, semantic
 *  cell backgrounds, day separators, and day-picker tabs.
 *
 *  @example
 *  <ForecastTable
 *    hourly={forecastData}
 *    hours={120}
 *    sport="surf"
 *    coastOrientation={270}
 *    locale="pt"
 *  />
 *  ═══════════════════════════════════════════════════════════════════════ */

export interface ForecastHour {
  time: string;        // ISO string or Date-compatible
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number; // km/h (displayed raw; unit bug is Fase 5)
  windDirection: number;
  windGust?: number;
  waterTemp?: number;
  score?: number;    // 0-100, pre-calculated by caller
}

interface ForecastTableProps {
  hourly: ForecastHour[];
  hours?: number;
  startTime?: Date;
  sport?: SportType;
  coastOrientation?: number;
  locale: 'pt' | 'en';
  compact?: boolean;
}

/* ──────────── cap hours ──────────── */
const MAX_HOURS = 120;

/* ──────────── day grouping helpers ──────────── */

interface DayGroup {
  date: Date;
  startIndex: number;
  count: number;
  label: string;
  isToday: boolean;
  weekdayShort: string;
}

function groupHoursByDay(hours: ForecastHour[], locale: string): DayGroup[] {
  if (hours.length === 0) return [];

  const groups: DayGroup[] = [];
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });

  let current: DayGroup | null = null;

  hours.forEach((h, i) => {
    const d = new Date(h.time);
    const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const isToday = dateStr === todayStr;
    const weekdayRaw = weekdayFmt.format(d);
    const weekdayShort = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1);

    if (!current || current.date.getDate() !== d.getDate()) {
      if (current) groups.push(current);
      current = {
        date: d,
        startIndex: i,
        count: 1,
        label: `${weekdayShort} ${d.getDate()}`,
        isToday,
        weekdayShort,
      };
    } else {
      current.count++;
    }
  });

  if (current) groups.push(current);
  return groups;
}

function isDayBoundary(hours: ForecastHour[], index: number): boolean {
  if (index <= 0) return false;
  const curr = new Date(hours[index].time);
  const prev = new Date(hours[index - 1].time);
  return curr.getDate() !== prev.getDate();
}

/* ──────────── colour helpers (literal classes for Tailwind JIT) ──────────── */

/** Wave height → background tier. */
function waveBg(h: number): string {
  if (h < 0.5) return 'bg-surface-1';
  if (h < 1.0) return 'bg-data-waves/10';
  if (h < 2.0) return 'bg-data-waves/15';
  if (h < 3.0) return 'bg-data-waves/25';
  return 'bg-data-waves/35';
}

/** Wave period → background tier. */
function periodBg(p: number): string {
  if (p < 6) return 'bg-surface-1';
  if (p < 9) return 'bg-data-period/10';
  if (p < 12) return 'bg-data-period/20';
  return 'bg-data-period/30';
}

/** Wind speed (km/h, displayed as "kt" label) → background tier. */
function windBg(s: number): string {
  if (s < 10) return 'bg-surface-1';
  if (s < 15) return 'bg-data-wind/10';
  if (s < 22) return 'bg-data-wind/20';
  if (s < 30) return 'bg-data-wind/30';
  return 'bg-data-wind/40';
}

/** Wind speed text colour for alarming values. */
function windText(s: number): string {
  if (s >= 30) return 'text-data-wind';
  return 'text-fg';
}

/** Gust — same scale as wind but lighter opacity. */
function gustBg(g: number): string {
  if (g < 10) return 'bg-surface-1';
  if (g < 15) return 'bg-data-wind/[0.07]';
  if (g < 22) return 'bg-data-wind/[0.14]';
  if (g < 30) return 'bg-data-wind/[0.21]';
  return 'bg-data-wind/[0.28]';
}

/** Water temperature → background tier. */
function waterBg(t: number): string {
  if (t < 14) return 'bg-surface-1';
  if (t < 18) return 'bg-data-water/10';
  if (t < 22) return 'bg-data-water/20';
  return 'bg-data-water/30';
}

/** Water temperature text colour. */
function waterText(t: number): string {
  if (t < 14) return 'text-windDir-onshore';
  return 'text-fg';
}

/** Score → CSS variable name for inline colour. */
function scoreVariant(score: number): string {
  if (score >= 80) return '--score-epic';
  if (score >= 60) return '--score-good';
  if (score >= 40) return '--score-fair';
  if (score >= 20) return '--score-poor';
  return '--score-closed';
}

/* ──────────── wind direction cell tint ──────────── */
function windDirBg(
  direction: number,
  coastOrientation: number | undefined,
): string {
  if (coastOrientation === undefined) return 'bg-surface-1';
  const relation = getWindRelationToCoast(direction, coastOrientation);
  if (relation === 'offshore') return 'bg-windDir-offshore/15';
  if (relation === 'onshore') return 'bg-windDir-onshore/15';
  return 'bg-surface-1';
}

/* ──────────── time helpers ──────────── */
function parseHourLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}h`;
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

function buildTooltip(h: ForecastHour, sportLabel?: string): string {
  const parts: string[] = [
    `${parseHourLabel(h.time)}: ${h.waveHeight.toFixed(1)}m @ ${Math.round(h.wavePeriod)}s`,
    `${Math.round(h.windSpeed)}kt ${getCardinalLabel(h.windDirection)}`,
  ];
  if (h.windGust !== undefined) parts.push(`gust ${Math.round(h.windGust)}kt`);
  if (h.waterTemp !== undefined) parts.push(`water ${h.waterTemp.toFixed(1)}°C`);
  if (h.score !== undefined) parts.push(`score ${h.score}${sportLabel ? ` (${sportLabel})` : ''}`);
  return parts.join(' · ');
}

/* ═══════════════════════════════════════════════════════════════════════
 *  COMPONENT
 *  ═══════════════════════════════════════════════════════════════════════ */

export default function ForecastTable({
  hourly,
  hours = 24,
  startTime,
  sport,
  coastOrientation,
  locale,
  compact = false,
}: ForecastTableProps) {
  const t = getTranslation(locale as 'pt' | 'en').forecastTable;
  const tc = getTranslation(locale as 'pt' | 'en').common;
  const isPt = locale === 'pt';

  /* ── cap hours ── */
  const visibleCount = Math.min(hours, MAX_HOURS);
  if (hours > MAX_HOURS && process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.warn(
      `ForecastTable: hours capped at ${MAX_HOURS} (received ${hours}). Currently the max supported horizon.`,
    );
  }

  /* ── slice data ── */
  const visible = useMemo(() => {
    let startIndex = 0;
    if (startTime) {
      startIndex = hourly.findIndex((h) => {
        const d = new Date(h.time);
        return d >= startTime;
      });
      if (startIndex === -1) startIndex = 0;
    }
    return hourly.slice(startIndex, startIndex + visibleCount);
  }, [hourly, startTime, visibleCount]);

  /* ── day groups ── */
  const dayGroups = useMemo(
    () => groupHoursByDay(visible, locale),
    [visible, locale],
  );

  /* ── day boundary lookup (startIndex → dayIndex) ── */
  const startIndexToDayIndex = useMemo(() => {
    const map = new Map<number, number>();
    dayGroups.forEach((group, idx) => map.set(group.startIndex, idx));
    return map;
  }, [dayGroups]);

  /* ── active day + scroll ── */
  const [activeDay, setActiveDay] = useState(0);

  const scrollToDay = useCallback(
    (dayIndex: number) => {
      setActiveDay(dayIndex);
      const startIdx = dayGroups[dayIndex]?.startIndex;
      if (startIdx === undefined) return;
      const el = document.getElementById(`ft-day-${dayIndex}`);
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          inline: 'start',
          block: 'nearest',
        });
      }
    },
    [dayGroups],
  );

  /* ── current hour ref ── */
  const now = useMemo(() => new Date(), []);

  /* ── hover column state ── */
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  /* ── row presence checks ── */
  const hasGust = visible.some((h) => typeof h.windGust === 'number');
  const hasWaterTemp = visible.some((h) => typeof h.waterTemp === 'number');
  const hasAnyScore = visible.some((h) => typeof h.score === 'number');

  /* ── sport label for score row ── */
  const sportLabel = sport
    ? SPORT_LABELS[sport][isPt ? 'pt' : 'en']
    : undefined;

  /* ── cell dimensions ── */
  const cellPx = compact ? 'px-1.5 py-1' : 'px-2 py-1.5';
  const labelW = 'w-[80px] md:w-[80px]';
  const hourW = compact ? 'min-w-[32px]' : 'min-w-[36px]';

  /* ── day boundary class helper ── */
  const boundaryClass = (i: number) =>
    isDayBoundary(visible, i) ? 'border-l-2 border-l-divider-strong' : '';

  return (
    <div className="space-y-3">
      {/* ═══════════════════════════════════════════════════════════════
          DAY PICKER TABS
          ═══════════════════════════════════════════════════════════════ */}
      {dayGroups.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {dayGroups.map((group, i) => (
            <button
              key={i}
              onClick={() => scrollToDay(i)}
              className={`
                px-3 py-1.5 sm:px-4 sm:py-2 rounded-pill text-meta-sm font-medium whitespace-nowrap
                transition-all duration-fast
                ${activeDay === i
                  ? 'bg-surface-3 text-fg ring-1 ring-divider-strong'
                  : 'bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg'
                }
              `}
            >
              {group.isToday ? (
                tc.today
              ) : (
                <>
                  <span className="hidden sm:inline">{group.weekdayShort} </span>
                  <span>{group.date.getDate()}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TABLE
          ═══════════════════════════════════════════════════════════════ */}
      <div
        className="overflow-x-auto no-scrollbar rounded-card-lg border border-divider bg-bg-base"
        tabIndex={0}
        role="region"
        aria-label={t.caption.replace('{hours}', String(visibleCount))}
      >
        <table className="w-full border-separate border-spacing-x-[2px] border-spacing-y-[1px] text-center">
          {/* Caption for screen readers */}
          <caption className="sr-only">
            {t.caption.replace('{hours}', String(visibleCount))}
          </caption>

          <thead>
            {/* ── Day labels row ── */}
            <tr>
              {/* Sticky label column */}
              <th
                scope="col"
                className={`sticky left-0 z-20 bg-bg-base ${labelW} ${cellPx} text-left text-meta-sm text-fg-subtle font-medium`}
              />
              {dayGroups.map((group, i) => (
                <th
                  key={i}
                  scope="col"
                  colSpan={group.count}
                  className="sticky top-0 z-[11] bg-surface-1 border-b border-divider-strong py-1 text-meta-sm font-mono uppercase tracking-wider text-fg-muted"
                >
                  {group.isToday ? (
                    tc.today
                  ) : (
                    <>
                      <span className="hidden sm:inline">{group.weekdayShort} </span>
                      <span>{group.date.getDate()}</span>
                    </>
                  )}
                </th>
              ))}
            </tr>

            {/* ── Hour header row ── */}
            <tr>
              {/* Sticky label column */}
              <th
                scope="col"
                className={`sticky left-0 z-20 bg-bg-base ${labelW} ${cellPx} text-left text-meta-sm text-fg-subtle font-medium`}
              />
              {visible.map((h, i) => {
                const current = isCurrentHour(h.time, now);
                const dayIdx = startIndexToDayIndex.get(i);
                return (
                  <th
                    key={i}
                    scope="col"
                    id={dayIdx !== undefined ? `ft-day-${dayIdx}` : undefined}
                    className={`sticky top-0 z-10 ${hourW} ${cellPx} font-mono text-num-sm ${
                      current
                        ? 'bg-surface-2 text-fg border-b-2 border-score-good'
                        : 'bg-bg-base text-fg-muted'
                    } ${boundaryClass(i)} transition-colors duration-fast`}
                    aria-current={current ? 'time' : undefined}
                  >
                    {parseHourLabel(h.time)}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {/* ── WAVES ── */}
            <tr>
              <th
                scope="row"
                className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left text-meta-sm text-fg-subtle font-medium`}
              >
                {t.waves}
              </th>
              {visible.map((h, i) => (
                <td
                  key={i}
                  className={`${hourW} ${cellPx} ${waveBg(h.waveHeight)} font-mono text-num ${
                    hoveredCol === i ? 'bg-surface-2' : ''
                  } ${boundaryClass(i)} transition-colors duration-fast`}
                  title={buildTooltip(h, sportLabel)}
                  onMouseEnter={() => setHoveredCol(i)}
                  onMouseLeave={() => setHoveredCol(null)}
                >
                  {h.waveHeight.toFixed(1)}
                </td>
              ))}
            </tr>

            {/* ── PERIOD ── */}
            <tr>
              <th
                scope="row"
                className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left text-meta-sm text-fg-subtle font-medium`}
              >
                {t.period}
              </th>
              {visible.map((h, i) => (
                <td
                  key={i}
                  className={`${hourW} ${cellPx} ${periodBg(h.wavePeriod)} font-mono text-num ${
                    hoveredCol === i ? 'bg-surface-2' : ''
                  } ${boundaryClass(i)} transition-colors duration-fast`}
                  title={buildTooltip(h, sportLabel)}
                  onMouseEnter={() => setHoveredCol(i)}
                  onMouseLeave={() => setHoveredCol(null)}
                >
                  {Math.round(h.wavePeriod)}
                </td>
              ))}
            </tr>

            {/* ── WIND SPEED ── */}
            <tr>
              <th
                scope="row"
                className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left text-meta-sm text-fg-subtle font-medium`}
              >
                {t.wind}
              </th>
              {visible.map((h, i) => (
                <td
                  key={i}
                  className={`${hourW} ${cellPx} ${windBg(h.windSpeed)} font-mono text-num ${windText(
                    h.windSpeed,
                  )} ${hoveredCol === i ? 'bg-surface-2' : ''} ${boundaryClass(i)} transition-colors duration-fast`}
                  title={buildTooltip(h, sportLabel)}
                  onMouseEnter={() => setHoveredCol(i)}
                  onMouseLeave={() => setHoveredCol(null)}
                >
                  {Math.round(h.windSpeed)}
                </td>
              ))}
            </tr>

            {/* ── WIND DIRECTION ── */}
            <tr>
              <th
                scope="row"
                className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left text-meta-sm text-fg-subtle font-medium`}
              >
                {t.direction}
              </th>
              {visible.map((h, i) => (
                <td
                  key={i}
                  className={`${hourW} ${cellPx} ${windDirBg(
                    h.windDirection,
                    coastOrientation,
                  )} font-mono text-meta ${
                    hoveredCol === i ? 'bg-surface-2' : ''
                  } ${boundaryClass(i)} transition-colors duration-fast`}
                  title={buildTooltip(h, sportLabel)}
                  onMouseEnter={() => setHoveredCol(i)}
                  onMouseLeave={() => setHoveredCol(null)}
                >
                  <span className="inline-flex items-center gap-0.5">
                    <span>{getWindArrow(h.windDirection)}</span>
                    <span>{getCardinalLabel(h.windDirection)}</span>
                  </span>
                </td>
              ))}
            </tr>

            {/* ── GUST (conditional) ── */}
            {hasGust && (
              <tr>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left text-meta-sm text-fg-subtle font-medium`}
                >
                  {t.gust}
                </th>
                {visible.map((h, i) => (
                  <td
                    key={i}
                    className={`${hourW} ${cellPx} ${
                      typeof h.windGust === 'number' ? gustBg(h.windGust) : 'bg-surface-1'
                    } font-mono text-num-sm text-fg-muted ${
                      hoveredCol === i ? 'bg-surface-2' : ''
                    } ${boundaryClass(i)} transition-colors duration-fast`}
                    title={buildTooltip(h, sportLabel)}
                    onMouseEnter={() => setHoveredCol(i)}
                    onMouseLeave={() => setHoveredCol(null)}
                  >
                    {typeof h.windGust === 'number' ? Math.round(h.windGust) : '—'}
                  </td>
                ))}
              </tr>
            )}

            {/* ── WATER TEMP (conditional) ── */}
            {hasWaterTemp && (
              <tr>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left text-meta-sm text-fg-subtle font-medium`}
                >
                  {t.water}
                </th>
                {visible.map((h, i) => (
                  <td
                    key={i}
                    className={`${hourW} ${cellPx} ${
                      typeof h.waterTemp === 'number'
                        ? waterBg(h.waterTemp)
                        : 'bg-surface-1'
                    } font-mono text-num ${
                      typeof h.waterTemp === 'number'
                        ? waterText(h.waterTemp)
                        : 'text-fg-subtle'
                    } ${hoveredCol === i ? 'bg-surface-2' : ''} ${boundaryClass(i)} transition-colors duration-fast`}
                    title={buildTooltip(h, sportLabel)}
                    onMouseEnter={() => setHoveredCol(i)}
                    onMouseLeave={() => setHoveredCol(null)}
                  >
                    {typeof h.waterTemp === 'number'
                      ? h.waterTemp.toFixed(1)
                      : '—'}
                  </td>
                ))}
              </tr>
            )}

            {/* ── SCORE (conditional, heavy visual weight) ── */}
            {hasAnyScore && (
              <tr className="border-t-2 border-divider-strong">
                <th
                  scope="row"
                  className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left text-meta-sm text-fg font-semibold`}
                >
                  {sportLabel ?? t.score}
                </th>
                {visible.map((h, i) => {
                  const hasScore = typeof h.score === 'number';
                  const variant = hasScore ? scoreVariant(h.score!) : '--score-closed';
                  return (
                    <td
                      key={i}
                      className={`${hourW} ${cellPx} font-mono text-num-lg font-semibold ${
                        hoveredCol === i ? 'bg-surface-2' : ''
                      } ${boundaryClass(i)} transition-colors duration-fast`}
                      style={
                        hasScore
                          ? ({
                              backgroundColor: `rgb(var(${variant}) / 0.18)`,
                              color: `rgb(var(${variant}))`,
                            } as React.CSSProperties)
                          : undefined
                      }
                      title={buildTooltip(h, sportLabel)}
                      onMouseEnter={() => setHoveredCol(i)}
                      onMouseLeave={() => setHoveredCol(null)}
                    >
                      {hasScore ? h.score : '—'}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  TEST NOTES
 *  ═══════════════════════════════════════════════════════════════════════
 *
 *  1.  Visual density:
 *      • 24h table should be ~720-960px wide on desktop (no scroll).
 *      • 48h+ should trigger overflow-x with smooth scroll.
 *      • 120h should still render smoothly (~960 cells).
 *
 *  2.  Sticky behaviour:
 *      • First column (labels) stays visible during horizontal scroll.
 *      • Header rows (day labels + hours) stay visible during vertical scroll.
 *      • Day labels row sits above hour row when both are sticky.
 *      • z-index layering: label col z-20 over header z-10/11 in corner.
 *
 *  3.  Current hour highlight:
 *      • Column matching current system hour gets surface-2 bg +
 *        border-b-2 border-score-good + text-fg (not muted).
 *
 *  4.  Day separators:
 *      • First hour of each day gets border-l-2 border-l-divider-strong.
 *      • Applies to all rows (header + data).
 *      • Day labels row shows weekday + date (or "Hoje" for today).
 *
 *  5.  Day picker tabs:
 *      • One tab per day present in the data.
 *      • Active tab has bg-surface-3 + ring.
 *      • Click scrolls table horizontally to first hour of that day.
 *      • "Hoje" label for current day.
 *      • Mobile: weekday hidden, only date number shown.
 *
 *  6.  Colour semantics:
 *      • Wave cells: flat → small → rideable → good → big (increasing blue).
 *      • Wind cells: light → useful → strong → alarming (increasing amber).
 *      • Direction cells: offshore tint green, onshore tint red, cross neutral.
 *      • Water cells: cold → mild → warm (increasing teal).
 *      • Score cells: epic/good/fair/poor/closed colours via CSS var.
 *
 *  7.  Conditional rows:
 *      • No gust data anywhere → gust row completely omitted.
 *      • No water temp anywhere → water row omitted.
 *      • No score anywhere → score row omitted (heavy row, don't waste space).
 *      • Partial score data → score row shown, missing cells show "—".
 *
 *  8.  Mobile (320px-375px):
 *      • Overflow-x scrolls smoothly, first column sticky.
 *      • Compact mode: smaller padding + narrower hour columns.
 *      • Day picker tabs scroll horizontally if needed.
 *
 *  9.  Accessibility:
 *      • <caption> sr-only for screen readers.
 *      • <th scope="col"> for hour headers, <th scope="row"> for labels.
 *      • aria-current="time" on current hour header.
 *      • title tooltips on every data cell with full info.
 *      • Keyboard focusable wrapper (tabIndex={0}).
 *
 *  10. Hover column:
 *      • Hover any cell → entire column highlights with surface-2 bg.
 *      • Transition 120ms (duration-fast).
 *      • Respects prefers-reduced-motion via globals.css.
 *
 *  11. Hours cap:
 *      • Passing hours={150} internally caps to 120, console.warn in dev.
 *      • Caller can paginate by shifting startTime in future releases.
 *
 *  12. Sport label:
 *      • Score row header uses translated sport name when sport prop given.
 *      • Falls back to generic "Score" label.
 *
 *  13. Arrow convention:
 *      • Arrow points WHERE wind goes (meteorological output direction).
 *      • Cardinal label shows where wind comes FROM.
 *      • Example: wind from N (0°) → arrow ↓ (goes S) + label "N".
 */
