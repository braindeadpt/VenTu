'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Spot } from '@/types';
import { getTranslation } from '@/lib/i18n';
import { spotWindows } from '@/lib/spotWindows';
import { spotTimelineScore } from '@/lib/spotTimelineScore';
import { sunTimes } from '@/lib/verdict/sunTimes';
import { scoreBand } from '@/lib/verdict/scoreBand';
import {
  formatDayShort,
  formatHourLabel,
  formatHourLong,
} from '@/lib/verdict/formatHourLabel';
import { formatWindowLabel } from '@/lib/verdict/formatWindowLabel';
import { cn } from '@/lib/cn';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
  useSpotTimelineVisibility,
} from '@/components/spots/timeline/useSpotTimeline';

/** Altura do viewBox da régua (px de render = h-16). */
const TRACK_H = 64;
/** PageUp/PageDown saltam ±6 h (contrato). */
const PAGE_STEP = 6;
/** Debounce do aria-live durante o arrasto. */
const ANNOUNCE_MS = 450;
/** Limiar «Bom» — tracejado e janelas partilham este corte. */
const GOOD_THRESHOLD = 60;
/** Horas do eixo são wall-time Europe/Lisbon (Open-Meteo). */
const SPOT_TZ = 'Europe/Lisbon';

interface SpotTimeRailProps {
  spot: Spot;
  locale: string;
  /** «Quando ir» — título da secção. */
  title: string;
}

const clampN = (v: number, n: number) => Math.max(0, Math.min(v, Math.max(0, n - 1)));

/**
 * §3 do contrato — régua de 48 h. Barras neutras por hora (a escolhida em
 * --verdict), tracejado no 60, noite sombreada por nascer/pôr real (NOAA),
 * janelas de spotWindows com parêntese fino + etiqueta «melhor». Um único
 * slider acessível comanda o eixo partilhado: pointer (capture + pan-y),
 * setas/Home/End/PageUp/PageDown, «Agora» e «Reproduzir 48 h».
 */
export default function SpotTimeRail({ spot, locale, title }: SpotTimeRailProps) {
  const isPt = locale === 'pt';
  const tv = getTranslation(locale).spotPageVerdict;
  const { hours, scores, nowIndex, nowScore, windowStart, windowEnd } =
    useSpotTimelineData();
  const {
    index,
    setIndex,
    isNow,
    goNow,
    playing,
    setPlaying,
    setScrubbing,
  } = useSpotTimelineIndex();

  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  useSpotTimelineVisibility(rootRef);

  // Se a régua desmontar a meio de um arrasto, o autoplay não fica pausado
  // para sempre — liberta o flag de scrub.
  useEffect(() => () => setScrubbing(false), [setScrubbing]);

  const n = Math.max(0, windowEnd - windowStart);
  const winHours = useMemo(
    () => hours.slice(windowStart, windowEnd),
    [hours, windowStart, windowEnd],
  );
  const selLocal = clampN(index - windowStart, n);
  // A escolha pode estar fora da janela de 48 h (ex.: clicada na tabela de
  // previsão — S3). Nesse caso nenhuma barra fica marcada — nunca se
  // acende a barra errada com um índice clampado.
  const selInWindow = index >= windowStart && index < windowEnd;

  // Score mostrado por barra — «agora» usa o score corrigido (o mesmo número
  // que o veredicto mostra), as outras horas o score canónico.
  const barScore = (gi: number) =>
    spotTimelineScore({ index: gi, nowIndex, scores, nowScore }) ?? 0;

  const selScore = spotTimelineScore({ index, nowIndex, scores, nowScore });
  const selHour = hours[index];
  const selBand = scoreBand(selScore ?? 0);
  const valueText = selHour
    ? `${formatHourLong(selHour, locale)}: ${tv.scoreWord} ${selScore ?? 0}, ${(
        isPt ? selBand.labelPt : selBand.labelEn
      ).toUpperCase()}`
    : '';

  // aria-live com debounce — durante o arrasto só anuncia depois de ~450 ms
  // parado, para não inundar o leitor de ecrã.
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setAnnounce(valueText), ANNOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [valueText]);

  // Noite real por dia civil: nascer/pôr NOAA (lat/lon do spot) → minutos
  // locais; a hora é noite se estiver antes do nascer ou a partir do pôr.
  const nightFlags = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: SPOT_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const toMin = (d: Date) => {
      const s = fmt.format(d);
      return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    };
    const cache = new Map<string, { rise: number; set: number } | null>();
    return winHours.map((h) => {
      const date = h.slice(0, 10);
      if (!cache.has(date)) {
        const s = sunTimes(date, spot.lat, spot.lon, SPOT_TZ);
        cache.set(date, s ? { rise: toMin(s.sunrise), set: toMin(s.sunset) } : null);
      }
      const sun = cache.get(date);
      if (!sun) return false;
      const mins = Number(h.slice(11, 13)) * 60 + Number(h.slice(14, 16));
      return mins < sun.rise || mins >= sun.set;
    });
  }, [winHours, spot.lat, spot.lon]);

  // Janelas ≥60 sobre o eixo completo, cortadas à janela visível.
  const visibleWindows = useMemo(
    () =>
      spotWindows(scores, GOOD_THRESHOLD)
        .filter((w) => w.endIdx >= windowStart && w.startIdx < windowEnd)
        .map((w) => ({
          ...w,
          s: Math.max(w.startIdx, windowStart) - windowStart,
          e: Math.min(w.endIdx, windowEnd - 1) - windowStart,
        })),
    [scores, windowStart, windowEnd],
  );
  const bestWindow = visibleWindows[0];

  const indexFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || n <= 0) return windowStart;
    const r = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return windowStart + Math.min(n - 1, Math.floor(frac * n));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (n <= 0) return;
    draggingRef.current = true;
    setScrubbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    setIndex(indexFromClientX(e.clientX));
    trackRef.current?.focus();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setIndex(indexFromClientX(e.clientX));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setScrubbing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const clampWin = (i: number) =>
      Math.max(windowStart, Math.min(i, windowEnd - 1));
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = clampWin(index - 1);
    else if (e.key === 'ArrowRight') next = clampWin(index + 1);
    else if (e.key === 'Home') next = windowStart;
    else if (e.key === 'End') next = windowEnd - 1;
    else if (e.key === 'PageUp') next = clampWin(index - PAGE_STEP);
    else if (e.key === 'PageDown') next = clampWin(index + PAGE_STEP);
    if (next === null) return;
    e.preventDefault();
    setIndex(next);
  };

  if (n <= 0) return null;
  const nowLocal = nowIndex >= windowStart && nowIndex < windowEnd ? nowIndex - windowStart : -1;
  const thrY = TRACK_H * (1 - GOOD_THRESHOLD / 100);

  return (
    <section
      id="quando"
      ref={rootRef}
      aria-labelledby="spot-rail-title"
      className="scroll-mt-32 max-w-6xl mx-auto px-4 pt-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="spot-rail-title" className="font-display text-lg font-semibold text-fg">
          {title}
          <span className="text-fg-muted font-normal text-meta-sm"> · {tv.range48}</span>
        </h2>
        <div className="flex items-center gap-2">
          {nowIndex >= 0 && !isNow && (
            <button
              type="button"
              onClick={goNow}
              className="inline-flex items-center min-h-[44px] px-3 -my-2 rounded-input border border-divider-strong text-meta-sm font-medium text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors duration-150"
            >
              {tv.nowLabel}
            </button>
          )}
          <button
            type="button"
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 -my-2 rounded-input border border-divider-strong text-meta-sm font-medium text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors duration-150"
          >
            {playing ? (
              <Pause className="w-3.5 h-3.5" aria-hidden />
            ) : (
              <Play className="w-3.5 h-3.5" aria-hidden />
            )}
            {playing ? tv.pause : tv.play48}
          </button>
        </div>
      </div>

      {/* Etiqueta «melhor» + marcador Agora — faixa por cima da régua. */}
      <div className="relative h-5 mt-1 text-meta-sm" aria-hidden>
        {bestWindow && (
          <span
            className="absolute top-0 whitespace-nowrap font-medium text-fg-muted"
            style={{
              left: `${(((bestWindow.s + bestWindow.e + 1) / 2) / n) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            {tv.bestTag}:{' '}
            {formatWindowLabel(
              hours,
              bestWindow.startIdx,
              bestWindow.endIdx,
              bestWindow.peakIdx,
              bestWindow.peakScore,
              windowStart,
              windowEnd,
              locale,
            )}
          </span>
        )}
        {nowLocal >= 0 && (
          <span
            className="absolute top-0 whitespace-nowrap font-medium text-fg"
            style={{
              left: `${((nowLocal + 0.5) / n) * 100}%`,
              transform:
                nowLocal === 0
                  ? 'none'
                  : nowLocal >= n - 1
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
          >
            {tv.nowLabel}
          </span>
        )}
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={tv.railLabel}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={selLocal}
        aria-valuetext={valueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="relative h-16 cursor-ew-resize select-none touch-pan-y rounded-input"
      >
        <svg
          viewBox={`0 0 ${n} ${TRACK_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block w-full h-full"
        >
          {winHours.map((h, i) =>
            nightFlags[i] ? (
              <rect
                key={`n${h}`}
                x={i}
                y={0}
                width={1}
                height={TRACK_H}
                fill="currentColor"
                fillOpacity={0.055}
                className="text-fg"
              />
            ) : null,
          )}
          {/* Janelas ≥60: parêntese fino no topo da régua. */}
          {visibleWindows.map((w) => (
            <path
              key={`w${w.startIdx}-${w.endIdx}`}
              d={`M ${w.s + 0.08} 6.5 L ${w.s + 0.08} 3 L ${w.e + 0.92} 3 L ${w.e + 0.92} 6.5`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="text-fg-muted"
            />
          ))}
          {/* Barras por hora — neutras; a escolhida em --verdict. */}
          {winHours.map((h, i) => {
            const gi = windowStart + i;
            const s = barScore(gi);
            const selected = selInWindow && i === selLocal;
            return (
              <rect
                key={h}
                x={i + 0.12}
                y={0}
                width={0.76}
                height={TRACK_H}
                fill={selected ? 'var(--verdict)' : 'currentColor'}
                fillOpacity={selected ? 0.95 : s >= GOOD_THRESHOLD ? 0.5 : 0.28}
                className={cn(
                  'text-fg-subtle',
                  'transition-[transform,fill] duration-200 motion-reduce:transition-none',
                )}
                style={{
                  transform: `scaleY(${Math.max(0.02, s / 100)})`,
                  transformOrigin: '50% 100%',
                  transformBox: 'fill-box',
                }}
              />
            );
          })}
          {/* Limiar 60 — tracejado POR CIMA das barras (depois no SVG), com
              contraste alto nos dois temas e sem capturar ponteiro. */}
          <line
            x1={0}
            x2={n}
            y1={thrY}
            y2={thrY}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="4 3"
            strokeOpacity={0.6}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            className="text-fg"
          />
          {/* Linha «agora» — marca do relógio, não da escolha. */}
          {nowLocal >= 0 && (
            <line
              x1={nowLocal + 0.5}
              x2={nowLocal + 0.5}
              y1={0}
              y2={TRACK_H}
              stroke="currentColor"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              className="text-fg"
            />
          )}
          {/* Tique da hora escolhida na base — só dentro da janela. */}
          {selInWindow && (
            <rect
              x={selLocal + 0.1}
              y={TRACK_H - 2.5}
              width={0.8}
              height={2.5}
              fill="var(--verdict)"
            />
          )}
        </svg>
        <span
          aria-hidden
          className="absolute left-1 font-mono text-[10px] tabular-nums text-fg-subtle pointer-events-none"
          style={{ top: `${(1 - GOOD_THRESHOLD / 100) * 100}%`, transform: 'translateY(-50%)' }}
        >
          {GOOD_THRESHOLD}
        </span>
      </div>

      {/* Rótulos: mudança de dia («qui 17») e horas de 6 em 6. */}
      <div className="relative h-4 mt-1 text-meta-sm text-fg-subtle" aria-hidden>
        {winHours.map((h, i) => {
          const dayChange = i === 0 || h.slice(0, 10) !== winHours[i - 1].slice(0, 10);
          const label = dayChange
            ? formatDayShort(h, locale)
            : i % 6 === 0
              ? `${h.slice(11, 13)}h`
              : null;
          if (!label) return null;
          return (
            <span
              key={h}
              className="absolute top-0 whitespace-nowrap font-mono tabular-nums"
              style={{
                left: `${((i + 0.5) / n) * 100}%`,
                transform:
                  i === 0 ? 'none' : i >= n - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {label}
            </span>
          );
        })}
      </div>

      <p className="mt-2 text-meta-sm text-fg-muted">{tv.railHint}</p>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  );
}
