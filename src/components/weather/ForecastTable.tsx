'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';

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
 *  Signature feature. Shows 24-72 hours of wave, wind, and score data
 *  in a compact colour-coded table with sticky headers and semantic
 *  cell backgrounds.
 *
 *  @example
 *  <ForecastTable
 *    hourly={forecastData}
 *    hours={24}
 *    sport="surf"
 *    coastOrientation={270}
 *    locale="pt"
 *  />
 *  ═══════════════════════════════════════════════════════════════════════ */

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
  sport?: SportType;
  coastOrientation?: number;
  locale: 'pt' | 'en';
  compact?: boolean;
}

/* ──────────── cap hours ──────────── */
const MAX_HOURS = 120;

/* ──────────── colour helpers (literal classes for Tailwind JIT) ──────────── */

/** Wave height → background tier. */
function waveBg(h: number): string {
  if (h < 0.5) return 'bg-surface-1/[0.04]';
  if (h < 1.0) return 'bg-data-waves/25';
  if (h < 2.0) return 'bg-data-waves/45';
  if (h < 3.0) return 'bg-data-waves/65';
  return 'bg-data-waves/80';
}

/** Wave period → background tier. */
function periodBg(p: number): string {
  if (p < 6) return 'bg-surface-1/[0.04]';
  if (p < 9) return 'bg-data-period/25';
  if (p < 12) return 'bg-data-period/50';
  return 'bg-data-period/70';
}

/** Wind speed (knots) → background tier. */
function windBg(kt: number): string {
  if (kt < 8) return 'bg-surface-1/[0.04]';
  if (kt < 14) return 'bg-data-wind/25';
  if (kt < 20) return 'bg-data-wind/45';
  if (kt < 28) return 'bg-data-wind/65';
return 'bg-data-wind/80';
}

/** Wind speed text colour for alarming values (knots). */
function windText(kt: number): string {
  if (kt >= 28) return 'text-data-wind';
  return 'text-fg';
}

/** Gust — same scale as wind but lighter opacity (knots). */
function gustBg(kt: number): string {
  if (kt < 8) return 'bg-surface-1/[0.04]';
  if (kt < 14) return 'bg-data-wind/15';
  if (kt < 20) return 'bg-data-wind/30';
  if (kt < 28) return 'bg-data-wind/50';
  return 'bg-data-wind/65';
}

/** Water temperature → background tier. */
function waterBg(t: number): string {
  if (t < 14) return 'bg-surface-1/[0.04]';
  if (t < 18) return 'bg-data-water/25';
  if (t < 22) return 'bg-data-water/50';
return 'bg-data-water/70';
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
  if (coastOrientation === undefined) return 'bg-surface-1/[0.04]';
  const relation = getWindRelationToCoast(direction, coastOrientation);
  if (relation === 'offshore') return 'bg-windDir-offshore/15';
  if (relation === 'onshore') return 'bg-windDir-onshore/15';
  return 'bg-surface-1/[0.04]';
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
  const windKt = Math.round(h.windSpeed * 1.94384);
  const gustKt = h.windGust !== undefined ? Math.round(h.windGust * 1.94384) : undefined;
  const parts: string[] = [
    `${parseHourLabel(h.time)}: ${h.waveHeight.toFixed(1)}m @ ${Math.round(h.wavePeriod)}s`,
    `${windKt}kt ${getCardinalLabel(h.windDirection)}`,
  ];
  if (gustKt !== undefined) parts.push(`gust ${gustKt}kt`);
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
  const isPt = locale === 'pt';

  /* ── cap hours ── */
  const visibleCount = Math.min(hours, MAX_HOURS);
  if (hours > MAX_HOURS && process.env.NODE_ENV === 'development') {
     
    console.warn(
      `ForecastTable: hours capped at ${MAX_HOURS} (received ${hours}). Use day picker to navigate.`,
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

  /* ── current hour ref ── */
  const now = useMemo(() => new Date(), []);

  /* ── hover column state ── */
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  /* ── scroll container ref ── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const labelWidthPx = compact ? 72 : 96;

  /* ── find current hour index ── */
  const currentHourIndex = useMemo(() => {
    return visible.findIndex((h) => isCurrentHour(h.time, now));
  }, [visible, now]);

  /* ── scroll to current hour on mount ── */
  useEffect(() => {
    if (scrollRef.current && currentHourIndex >= 0) {
      const container = scrollRef.current;
      setTimeout(() => {
        const labelWidth = labelWidthPx;
        const dataStart = labelWidth;
        const cellWidth = (container.scrollWidth - labelWidth) / visible.length;
        const cellCenter = dataStart + currentHourIndex * cellWidth + cellWidth / 2;
        const targetLeft = cellCenter - container.clientWidth / 2;
        container.scrollLeft = Math.max(0, targetLeft);
      }, 200);
    }
  }, [currentHourIndex, visible.length, labelWidthPx]);

  const dayGroups = useMemo(() => {
    const groups: { day: string; dayLabel: string; startIndex: number }[] = [];
    let currentDay = '';
    visible.forEach((h, i) => {
      const d = new Date(h.time);
      const dayKey = d.toDateString();
      if (dayKey !== currentDay) {
        currentDay = dayKey;
        groups.push({
          day: dayKey,
          dayLabel: d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }),
          startIndex: i,
        });
      }
    });
    return groups;
  }, [visible, locale]);

  const [activeDayGroupIndex, setActiveDayGroupIndex] = useState(0);

  const getColumnIndexAtScroll = useCallback(
    (scrollLeft: number, clientWidth: number, scrollWidth: number) => {
      if (visible.length === 0) return 0;
      const dataWidth = Math.max(1, scrollWidth - labelWidthPx);
      const cellWidth = dataWidth / visible.length;
      const anchorX = scrollLeft + clientWidth * 0.35 - labelWidthPx;
      return Math.max(0, Math.min(visible.length - 1, Math.floor(anchorX / cellWidth)));
    },
    [visible.length, labelWidthPx],
  );

  const dayIndexForColumn = useCallback(
    (colIndex: number) => {
      let idx = 0;
      for (let i = dayGroups.length - 1; i >= 0; i--) {
        if (colIndex >= dayGroups[i].startIndex) {
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
    const el = scrollRef.current;
    const dataWidth = Math.max(1, el.scrollWidth - labelWidthPx);
    const cellWidth = dataWidth / visible.length;
    const cellCenter = labelWidthPx + group.startIndex * cellWidth + cellWidth / 2;
    const targetLeft = cellCenter - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  };

  useEffect(() => {
    if (dayGroups.length === 0) return;
    if (currentHourIndex >= 0) {
      setActiveDayGroupIndex(dayIndexForColumn(currentHourIndex));
    }
  }, [currentHourIndex, dayGroups.length, dayIndexForColumn]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || dayGroups.length === 0) return;

    const onScroll = () => {
      const col = getColumnIndexAtScroll(el.scrollLeft, el.clientWidth, el.scrollWidth);
      setActiveDayGroupIndex(dayIndexForColumn(col));
    };

    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [dayGroups.length, getColumnIndexAtScroll, dayIndexForColumn]);

  /* ── row presence checks ── */
  const hasGust = visible.some((h) => typeof h.windGust === 'number');
  const hasWaterTemp = visible.some((h) => typeof h.waterTemp === 'number');
  const hasTide = visible.some((h) => typeof h.tideHeight === 'number');
  const hasAnyScore = visible.some((h) => typeof h.score === 'number');

  /* ── sport label for score row ── */
  const sportLabel = sport
    ? SPORT_LABELS[sport][isPt ? 'pt' : 'en']
    : undefined;

  /* ── cell dimensions ── */
  const cellPx = compact ? 'px-0.5 py-0.5' : 'px-2 py-1';
  const labelW = compact ? 'w-[72px] min-w-[72px]' : 'w-[88px] md:w-[96px]';
  const hourW = compact ? 'w-[28px] min-w-[28px] max-w-[28px]' : 'min-w-[40px]';
  const numText = compact ? 'text-[10px] leading-tight' : 'text-num-xs md:text-num';
  const metaText = compact ? 'text-[9px] leading-tight' : 'text-meta-xs md:text-meta-sm';
  const tableMinW = compact ? 'w-max' : 'min-w-[600px] md:min-w-[800px]';
  const activeDayLabel = dayGroups[activeDayGroupIndex]?.dayLabel ?? '';

  return (
    <div className="space-y-2">
      {/* Current time indicator */}
{currentHourIndex >= 0 && (
        <div className="flex items-center gap-2 text-meta text-fg-muted px-1">
          <span className="w-2 h-2 rounded-full bg-score-good motion-reduce:animate-none animate-pulse" />
          <span>{isPt ? 'Hora atual' : 'Current time'} — {isPt ? 'Arraste para ver mais' : 'Scroll to see more'}</span>
        </div>
      )}

      {dayGroups.length > 1 && (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-meta-sm font-semibold text-fg px-0.5 md:hidden">
            {activeDayLabel}
          </p>
          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
            {dayGroups.map((group, i) => (
              <button
                key={group.day}
                type="button"
                onClick={() => scrollToDayGroup(i)}
                className={`px-2.5 py-1 rounded-pill text-meta-xs whitespace-nowrap shrink-0 transition-all ${
                  activeDayGroupIndex === i
                    ? 'bg-score-good/20 text-score-good border border-score-good/30 font-semibold'
                    : 'bg-surface-1/[0.04] text-fg-muted border border-divider hover:bg-surface-2/[0.08]'
                }`}
              >
                {group.dayLabel}
              </button>
            ))}
          </div>
        </div>
      )}

<div className="edge-fade-x rounded-card max-w-full">
      <div
        ref={scrollRef}
        className={`overflow-x-auto overscroll-x-contain touch-pan-x border border-divider bg-bg-base relative rounded-card max-w-full ${compact ? '' : 'min-w-[600px] md:min-w-[800px]'}`}
        tabIndex={0}
        role="region"
        aria-label={t.caption.replace('{hours}', String(visibleCount))}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) {
            e.preventDefault();
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        <div
          className="absolute inset-y-0 left-0 bg-bg-base/95 backdrop-blur-[2px] pointer-events-none z-10 border-r border-divider"
          style={{ width: labelWidthPx }}
        />
        <table className={`border-collapse text-center relative z-0 ${tableMinW}`}>
          {/* Caption for screen readers */}
          <caption className="sr-only">
            {t.caption.replace('{hours}', String(visibleCount))}
          </caption>

          <thead>
            {/* Hour header row */}
            <tr>
              {/* Sticky label column */}
              <th
                scope="col"
                className={`sticky left-0 z-20 bg-bg-base ${labelW} ${cellPx} text-left ${metaText} font-semibold text-fg border-b-2 border-r-2 border-score-good/30`}
              >
                <div className="flex flex-col gap-0.5">
                  {dayGroups.length > 1 ? (
                    <span className="text-fg truncate max-w-[68px]" title={activeDayLabel}>
                      {activeDayLabel}
                    </span>
                  ) : (
                    <span>{isPt ? 'Dia' : 'Day'}</span>
                  )}
                  <span className="text-fg-muted font-medium">{isPt ? 'Hora' : 'Hour'}</span>
                </div>
              </th>
              {visible.map((h, i) => {
                const current = isCurrentHour(h.time, now);
                const d = new Date(h.time);
                const isNewDay = i === 0 || d.toDateString() !== new Date(visible[i - 1].time).toDateString();
                return (
                  <th
                    key={i}
                    scope="col"
                    className={`sticky top-0 z-10 ${hourW} ${cellPx} font-mono ${metaText} ${
                      current
                        ? 'bg-score-good/20 text-fg border-b-2 border-score-good/40'
                        : isNewDay
                        ? 'bg-surface-2/[0.08] text-fg border-b border-divider-strong'
                        : 'bg-bg-base text-fg-muted border-b border-divider'
                    }`}
                    aria-current={current ? 'time' : undefined}
                  >
                    <div className="flex flex-col items-center">
                      {isNewDay && !compact && (
                        <span className="text-[9px] md:text-[10px] font-semibold text-fg-subtle leading-none mb-0.5">
                          {d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                        </span>
                      )}
                      <span className={compact ? 'text-[10px]' : ''}>{parseHourLabel(h.time)}</span>
                    </div>
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
              className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
            >
              {t.waves}
            </th>
            {visible.map((h, i) => (
              <td
                key={i}
                className={`${hourW} ${cellPx} ${waveBg(h.waveHeight)} font-mono ${numText} ${
                  hoveredCol === i ? 'bg-surface-2/[0.08]' : ''
                } transition-colors duration-fast border-b border-divider/20`}
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
              className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
            >
              {t.period}
            </th>
            {visible.map((h, i) => (
              <td
                key={i}
                className={`${hourW} ${cellPx} ${periodBg(h.wavePeriod)} font-mono ${numText} ${
                  hoveredCol === i ? 'bg-surface-2/[0.08]' : ''
                } transition-colors duration-fast border-b border-divider/20`}
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
              className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
            >
              {t.wind}
            </th>
            {visible.map((h, i) => {
              const windKt = Math.round(h.windSpeed * 1.94384);
              return (
                <td
                  key={i}
                  className={`${hourW} ${cellPx} ${windBg(windKt)} font-mono ${numText} ${windText(
                    windKt,
                  )} ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
                  title={buildTooltip(h, sportLabel)}
                  onMouseEnter={() => setHoveredCol(i)}
                  onMouseLeave={() => setHoveredCol(null)}
                >
                  {windKt}
                </td>
              );
            })}
          </tr>

          {/* ── WIND DIRECTION ── */}
          <tr>
            <th
              scope="row"
              className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
            >
              {t.direction}
            </th>
            {visible.map((h, i) => (
              <td
                key={i}
                className={`${hourW} ${cellPx} ${windDirBg(
                  h.windDirection,
                  coastOrientation,
                )} font-mono ${metaText} ${
                  hoveredCol === i ? 'bg-surface-2/[0.08]' : ''
                } transition-colors duration-fast border-b border-divider/20`}
                title={buildTooltip(h, sportLabel)}
                onMouseEnter={() => setHoveredCol(i)}
                onMouseLeave={() => setHoveredCol(null)}
              >
                <span className="inline-flex items-center gap-0.5">
                  <span>{getWindArrow(h.windDirection)}</span>
                  <span className="hidden md:inline">{getCardinalLabel(h.windDirection)}</span>
                </span>
              </td>
            ))}
          </tr>

          {/* ── GUST (conditional) ── */}
          {hasGust && (
            <tr>
              <th
                scope="row"
                className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
              >
                {t.gust}
              </th>
              {visible.map((h, i) => {
                const gustKt = typeof h.windGust === 'number' ? Math.round(h.windGust * 1.94384) : null;
                return (
                  <td
                    key={i}
                    className={`${hourW} ${cellPx} ${
                      gustKt !== null ? gustBg(gustKt) : 'bg-surface-1/[0.04]'
                    } font-mono ${numText} text-fg-muted ${
                      hoveredCol === i ? 'bg-surface-2/[0.08]' : ''
                    } transition-colors duration-fast border-b border-divider/20`}
                    title={buildTooltip(h, sportLabel)}
                    onMouseEnter={() => setHoveredCol(i)}
                    onMouseLeave={() => setHoveredCol(null)}
                  >
                    {gustKt !== null ? gustKt : '—'}
                  </td>
                );
              })}
            </tr>
          )}

          {/* ── WATER TEMP (conditional) ── */}
          {hasWaterTemp && (
            <tr>
              <th
                scope="row"
                className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
              >
                {t.water}
              </th>
              {visible.map((h, i) => (
                <td
                  key={i}
                  className={`${hourW} ${cellPx} ${
                    typeof h.waterTemp === 'number'
                      ? waterBg(h.waterTemp)
                      : 'bg-surface-1/[0.04]'
                  } font-mono ${numText} ${
                    typeof h.waterTemp === 'number'
                      ? waterText(h.waterTemp)
                      : 'text-fg-subtle'
                  } ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
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

          {/* ── TIDE (conditional) ── */}
          {hasTide && (
            <tr>
              <th
                scope="row"
                className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
              >
                {t.tide}
              </th>
              {visible.map((h, i) => (
                <td
                  key={i}
                  className={`${hourW} ${cellPx} ${
                    typeof h.tideHeight === 'number'
                      ? h.tideHeight > 0.3 ? 'bg-data-waves/20' : h.tideHeight < -0.3 ? 'bg-data-waves/10' : 'bg-surface-1/[0.04]'
                      : 'bg-surface-1/[0.04]'
                  } font-mono ${numText} ${
                    typeof h.tideHeight === 'number' ? (h.tideHeight > 0.3 ? 'text-data-waves' : 'text-fg-muted') : 'text-fg-subtle'
                  } ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
                  onMouseEnter={() => setHoveredCol(i)}
                  onMouseLeave={() => setHoveredCol(null)}
                >
                  {typeof h.tideHeight === 'number' ? h.tideHeight.toFixed(1) : '—'}
                </td>
              ))}
            </tr>
          )}

          {/* ── SCORE (conditional, heavy visual weight) ── */}
          {hasAnyScore && (
            <tr className="border-t-2 border-divider-strong">
              <th
                scope="row"
                className={`sticky left-0 z-10 bg-bg-base ${labelW} ${cellPx} text-left text-meta-xs md:text-meta-sm text-fg font-semibold border-r-2 border-t border-b border-divider`}
              >
                {sportLabel ?? t.score}
              </th>
              {visible.map((h, i) => {
                const hasScore = typeof h.score === 'number';
                const variant = hasScore ? scoreVariant(h.score!) : '--score-closed';
                return (
                  <td
                    key={i}
                    className={`${hourW} ${cellPx} font-mono ${numText} font-semibold ${
                      hoveredCol === i ? 'bg-surface-2/[0.08]' : ''
                    } transition-colors duration-fast border-b border-divider/20`}
                    style={
                      hasScore
                        ? ({
                            backgroundColor: `rgb(var(${variant}) / 0.35)`,
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
 *
 *  2.  Sticky behaviour:
 *      • First column (labels) stays visible during horizontal scroll.
 *      • Header row (hours) stays visible during vertical scroll.
 *      • z-index layering: label col z-20 over header z-10 in corner.
 *
 *  3.  Current hour highlight:
 *      • Column matching current system hour gets surface-2 bg +
 *        border-b-2 border-score-good + text-fg (not muted).
 *
 *  4.  Colour semantics:
 *      • Wave cells: flat → small → rideable → good → big (increasing blue).
 *      • Wind cells: light → useful → strong → alarming (increasing amber).
 *      • Direction cells: offshore tint green, onshore tint red, cross neutral.
 *      • Water cells: cold → mild → warm (increasing teal).
 *      • Score cells: epic/good/fair/poor/closed colours via CSS var.
 *
 *  5.  Conditional rows:
 *      • No gust data anywhere → gust row completely omitted.
 *      • No water temp anywhere → water row omitted.
 *      • No score anywhere → score row omitted (heavy row, don't waste space).
 *      • Partial score data → score row shown, missing cells show "—".
 *
 *  6.  Mobile (320px-375px):
 *      • Overflow-x scrolls smoothly, first column sticky.
 *      • Compact mode: smaller padding + narrower hour columns.
 *
 *  7.  Accessibility:
 *      • <caption> sr-only for screen readers.
 *      • <th scope="col"> for hour headers, <th scope="row"> for labels.
 *      • aria-current="time" on current hour header.
 *      • title tooltips on every data cell with full info.
 *      • Keyboard focusable wrapper (tabIndex={0}).
 *
 *  8.  Hover column:
 *      • Hover any cell → entire column highlights with surface-2 bg.
 *      • Transition 120ms (duration-fast).
 *      • Respects prefers-reduced-motion via globals.css.
 *
 *  9.  Hours cap:
 *      • MAX_HOURS = 120. Passing hours={168} internally caps to 120.
 *      • Day picker provides navigation across days.
 *
 *  10. Sport label:
 *      • Score row header uses translated sport name when sport prop given.
 *      • Falls back to generic "Score" label.
 *
 *  11. Arrow convention:
 *      • Arrow points WHERE wind goes (meteorological output direction).
 *      • Cardinal label shows where wind comes FROM.
 *      • Example: wind from N (0°) → arrow ↓ (goes S) + label "N".
 */
