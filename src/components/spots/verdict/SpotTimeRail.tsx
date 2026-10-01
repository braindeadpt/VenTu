'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Spot } from '@/types';
import { getTranslation } from '@/lib/i18n';
import { spotWindows } from '@/lib/spotWindows';
import { spotTimelineScore } from '@/lib/spotTimelineScore';
import { sunTimes } from '@/lib/verdict/sunTimes';
import { scoreBand } from '@/lib/verdict/scoreBand';
import { getScoreRgb } from '@/lib/scoreThresholds';
import { formatHourLabel, formatHourLong } from '@/lib/verdict/formatHourLabel';
import { formatWindowLabel } from '@/lib/verdict/formatWindowLabel';
import { pickRailAxisLabelsPx, railAxisCandidates } from '@/lib/verdict/railAxisLabels';
import { getWindArrow } from '@/lib/wind';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import { loadForecastForSpot } from '@/lib/spotDataCache';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/lib/cn';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
  useSpotTimelineVisibility,
} from '@/components/spots/timeline/useSpotTimeline';

/** Altura do viewBox da régua (px de render: 104 mobile / 128 desktop). */
const TRACK_H = 64;
/** PageUp/PageDown saltam ±6 h (contrato). */
const PAGE_STEP = 6;
/** Debounce do aria-live durante o arrasto. */
const ANNOUNCE_MS = 450;
/** Limiar «Bom» — tracejado e janelas partilham este corte. */
const GOOD_THRESHOLD = 60;
/** Gap mínimo entre rótulos do eixo, em píxeis (spec §3). */
const AXIS_GAP_PX = 8;
/** Stagger por barra ao mudar de modalidade: 6 ms, teto de 80 ms de delay
 *  (160 ms de animação + 80 = máximo 240 ms no total — spec §7). */
const STAGGER_MS = 6;
const STAGGER_CAP_MS = 80;
/** Horas do eixo são wall-time Europe/Lisbon (Open-Meteo). */
const SPOT_TZ = 'Europe/Lisbon';

interface SpotTimeRailProps {
  spot: Spot;
  locale: string;
  /** «Quando ir» — título da secção. */
  title: string;
}

const clampN = (v: number, n: number) => Math.max(0, Math.min(v, Math.max(0, n - 1)));

/** Métricas por hora para o tooltip da régua (onda/vento da previsão).
 *  `windSpeed` é m/s no ficheiro — converte-se para kt no render. */
interface RailHourMetrics {
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  windDirection: number;
}

/**
 * §3 da spec v3 — a régua de 48 h é a espinha da página. Barras na cor do
 * escalão de cada hora a 28 % (a escolhida a 100 % em --verdict; a hora
 * «agora» com um traço de 1 px em fg), noite sombreada (nascer/pôr NOAA),
 * a janela ≥60 mais forte como faixa --verdict/8 % por trás das barras com
 * a etiqueta «melhor» (pico só dentro da janela visível; «bom quase todo o
 * período» acima de 70 %), tooltip que segue o cursor no desktop
 * (pointer:fine), eixo com anti-colisão em píxeis (canvas measureText) e
 * scaleY com stagger de 6 ms ao mudar de modalidade.
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
  const reducedMotion = usePrefersReducedMotion();

  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
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
  const nowLocal = nowIndex >= windowStart && nowIndex < windowEnd ? nowIndex - windowStart : -1;

  // Score mostrado por barra — «agora» usa o score corrigido (o mesmo número
  // que o veredicto mostra), as outras horas o score canónico.
  const barScore = (gi: number) =>
    spotTimelineScore({ index: gi, nowIndex, scores, nowScore }) ?? 0;

  // Scores mostrados, alinhados com `hours` — a etiqueta da janela procura
  // o pico neste array (bate com a barra que se vê, inclui o «agora»).
  const displayScores = useMemo(
    () => hours.map((_, i) => barScore(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hours, scores, nowIndex, nowScore],
  );

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

  // Janelas ≥60 sobre o eixo completo, cortadas à janela visível. A mais
  // forte (primeira — spotWindows ordena por pico) fica como faixa por
  // trás das barras; as restantes mantêm o parêntese fino.
  const visibleWindows = useMemo(
    () =>
      spotWindows(displayScores, GOOD_THRESHOLD)
        .filter((w) => w.endIdx >= windowStart && w.startIdx < windowEnd)
        .map((w) => ({
          ...w,
          s: Math.max(w.startIdx, windowStart) - windowStart,
          e: Math.min(w.endIdx, windowEnd - 1) - windowStart,
        })),
    [displayScores, windowStart, windowEnd],
  );
  const bestWindow = visibleWindows[0];

  // ── Métricas por hora para o tooltip (onda/vento da previsão) ────────
  // Lê o mesmo ficheiro por-spot que o SpotDetailClient (cache partilhada
  // em spotDataCache) — no caminho live é dedup, no bake é +1 fetch de
  // ~50 KB pós-mount. Se falhar, o tooltip fica só com hora · score.
  const [metrics, setMetrics] = useState<Map<string, RailHourMetrics> | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadForecastForSpot(getConditionsDataId(spot))
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<string, RailHourMetrics>();
        for (const r of rows) {
          m.set(String(r.time), {
            waveHeight: Number(r.waveHeight) || 0,
            wavePeriod: Number(r.wavePeriod) || 0,
            windSpeed: Number(r.windSpeed) || 0,
            windDirection: Number(r.windDirection) || 0,
          });
        }
        setMetrics(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [spot]);

  // ── Tooltip que segue o cursor (só pointer:fine — spec §3) ───────────
  const [tip, setTip] = useState<{ x: number; gi: number } | null>(null);

  // ── Eixo: anti-colisão em píxeis ─────────────────────────────────────
  // Medição no DOM com um probe escondido que replica as classes do eixo
  // (o canvas não aplica `tabular-nums` e subestima dígitos). Antes de
  // montar usa-se uma estimativa mono conservadora — sobrestimar remove
  // etiquetas em vez de as sobrepor; determinístico no SSR.
  const axisCandidates = useMemo(
    () => railAxisCandidates(winHours, locale),
    [winHours, locale],
  );
  const [trackW, setTrackW] = useState(0);
  const [measure, setMeasure] = useState<((s: string) => number) | null>(null);
  // A linha do topo («melhor: …» / «Agora») é sans — medida própria, senão
  // a medida mono sobrestima e o «Agora» cede sem necessidade.
  const topRowRef = useRef<HTMLDivElement>(null);
  const [measureTop, setMeasureTop] = useState<((s: string) => number) | null>(null);
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    // Medição em DOM real — o canvas `measureText` não aplica
    // `font-variant-numeric: tabular-nums` e subestima os dígitos (~6%),
    // o que deixou «qui 24»/«12h» colidirem a 390 px (spec §3). Um span
    // escondido com as mesmas classes mede exactamente o que se renderiza.
    // Fica no <body> para não aparecer como filho extra do eixo/top row.
    const probes: HTMLElement[] = [];
    const makeProbe = (classes: string) => {
      const el = document.createElement('span');
      el.className = classes;
      el.style.cssText =
        'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      probes.push(el);
      return (s: string) => {
        el.textContent = s;
        const w = el.getBoundingClientRect().width;
        el.textContent = '';
        return w;
      };
    };
    let measureAxis: ((s: string) => number) | null = null;
    let measureTopRow: ((s: string) => number) | null = null;
    const update = () => {
      setTrackW(track.getBoundingClientRect().width);
      if (!measureAxis) measureAxis = makeProbe('text-meta-sm font-mono tabular-nums');
      if (!measureTopRow) measureTopRow = makeProbe('text-meta-sm font-medium');
      setMeasure(() => measureAxis);
      setMeasureTop(() => measureTopRow);
    };
    update();
    // O Geist Mono carrega async — `fonts.ready` cobre a carga inicial e
    // `loadingdone` apanha swaps tardios que ocorram depois de `ready`.
    let cancelled = false;
    const remeasure = () => {
      if (!cancelled) update();
    };
    document.fonts?.ready.then(remeasure);
    document.fonts?.addEventListener?.('loadingdone', remeasure);
    const ro = new ResizeObserver(update);
    ro.observe(track);
    return () => {
      cancelled = true;
      ro.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', remeasure);
      probes.forEach((el) => el.remove());
    };
  }, [locale]);

  const axisLabels = useMemo(() => {
    const w = trackW || 720; // estimativa pré-mount — o observer corrige
    const m = measure ?? ((s: string) => s.length * 7.4);
    return pickRailAxisLabelsPx(
      axisCandidates,
      n,
      (i) => ((i + 0.5) / n) * w,
      m,
      AXIS_GAP_PX,
    );
  }, [axisCandidates, n, trackW, measure]);

  // Etiquetas da linha do topo («melhor: …» + «Agora») — posição em píxeis
  // com a mesma medida do eixo. A etiqueta da janela fica clampada às bordas
  // (centrada na janela mas nunca fora da régua) e o marcador «Agora» cede
  // quando as caixas colidem — o traço de 1 px na régua já marca o «agora».
  const topRow = useMemo(() => {
    const w = trackW || 720;
    const m = measureTop ?? ((s: string) => s.length * 6.6);
    let win: { text: string; left: number; right: number } | null = null;
    if (bestWindow) {
      const lbl = formatWindowLabel(
        hours,
        displayScores,
        bestWindow,
        windowStart,
        windowEnd,
        locale,
      );
      if (lbl) {
        const text = `${tv.bestTag}: ${lbl}`;
        const lw = m(text);
        const cx = (((bestWindow.s + bestWindow.e + 1) / 2) / n) * w;
        const left = Math.max(0, Math.min(cx - lw / 2, Math.max(0, w - lw)));
        win = { text, left, right: left + lw };
      }
    }
    let now: { left: number } | null = null;
    if (nowLocal >= 0) {
      const lw = m(tv.nowLabel);
      const cx = ((nowLocal + 0.5) / n) * w;
      const left =
        nowLocal === 0
          ? cx
          : nowLocal >= n - 1
            ? cx - lw
            : Math.max(0, Math.min(cx - lw / 2, w - lw));
      const right = left + lw;
      if (!win || right + 4 <= win.left || win.right + 4 <= left) {
        now = { left };
      }
    }
    return { win, now };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackW, measureTop, bestWindow, displayScores, windowStart, windowEnd, locale, n, nowLocal]);

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
    // Tooltip: só pointer:fine (rato/caneta) — nunca em touch.
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      const el = trackRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
        const gi = indexFromClientX(e.clientX);
        setTip({ x, gi });
      }
    }
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
  const thrY = TRACK_H * (1 - GOOD_THRESHOLD / 100);

  const tipHour = tip ? hours[tip.gi] : undefined;
  const tipMetrics = tipHour ? metrics?.get(tipHour) : undefined;
  const nf1 = new Intl.NumberFormat(isPt ? 'pt-PT' : 'en-GB', {
    maximumFractionDigits: 1,
  });

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

      {/* Etiqueta «melhor» + marcador Agora — faixa por cima da régua,
          posicionada em píxeis (clamp às bordas; «Agora» cede em colisão). */}
      <div
        ref={topRowRef}
        className="relative h-5 mt-1 text-meta-sm font-medium"
        aria-hidden
      >
        {topRow.win && (
          <span
            className="absolute top-0 whitespace-nowrap font-medium text-fg-muted"
            style={{ left: topRow.win.left }}
          >
            {topRow.win.text}
          </span>
        )}
        {topRow.now && (
          <span
            className="absolute top-0 whitespace-nowrap font-medium text-fg"
            style={{ left: topRow.now.left }}
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
        onPointerLeave={() => setTip(null)}
        onKeyDown={onKeyDown}
        className="relative h-[104px] lg:h-[128px] cursor-ew-resize select-none touch-pan-y rounded-input"
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
          {/* Faixa da melhor janela ≥60 — por trás das barras, --verdict a
              8 % (a janela mais forte; as outras ficam com parêntese). */}
          {bestWindow && (
            <rect
              x={bestWindow.s}
              y={0}
              width={bestWindow.e - bestWindow.s + 1}
              height={TRACK_H}
              fill="var(--verdict)"
              fillOpacity={0.08}
            />
          )}
          {/* Janelas ≥60 não-melhores: parêntese fino no topo da régua. */}
          {visibleWindows.slice(1).map((w) => (
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
          {/* Barras por hora — cor do escalão a 28 %; a escolhida a 100 % em
              --verdict. scaleY anima 160 ms com stagger de 6 ms/barra
              (teto 80 ms) ao mudar de modalidade — instantâneo em
              reduced-motion. */}
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
                fill={selected ? 'var(--verdict)' : getScoreRgb(s)}
                fillOpacity={selected ? 1 : 0.28}
                className={cn('motion-reduce:transition-none')}
                style={{
                  transform: `scaleY(${Math.max(0.02, s / 100)})`,
                  transformOrigin: '50% 100%',
                  transformBox: 'fill-box',
                  transition: reducedMotion
                    ? 'none'
                    : `transform 160ms cubic-bezier(0.16,1,0.3,1) ${Math.min(
                        i * STAGGER_MS,
                        STAGGER_CAP_MS,
                      )}ms, fill 150ms ease-out`,
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
          {/* Linha «agora» — traço vertical de 1 px em fg (marca do relógio,
              não da escolha). */}
          {nowLocal >= 0 && (
            <line
              x1={nowLocal + 0.5}
              x2={nowLocal + 0.5}
              y1={0}
              y2={TRACK_H}
              stroke="currentColor"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="text-fg"
            />
          )}
          {/* Tique da hora escolhida na base — só dentro da janela.
              Desliza por transform 200 ms na curva da página (UX v3 §7 —
              «cursor/selecção da régua»); instantâneo em reduced-motion. */}
          {selInWindow && (
            <rect
              x={0.1}
              y={TRACK_H - 2.5}
              width={0.8}
              height={2.5}
              fill="var(--verdict)"
              className={cn('motion-reduce:transition-none')}
              style={{
                transform: `translateX(${selLocal}px)`,
                transition: reducedMotion
                  ? 'none'
                  : 'transform 200ms cubic-bezier(0.16,1,0.3,1)',
              }}
            />
          )}
        </svg>
        <span
          aria-hidden
          className="absolute left-1 font-mono text-[11px] tabular-nums text-fg-subtle pointer-events-none"
          style={{ top: `${(1 - GOOD_THRESHOLD / 100) * 100}%`, transform: 'translateY(-50%)' }}
        >
          {GOOD_THRESHOLD}
        </span>

        {/* Tooltip — só pointer:fine (setTip ignora touch); segue o cursor
            por transform (left fica em 0 — o movimento é translateX, 120 ms).
            hora · score · onda m/s · vento kt dir (windSpeed é m/s → kt). */}
        {tip && tipHour && (
          <div
            ref={tipRef}
            aria-hidden
            data-testid="spot-rail-tooltip"
            className="pointer-events-none absolute left-0 bottom-full mb-1.5 z-10 whitespace-nowrap rounded-input border border-divider bg-bg-elevated px-2 py-1 font-mono text-meta-sm tabular-nums text-fg shadow-card"
            style={{
              transform: `translateX(${Math.min(
                Math.max(tip.x, 72),
                Math.max(trackW - 72, 72),
              )}px) translateX(-50%)`,
              transition: reducedMotion ? 'none' : 'transform 120ms ease-out',
            }}
          >
            {formatHourLabel(tipHour, locale)} · {displayScores[tip.gi] ?? 0}
            {tipMetrics && (
              <>
                {' · '}
                {nf1.format(tipMetrics.waveHeight)} m · {Math.round(tipMetrics.wavePeriod)} s ·{' '}
                {Math.round(tipMetrics.windSpeed * MS_TO_KNOTS)} kt{' '}
                {getWindArrow(tipMetrics.windDirection)}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rótulos do eixo — anti-colisão em PÍXEIS (canvas measureText; gap
          mínimo 8 px; prioridade mudança de dia > 12h > 6h). O font-mono
          fica no contentor: o canvas mede com o computed style DESTE div —
          sem ele mede sans e subestima a largura real dos rótulos mono. */}
      <div
        ref={axisRef}
        className="relative h-6 mt-1 font-mono tabular-nums text-meta-sm text-fg-subtle"
        aria-hidden
      >
        {axisLabels.map((l) => (
          <span
            key={`${l.kind}${l.index}`}
            className="absolute top-0 whitespace-nowrap font-mono tabular-nums"
            // `left` vem da decisão em píxeis — a caixa medida é a renderizada.
            style={{ left: l.left }}
          >
            {l.label}
          </span>
        ))}
      </div>

      <p className="mt-2 text-meta-sm text-fg-muted">{tv.railHint}</p>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  );
}
