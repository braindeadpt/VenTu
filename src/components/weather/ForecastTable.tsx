'use client';

import { getSportLabel } from '@/lib/homepageSport';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';

import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import {
  getCardinalLabel,
  getWindArrow,
  getWindRelationToCoast,
} from '@/lib/wind';
import { getTranslation, validateLocale } from '@/lib/i18n';
import {
  getTidePhasesForHours,
  TIDE_PHASE_CELL,
  type TidePhase,
} from '@/lib/tideSchedule';
import { findCurrentHourIndex, hourKeyFromOpenMeteo, lisbonHourKeyFromDate } from '@/lib/openMeteoTime';
import { groupForecastDays, type ForecastDayGroup } from '@/lib/forecastTimeline';
import { formatDayShort, formatHourLabel } from '@/lib/verdict/formatHourLabel';
import { getInstrumentFmt } from '@/components/spots/instruments/format';
import {
  waveFactorSuffix,
  type ScoreWaveCorrection,
  type ScoreWaveSource,
} from '@/lib/scoreConditions';

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
  /**
   * Índice global explícito onde a fatia começa — o `nowIndex` do eixo
   * partilhado (SpotTimelineProvider, relógio vivo). Ganha a
   * `startAtCurrentHour`: «Hora a hora» é o detalhe da régua, cuja janela
   * são 48 h a partir de «agora» — a mesma hora, não um relógio paralelo.
   */
  startIndex?: number;
  /**
   * A fatia começa no balde da hora corrente (em vez de `hourly[0]`) —
   * fallback de `startIndex` antes de o eixo aterrar (e em páginas sem
   * provider). Usa o relógio `now` (baked até montar, vivo depois).
   */
  startAtCurrentHour?: boolean;
  sport?: SportType;
  coastOrientation?: number;
  locale: string;
  compact?: boolean;
  /**
   * Origem da altura de onda usada no score actual (boia fresca / viés
   * regional / previsão). Quando é uma correcção (≠ 'forecast'), o rótulo da
   * linha de ondas anexa o sufixo do factor e o tooltip explica que a medição
   * é a referência para as horas seguintes — as células continuam a mostrar a
   * previsão por hora, sem a fingir de medição.
   */
  waveSource?: ScoreWaveSource;
  waveCorrection?: ScoreWaveCorrection | null;
  /**
   * Baked build-time clock (React #418 guard) — the current-hour column and
   * its indicator must reproduce the SSG render on first paint; pass the
   * spot page's freshnessNowMs and leave undefined to use the live clock
   * (e2e fetch path / after mount).
   */
  nowMs?: number;
}

/* ──────────── cap hours ──────────── */
const MAX_HOURS = 120;

/* ──────────── colour helpers (literal classes for Tailwind JIT) ──────────── */

/** Wave height → background tier (low saturation, same-family data-* token). */
function waveBg(h: number): string {
  if (h < 0.5) return 'bg-surface-1/[0.02]';
  if (h < 1.0) return 'bg-data-waves/10';
  if (h < 2.0) return 'bg-data-waves/15';
  if (h < 3.0) return 'bg-data-waves/20';
  return 'bg-data-waves/25';
}

/** Wave period → background tier. */
function periodBg(p: number): string {
  if (p < 6) return 'bg-surface-1/[0.02]';
  if (p < 9) return 'bg-data-period/10';
  if (p < 12) return 'bg-data-period/15';
  return 'bg-data-period/20';
}

/** Wind speed (knots) → background tier. */
function windBg(kt: number): string {
  if (kt < 8) return 'bg-surface-1/[0.02]';
  if (kt < 14) return 'bg-data-wind/8';
  if (kt < 20) return 'bg-data-wind/14';
  if (kt < 28) return 'bg-data-wind/21';
  return 'bg-data-wind/25';
}

/** Wind speed text colour for alarming values (knots). */
function windText(kt: number): string {
  if (kt >= 28) return 'text-data-wind';
  return 'text-fg';
}

/** Gust — same scale as wind but lighter opacity (knots). */
function gustBg(kt: number): string {
  if (kt < 8) return 'bg-surface-1/[0.02]';
  if (kt < 14) return 'bg-data-wind/6';
  if (kt < 20) return 'bg-data-wind/10';
  if (kt < 28) return 'bg-data-wind/16';
  return 'bg-data-wind/20';
}

/** Water temperature → background tier. */
function waterBg(t: number): string {
  if (t < 14) return 'bg-surface-1/[0.02]';
  if (t < 18) return 'bg-data-water/8';
  if (t < 22) return 'bg-data-water/14';
  return 'bg-data-water/20';
}

/** Water temperature text colour. */
function waterText(t: number): string {
  if (t < 14) return 'text-windDir-onshore';
  return 'text-fg';
}

function tidePhaseBg(phase: TidePhase): string {
  if (phase === 'high') return 'bg-data-waves/25';
  if (phase === 'low') return 'bg-surface-2/[0.08]';
  if (phase === 'rising') return 'bg-data-waves/15';
  return 'bg-data-period/15';
}

function tidePhaseText(phase: TidePhase): string {
  if (phase === 'high') return 'text-data-waves font-semibold';
  if (phase === 'low') return 'text-fg-muted';
  return 'text-fg-subtle';
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

/* ──────────── time helpers ────────────
 * As horas são wall-time Open-Meteo (Europe/Lisbon, sem offset) — nunca
 * `new Date(iso)`: o parse local muda com o fuso do browser e quebra a
 * hidratação (React #418). Componentes extraem-se da própria string. */
function parseHourLabel(iso: string): string {
  return `${Number(iso.slice(11, 13))}h`;
}

function isCurrentHour(iso: string, now: Date): boolean {
  return hourKeyFromOpenMeteo(iso) === lisbonHourKeyFromDate(now);
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

/** Medição S3 — renders reais em `window.__ventuFtRenders` (relatório e
 *  spec e2e): o sync da timeline é imperativo, por isso um scrub de N
 *  passos na régua deve manter este contador estável. */
function bumpForecastTableRenderCount() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __ventuFtRenders?: number };
  w.__ventuFtRenders = (w.__ventuFtRenders ?? 0) + 1;
}

/* ═══════════════════════════════════════════════════════════════════════
 *  COMPONENT
 *  ═══════════════════════════════════════════════════════════════════════ */

export default function ForecastTable({
  hourly,
  hours = 24,
  startTime,
  startIndex,
  startAtCurrentHour = false,
  sport,
  coastOrientation,
  locale,
  compact = false,
  waveSource = 'forecast',
  waveCorrection = null,
  nowMs,
}: ForecastTableProps) {
  bumpForecastTableRenderCount();
  const t = getTranslation(locale).forecastTable;
  const isPt = locale === 'pt';

  /* ── cap hours ── */
  const visibleCount = Math.min(hours, MAX_HOURS);
  if (hours > MAX_HOURS && process.env.NODE_ENV === 'development') {
     
    console.warn(
      `ForecastTable: hours capped at ${MAX_HOURS} (received ${hours}). Use day picker to navigate.`,
    );
  }

  /* ── current hour ref ── */
  const now = useMemo(() => (nowMs != null ? new Date(nowMs) : new Date()), [nowMs]);

  /* ── slice data ──
     visibleStart = offset da fatia dentro de `hourly` (0 sem startTime) —
     os data-tl-col das células guardam o índice GLOBAL da timeline, que o
     sync da SpotForecastSection usa para destaque/selecção sem re-render.
     `startIndex` (nowIndex do eixo partilhado) ganha ao fallback
     `startAtCurrentHour` (relógio baked) — a mesma hora da janela da
     régua (48 h a partir de «agora»). */
  const { visible, visibleStart } = useMemo(() => {
    let startIndex_ = 0;
    if (startTime) {
      // Wall-time Lisboa de startTime (epoch real) — comparação lexicográfica
      // com as strings naive, determinística em qualquer fuso.
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Lisbon',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(startTime);
      const pick = (t: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === t)?.value ?? '00';
      const startKey = `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}`;
      startIndex_ = hourly.findIndex((h) => h.time >= startKey);
      if (startIndex_ === -1) startIndex_ = 0;
    } else if (startIndex != null && startIndex >= 0) {
      // O eixo partilhado manda: a fatia abre na hora corrente do provider
      // (relógio vivo), não no relógio baked deste componente.
      startIndex_ = Math.min(startIndex, Math.max(0, hourly.length - 1));
    } else if (startAtCurrentHour) {
      startIndex_ = findCurrentHourIndex(
        hourly.map((h) => h.time),
        now,
      );
    }
    return {
      visible: hourly.slice(startIndex_, startIndex_ + visibleCount),
      visibleStart: startIndex_,
    };
  }, [hourly, startTime, startIndex, startAtCurrentHour, visibleCount, now]);

  /* ── hover column state ── */
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  /* ── scroll container ref ── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const labelWidthPx = compact ? 72 : 96;

  /* ── find current hour index ──
     Com `startIndex` (nowIndex do eixo partilhado) a coluna «agora» é a do
     índice global — o mesmo instante que a régua marca, não um relógio
     paralelo. Sem provider mantém o relógio `now` (baked→vivo). */
  const isNowCol = useCallback(
    (globalIdx: number, iso: string) =>
      startIndex != null && startIndex >= 0
        ? globalIdx === startIndex
        : isCurrentHour(iso, now),
    [startIndex, now],
  );
  const currentHourIndex = useMemo(() => {
    if (startIndex != null && startIndex >= 0) {
      const rel = startIndex - visibleStart;
      return rel >= 0 && rel < visible.length ? rel : -1;
    }
    return visible.findIndex((h) => isCurrentHour(h.time, now));
  }, [visible, visibleStart, startIndex, now]);

  // UX v3 §5: contorno da coluna «agora» = fg a 30% (classe em globals.css).
  const nowCol = useCallback(
    (i: number) =>
      currentHourIndex >= 0 && i === currentHourIndex ? 'forecast-col-now' : '',
    [currentHourIndex],
  );

  const labelW = compact ? 'w-[72px] min-w-[72px]' : 'w-[96px] min-w-[96px]';
  const hourW = compact ? 'w-[28px] min-w-[28px] max-w-[28px]' : 'min-w-[40px]';

  /* ── scroll to current hour on mount ── */
  useEffect(() => {
    if (scrollRef.current && currentHourIndex >= 0) {
      const container = scrollRef.current;
      const timer = setTimeout(() => {
        const labelWidth = labelWidthPx;
        const dataStart = labelWidth;
        const cellWidth = (container.scrollWidth - labelWidth) / visible.length;
        const cellCenter = dataStart + currentHourIndex * cellWidth + cellWidth / 2;
        const targetLeft = cellCenter - container.clientWidth / 2;
        container.scrollLeft = Math.max(0, targetLeft);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [currentHourIndex, visible.length, labelWidthPx]);

  const dayGroups = useMemo(() => groupForecastDays(visible, locale), [visible, locale]);

  // Colunas que abrem um novo dia civil — separador vertical da spec §5.
  const dayStart = useMemo(
    () =>
      visible.map(
        (h, i) => i === 0 || h.time.slice(0, 10) !== visible[i - 1].time.slice(0, 10),
      ),
    [visible],
  );

  // UX v3 §5 — chips de dia relativos: «Hoje · Amanhã · qui 25 …». O dia
  // civil compara-se em wall-time Lisboa com o relógio baked (`now`).
  const tCommon = getTranslation(locale).common;
  const todayKey = lisbonHourKeyFromDate(now).slice(0, 10);
  const tomorrowKey = lisbonHourKeyFromDate(
    new Date(now.getTime() + 86_400_000),
  ).slice(0, 10);
  const dayChipLabel = useCallback(
    (g: ForecastDayGroup) =>
      g.day === todayKey
        ? tCommon.today
        : g.day === tomorrowKey
          ? tCommon.tomorrow
          : g.shortLabel,
    [todayKey, tomorrowKey, tCommon.today, tCommon.tomorrow],
  );

  /* Dia activo — IMPERATIVO (data-active no chip + texto no canto sticky):
     o scroll que acompanha a hora escolhida não pode re-renderizar a
     tabela (0 renders por passo de scrub — UX v3 §5, medido em
     window.__ventuFtRenders). */
  const chipsRef = useRef<HTMLDivElement>(null);
  const cornerDayRef = useRef<HTMLSpanElement>(null);
  const mobileDayRef = useRef<HTMLParagraphElement>(null);

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

  /* Aplica o dia activo por DOM: marca o chip (data-active) e actualiza o
     rótulo do canto sticky + o rótulo mobile — sem state, sem re-render. */
  const applyActiveDay = useCallback(
    (idx: number) => {
      const g = dayGroups[idx];
      if (!g) return;
      const label = dayChipLabel(g);
      chipsRef.current
        ?.querySelectorAll('[data-day-chip]')
        .forEach((el, i) => {
          if (i === idx) el.setAttribute('data-active', '');
          else el.removeAttribute('data-active');
        });
      for (const el of [cornerDayRef.current, mobileDayRef.current]) {
        if (!el) continue;
        if (el.textContent !== label) el.textContent = label;
        if (el instanceof HTMLElement && el.title !== label) el.title = label;
      }
    },
    [dayGroups, dayChipLabel],
  );

  const scrollToDayGroup = (groupIndex: number) => {
    const group = dayGroups[groupIndex];
    if (!group || !scrollRef.current) return;
    applyActiveDay(groupIndex);
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
      applyActiveDay(dayIndexForColumn(currentHourIndex));
    }
  }, [currentHourIndex, dayGroups.length, dayIndexForColumn, applyActiveDay]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || dayGroups.length === 0) return;

    const onScroll = () => {
      const col = getColumnIndexAtScroll(el.scrollLeft, el.clientWidth, el.scrollWidth);
      applyActiveDay(dayIndexForColumn(col));
    };

    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [dayGroups.length, getColumnIndexAtScroll, dayIndexForColumn, applyActiveDay]);

  /* ── row presence checks ── */
  const hasGust = visible.some((h) => typeof h.windGust === 'number');
  const hasWaterTemp = visible.some((h) => typeof h.waterTemp === 'number');
  const hasTide = visible.some((h) => typeof h.tideHeight === 'number');
  const tidePhases = useMemo(
    () => (hasTide ? getTidePhasesForHours(visible) : []),
    [visible, hasTide],
  );
  const hasAnyScore = visible.some((h) => typeof h.score === 'number');

  /* ── sport label for score row ── */
  const sportLabel = sport
    ? getSportLabel(sport, locale)
    : undefined;

  /* ── mobile (<768 px): lista vertical «Hora a hora» — UX v3 §5 ── */
  if (compact) {
    return (
      <ForecastHourlyList
        visible={visible}
        visibleStart={visibleStart}
        locale={locale}
        sportLabel={sportLabel}
        caption={t.caption.replace('{hours}', String(visible.length))}
        now={now}
        nowIndex={startIndex}
      />
    );
  }

  /* ── wave-correction title for the waves row label ── */
  const ftT = getTranslation(locale).spotsUi;
  const wavesRowTitle =
    waveSource === 'observed' && waveCorrection?.buoyName
      ? ftT.wavesTitleBuoy.replace('{name}', waveCorrection.buoyName)
      : waveSource === 'bias-corrected'
        ? ftT.wavesTitleBias
        : undefined;

  /* ── cell dimensions ── */
  const cellPx = compact ? 'px-0.5 py-0.5' : 'px-2 py-1';
  const labelCellPx = compact ? 'pl-2 pr-1 py-0.5' : 'px-2 py-1';
  // UX v3 §5 — tipo 13 px mono nas células de dados (a linha fica com
  // 36 px via globals.css .forecast-table-scroll tbody).
  const numText = compact ? 'text-[10px] leading-tight' : 'text-[13px]';
  const metaText = compact ? 'text-[9px] leading-tight' : 'text-meta-xs md:text-meta-sm';
  const tableMinW = compact ? 'w-max' : 'min-w-[600px] md:min-w-[800px]';
  // Dia activo no primeiro paint (determinístico — `now` é baked); o
  // scroll passa a geri-lo por DOM via applyActiveDay.
  const initialDayGroupIndex =
    dayGroups.length === 0
      ? -1
      : currentHourIndex >= 0
        ? dayIndexForColumn(currentHourIndex)
        : 0;
  const activeDayLabel =
    initialDayGroupIndex >= 0 ? dayChipLabel(dayGroups[initialDayGroupIndex]) : '';

  return (
    <div className="space-y-2">
      {/* Current time indicator */}
{currentHourIndex >= 0 && (
        <div className="flex items-center gap-2 text-meta text-fg-muted px-1">
          <span className="w-2 h-2 rounded-full bg-score-good motion-reduce:animate-none animate-pulse" />
          <span>{t.currentTime} — {t.scrollForMore}</span>
        </div>
      )}

      {dayGroups.length > 1 && (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <p
            ref={mobileDayRef}
            className="text-meta-sm font-semibold text-fg px-0.5 md:hidden"
          >
            {activeDayLabel}
          </p>
          <div ref={chipsRef} className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
            {dayGroups.map((group, i) => (
              <button
                key={group.day}
                type="button"
                data-day-chip
                data-active={i === initialDayGroupIndex ? '' : undefined}
                onClick={() => scrollToDayGroup(i)}
                className="inline-flex min-h-11 items-center px-2.5 rounded-pill text-meta-sm whitespace-nowrap shrink-0 transition-all bg-surface-1/[0.04] text-fg-muted border border-divider hover:bg-surface-2/[0.08] data-[active]:bg-score-good/20 data-[active]:text-score-good data-[active]:border-score-good/30 data-[active]:font-semibold"
              >
                {dayChipLabel(group)}
              </button>
            ))}
          </div>
        </div>
      )}

<div className="rounded-card max-w-full">
      <div
        ref={scrollRef}
        className={`forecast-table-scroll overflow-x-auto overscroll-x-contain border border-divider bg-bg-base relative rounded-card max-w-full max-md:snap-x max-md:snap-proximity [scrollbar-color:rgb(var(--fg-disabled))_transparent]`}
        data-tl-start={visibleStart}
        data-tl-count={visible.length}
        tabIndex={0}
        role="region"
        aria-label={t.caption.replace('{hours}', String(visibleCount))}
        onWheel={(e) => {
          if (window.matchMedia('(pointer: coarse)').matches) return;
          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) {
            e.preventDefault();
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        <table className={`border-collapse text-center ${tableMinW}`}>
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
                className={`forecast-sticky-corner ${labelW} ${labelCellPx} text-left ${metaText} font-semibold text-fg border-b-2 border-r-2 border-score-good/30`}
              >
                <div className="flex flex-col gap-0.5">
                  {dayGroups.length > 1 ? (
                    <span
                      ref={cornerDayRef}
                      className="text-fg truncate max-w-[68px]"
                      title={activeDayLabel}
                    >
                      {activeDayLabel}
                    </span>
                  ) : (
                    <span>{t.day}</span>
                  )}
                  <span className="text-fg-muted font-medium">{t.hour}</span>
                </div>
              </th>
              {visible.map((h, i) => {
                const current = isNowCol(visibleStart + i, h.time);
                const isNewDay = i === 0 || h.time.slice(0, 10) !== visible[i - 1].time.slice(0, 10);
                return (
                  <th
                    key={i}
                    scope="col"
                    data-tl-col={visibleStart + i}
                    className={`sticky top-0 z-20 ${hourW} ${cellPx} font-mono ${metaText} max-md:snap-start ${nowCol(i)} ${
                      isNewDay ? 'forecast-col-daystart' : ''
                    } ${
                      current
                        ? 'bg-accent/12 text-fg font-semibold'
                        : isNewDay
                        ? 'bg-surface-2/[0.08] text-fg border-b border-divider-strong'
                        : 'bg-bg-base text-fg-muted border-b border-divider'
                    }`}
                    aria-current={current ? 'time' : undefined}
                  >
                    <div className="flex flex-col items-center">
                      {isNewDay && !compact && (
                        <span className="text-[11px] font-semibold text-fg-subtle leading-none mb-0.5">
                          {formatDayShort(h.time, locale)}
                        </span>
                      )}
                      <span className={compact ? 'text-[10px]' : ''}>{parseHourLabel(h.time)}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

        <tbody data-visual-dynamic>
          {/* ── SCORE (primeira linha — UX v3 §5) ── */}
          {hasAnyScore && (
            <tr>
              <th
                scope="row"
                className={`forecast-sticky-label ${labelW} ${labelCellPx} text-left text-meta-xs md:text-meta-sm text-fg font-semibold border-r-2 border-b border-divider`}
              >
                {sportLabel ?? t.score}
              </th>
              {visible.map((h, i) => {
                const hasScore = typeof h.score === 'number';
                const variant = hasScore ? scoreVariant(h.score!) : '--score-closed';
                return (
                  <td
                    key={i}
                    data-tl-col={visibleStart + i}
                    className={`${hourW} ${cellPx} max-md:snap-start ${nowCol(i)} font-mono ${numText} font-semibold ${
                      dayStart[i] ? 'forecast-col-daystart' : ''
                    } ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
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

          {/* ── WAVES ── */}
          <tr>
            <th
              scope="row"
              className={`forecast-sticky-label ${labelW} ${labelCellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
            >
              <span
                className="inline-flex items-center gap-1"
                data-wave-correction={waveSource !== 'forecast' ? waveSource : undefined}
                title={wavesRowTitle}
              >
                {t.waves}
                {waveFactorSuffix(waveSource, locale)}
              </span>
            </th>
            {visible.map((h, i) => (
              <td
                key={i}
                data-tl-col={visibleStart + i}
                className={`${hourW} ${cellPx} max-md:snap-start ${nowCol(i)} ${waveBg(h.waveHeight)} font-mono ${numText} ${
                  dayStart[i] ? 'forecast-col-daystart' : ''
                } ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
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
              className={`forecast-sticky-label ${labelW} ${labelCellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
            >
              {t.period}
            </th>
            {visible.map((h, i) => (
              <td
                key={i}
                data-tl-col={visibleStart + i}
                className={`${hourW} ${cellPx} max-md:snap-start ${nowCol(i)} ${periodBg(h.wavePeriod)} font-mono ${numText} ${
                  dayStart[i] ? 'forecast-col-daystart' : ''
                } ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
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
              className={`forecast-sticky-label ${labelW} ${labelCellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
            >
              {t.wind}
            </th>
            {visible.map((h, i) => {
              const windKt = Math.round(h.windSpeed * 1.94384);
              return (
                <td
                  key={i}
                  data-tl-col={visibleStart + i}
                  className={`${hourW} ${cellPx} max-md:snap-start ${nowCol(i)} ${windBg(windKt)} font-mono ${numText} ${windText(
                    windKt,
                  )} ${dayStart[i] ? 'forecast-col-daystart' : ''} ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
                  title={buildTooltip(h, sportLabel)}
                  onMouseEnter={() => setHoveredCol(i)}
                  onMouseLeave={() => setHoveredCol(null)}
                >
                  {windKt}
                </td>
              );
            })}
          </tr>

          {/* ── GUST (conditional) ── */}
          {hasGust && (
            <tr>
              <th
                scope="row"
                className={`forecast-sticky-label ${labelW} ${labelCellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
              >
                {t.gust}
              </th>
              {visible.map((h, i) => {
                const gustKt = typeof h.windGust === 'number' ? Math.round(h.windGust * 1.94384) : null;
                return (
                  <td
                    key={i}
                    data-tl-col={visibleStart + i}
                    className={`${hourW} ${cellPx} max-md:snap-start ${nowCol(i)} ${
                      gustKt !== null ? gustBg(gustKt) : 'bg-surface-1/[0.04]'
                    } font-mono ${numText} text-fg-muted ${
                      dayStart[i] ? 'forecast-col-daystart' : ''
                    } ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
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

          {/* ── WIND DIRECTION ── */}
          <tr>
            <th
              scope="row"
              className={`forecast-sticky-label ${labelW} ${labelCellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
            >
              {t.direction}
            </th>
            {visible.map((h, i) => (
              <td
                key={i}
                data-tl-col={visibleStart + i}
                  className={`${hourW} ${cellPx} max-md:snap-start ${nowCol(i)} ${windDirBg(
                  h.windDirection,
                  coastOrientation,
                )} font-mono ${numText} ${
                  dayStart[i] ? 'forecast-col-daystart' : ''
                } ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
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

          {/* ── TIDE (conditional) ── */}
          {hasTide && (
            <tr>
              <th
                scope="row"
                className={`forecast-sticky-label ${labelW} ${labelCellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
              >
                {t.tide}
              </th>
              {visible.map((h, i) => {
                const phase = tidePhases[i];
                const label =
                  phase != null
                    ? TIDE_PHASE_CELL[phase][validateLocale(locale)]
                    : '—';
                const phaseTitle =
                  phase != null
                    ? {
                        high: getTranslation(locale).tideLabels.high,
                        low: getTranslation(locale).tideLabels.low,
                        rising: getTranslation(locale).tideLabels.rising,
                        falling: getTranslation(locale).tideLabels.falling,
                      }[phase]
                    : undefined;
                return (
                  <td
                    key={i}
                    data-tl-col={visibleStart + i}
                    className={`${hourW} ${cellPx} max-md:snap-start ${nowCol(i)} ${
                      phase ? tidePhaseBg(phase) : 'bg-surface-1/[0.04]'
                    } ${metaText} ${phase ? tidePhaseText(phase) : 'text-fg-subtle'} ${
                      dayStart[i] ? 'forecast-col-daystart' : ''
                    } ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
                    aria-label={phaseTitle}
                    title={phaseTitle}
                    onMouseEnter={() => setHoveredCol(i)}
                    onMouseLeave={() => setHoveredCol(null)}
                  >
                    {label}
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
                className={`forecast-sticky-label ${labelW} ${labelCellPx} text-left ${metaText} text-fg-subtle font-medium border-r-2 border-divider`}
              >
                {t.water}
              </th>
              {visible.map((h, i) => (
                <td
                  key={i}
                  data-tl-col={visibleStart + i}
                  className={`${hourW} ${cellPx} max-md:snap-start ${nowCol(i)} ${
                    typeof h.waterTemp === 'number'
                      ? waterBg(h.waterTemp)
                      : 'bg-surface-1/[0.04]'
                  } font-mono ${numText} ${
                    typeof h.waterTemp === 'number'
                      ? waterText(h.waterTemp)
                      : 'text-fg-subtle'
                  } ${dayStart[i] ? 'forecast-col-daystart' : ''} ${hoveredCol === i ? 'bg-surface-2/[0.08]' : ''} transition-colors duration-fast border-b border-divider/20`}
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

        </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 *  ForecastHourlyList — mobile (<768 px), UX v3 §5.
 *
 *  Uma linha por hora (56 px), agrupada por dia civil com cabeçalhos
 *  sticky («Quarta, 23»). Mostra as primeiras 24 h e revela +24 por toque
 *  em «Mostrar mais 24 h». A linha escolhida recebe data-tl-selected via
 *  ForecastTimelineSync (imperativo — sem re-render por passo de scrub) e
 *  o toque muda o índice do eixo partilhado pelo mesmo handler delegado
 *  (data-tl-col = índice global).
 *  ═══════════════════════════════════════════════════════════════════════ */

const MOBILE_PAGE_HOURS = 24;

function ForecastHourlyList({
  visible,
  visibleStart,
  locale,
  sportLabel,
  caption,
  now,
  nowIndex,
}: {
  visible: ForecastHour[];
  visibleStart: number;
  locale: string;
  sportLabel?: string;
  caption: string;
  /** Relógio baked — fallback da linha «agora» sem eixo partilhado. */
  now: Date;
  /** Índice «agora» do eixo partilhado — quando definido manda no `now`. */
  nowIndex?: number;
}) {
  const tf = getTranslation(locale).spotPageForecast;
  const tideLabels = getTranslation(locale).tideLabels;
  const fmt = getInstrumentFmt(locale);
  const [shown, setShown] = useState(MOBILE_PAGE_HOURS);
  const shownHours = visible.slice(0, shown);
  const groups = useMemo(
    () => groupForecastDays(shownHours, locale),
    [shownHours, locale],
  );
  const tidePhases = useMemo(
    () => getTidePhasesForHours(shownHours),
    [shownHours],
  );
  const loc = validateLocale(locale);

  return (
    <div
      className="forecast-hourly-list"
      data-tl-start={visibleStart}
      data-tl-count={shownHours.length}
      aria-label={caption}
    >
      {groups.map((g) => (
        <section key={g.day} aria-label={g.longLabel} className="forecast-day-group">
          <h3 className="forecast-day-header m-0 px-3 py-2 text-[13px] font-semibold tracking-[0.04em] text-fg">
            {g.longLabel}
          </h3>
          <ol className="m-0 list-none p-0">
            {shownHours.slice(g.startIndex, g.startIndex + g.count).map((h, j) => {
              const i = g.startIndex + j;
              const windKt = Math.round(h.windSpeed * 1.94384);
              const gustKt =
                typeof h.windGust === 'number'
                  ? Math.round(h.windGust * 1.94384)
                  : null;
              const phase = tidePhases[i];
              const tideTitle =
                phase != null
                  ? {
                      high: tideLabels.high,
                      low: tideLabels.low,
                      rising: tideLabels.rising,
                      falling: tideLabels.falling,
                    }[phase]
                  : undefined;
              // «↑ a encher» / «↓ a vazar»; nos extremos só o nome da maré.
              const tideText =
                phase === 'rising'
                  ? `${TIDE_PHASE_CELL.rising[loc]} ${tf.tideRising}`
                  : phase === 'falling'
                    ? `${TIDE_PHASE_CELL.falling[loc]} ${tf.tideFalling}`
                    : phase === 'high'
                      ? tf.tideHigh
                      : phase === 'low'
                        ? tf.tideLow
                        : '—';
              const score = typeof h.score === 'number' ? h.score : null;
              const variant = score !== null ? scoreVariant(score) : '--score-closed';
              const current =
                nowIndex != null && nowIndex >= 0
                  ? visibleStart + i === nowIndex
                  : isCurrentHour(h.time, now);
              return (
                <li key={h.time}>
                  <button
                    type="button"
                    data-tl-col={visibleStart + i}
                    aria-current={current ? 'time' : undefined}
                    title={buildTooltip(h, sportLabel)}
                    className={`forecast-hourly-row grid min-h-14 w-full grid-cols-[2.75rem_1.75rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b border-divider/40 px-3 text-left transition-colors duration-fast ${
                      current ? 'forecast-col-now' : ''
                    }`}
                  >
                    <span className="font-mono text-[13px] font-medium tabular-nums text-fg">
                      {formatHourLabel(h.time, locale)}
                    </span>
                    <span
                      className="rounded-sm px-0.5 text-center font-mono text-[13px] font-semibold tabular-nums"
                      style={
                        score !== null
                          ? {
                              backgroundColor: `rgb(var(${variant}) / 0.18)`,
                              color: `rgb(var(${variant}))`,
                            }
                          : { color: 'rgb(var(--fg-subtle-rgb))' }
                      }
                    >
                      {score ?? '—'}
                    </span>
                    {/* Onda compacta «1,9 m 12 s» — CORRECCOES-24SET §3:
                        a spec proíbe truncar; se não couber numa linha
                        quebra para duas dentro da célula (56 px cabe) — só
                        entre altura e período, nunca entre número e unidade. */}
                    <span className="min-w-0 font-mono text-[13px] leading-tight tabular-nums text-fg">
                      <span className="whitespace-nowrap">{fmt.f1(h.waveHeight)} m</span>{' '}
                      <span className="whitespace-nowrap">{fmt.f0(h.wavePeriod)} s</span>
                    </span>
                    <span className="whitespace-nowrap font-mono text-[13px] tabular-nums text-fg-muted">
                      {getWindArrow(h.windDirection)} {windKt} kt
                      {gustKt !== null ? ` (${gustKt})` : ''}
                    </span>
                    <span
                      className="whitespace-nowrap font-mono text-[13px] tabular-nums text-fg-muted"
                      title={tideTitle}
                    >
                      {tideText}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {shown < visible.length && (
        <button
          type="button"
          onClick={() => setShown((s) => s + MOBILE_PAGE_HOURS)}
          className="forecast-hourly-more flex min-h-11 w-full items-center justify-center px-3 py-2 text-[13px] font-medium text-fg-muted transition-colors duration-fast hover:text-fg"
        >
          {tf.showMore24}
        </button>
      )}
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
