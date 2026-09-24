'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ChevronDown, Pause, Play } from 'lucide-react';
import type L from 'leaflet';
import type { MapHoursFile } from '@/lib/mapHours';
import { scoreAtHour } from '@/lib/mapHours';
import { formatHourLabel, formatHourLong, formatWeekday } from '@/lib/verdict/formatHourLabel';
import { pickRailAxisLabelsPx, railAxisCandidates } from '@/lib/verdict/railAxisLabels';
import { getScoreCssVar } from '@/lib/scoreThresholds';
import type { getTranslation } from '@/lib/i18n';
import { useMapUiData } from './MapUiContext';

/** Avanço do Geist Mono (600/1000 em) a 10 px — os ticks do eixo. */
const AXIS_CHAR_PX = 6;
/** Espaço mínimo entre etiquetas do eixo — o mesmo da régua do spot. */
const AXIS_GAP_PX = 8;

type MapTranslation = ReturnType<typeof getTranslation>;

interface MapTimeChromeProps {
  t: MapTranslation;
  locale: string;
  isMobile: boolean;
  /** Camada «48 h» ligada (interruptor «48 h» no menu Camadas). */
  hoursOn: boolean;
  /** `hoursFrame === 0` — marcadores/scrubber no «agora». */
  hoursLive: boolean;
  hoursTimes: readonly string[];
  hoursFrame: number;
  /** `undefined` a carregar · `null` indisponível · ficheiro carregado. */
  hoursFile: MapHoursFile | null | undefined;
  hoursHudPaused: boolean;
  hoursUserPaused: boolean;
  mapInstanceRef: RefObject<L.Map | null>;
  onIndexChange: (index: number) => void;
  onUserPausedChange: (paused: boolean) => void;
  onScrubbingChange: (scrubbing: boolean) => void;
  /** Scrubber visível (sincronizado pela zona com `hoursOn`). */
  scrubOpen: boolean;
  /** Clique na pill — a zona liga a camada se necessário e alterna. */
  onToggleScrub: () => void;
  /** Altura medida do scrubber — a zona usa-a para levantar a legenda. */
  onSizeChange?: (height: number) => void;
  /** Chips de maré/térmica junto ao cabeçalho (mesmo papel do HUD antigo). */
  timeTrackChips?: ReactNode;
}

/**
 * UX v3 §4 / maquete — chrome temporal do /mapa fullscreen:
 *
 *  • **Pill** centrada no topo («Agora · 16:00» ao vivo / «qui 17:00» no
 *    futuro, tingida pelo melhor escalão desse passo) — abre/fecha o
 *    scrubber, `aria-expanded`.
 *  • **Scrubber** — barras de 16 passos de 3 h coloridas pelo melhor score
 *    visível no viewport, horas nocturnas sombreadas, marcador «agora»,
 *    ticks canónicos anti-colisão (`pickRailAxisLabelsPx`), play/pause e
 *    «Agora». O `<input type="range">` cobre as barras (invisível): pointer
 *    drag + setas/Home/End de borla e o selector E2E
 *    `[data-map-hours-scrubber] input[type=range]` mantém-se.
 *
 * No mobile acompanha a altura do bottom sheet (`bottom = vh − sheet.top +
 * 12`), medida por rAF — mesmo efeito do `--peek` da maquete.
 */
export default function MapTimeChrome({
  t,
  locale,
  isMobile,
  hoursOn,
  hoursLive,
  hoursTimes,
  hoursFrame,
  hoursFile,
  hoursHudPaused,
  hoursUserPaused,
  mapInstanceRef,
  onIndexChange,
  onUserPausedChange,
  onScrubbingChange,
  scrubOpen,
  onToggleScrub,
  onSizeChange,
  timeTrackChips,
}: MapTimeChromeProps) {
  const { visibleSpots, sport } = useMapUiData();
  const scrubRef = useRef<HTMLElement | null>(null);

  const times = hoursTimes;
  const n = times.length;

  /* Melhor score por passo entre os spots visíveis no viewport — a métrica
     da maquete («melhor score na vista»), para a modalidade seleccionada
     (a mesma dos marcadores). */
  /* Os bounds vivem no ref do Leaflet — leitura adiada para um callback
     (mesmo padrão do buildRows do MapExploreZone: react-hooks/refs proíbe
     `.current` em corpo de render/memo). */
  const computeBest = useCallback((): number[] => {
    if (!hoursFile || !n) return [];
    const bounds = mapInstanceRef.current?.getBounds();
    const inView = bounds
      ? visibleSpots.filter((s) => bounds.contains([s.spot.lat, s.spot.lon]))
      : visibleSpots;
    return Array.from({ length: n }, (_, i) => {
      let b = 0;
      for (const s of inView) {
        const v = scoreAtHour(hoursFile, s.spot.id, sport, i);
        if (v != null && v > b) b = v;
      }
      return b;
    });
  }, [hoursFile, n, visibleSpots, sport, mapInstanceRef]);

  /* `best` em estado: a leitura dos bounds do Leaflet é um ref — não pode
     correr no render (react-hooks/refs). Recalcula quando os dados mudam
     E no moveend — as barras seguem o «melhor score na vista» da maquete. */
  const [best, setBest] = useState<number[]>([]);
  useEffect(() => {
    const update = () => setBest(computeBest());
    update();
    const map = mapInstanceRef.current;
    map?.on('moveend', update);
    return () => { map?.off('moveend', update); };
  }, [computeBest, mapInstanceRef]);

  /* Noite = 20h–07h locais (horas do ficheiro já estão em Europe/Lisbon). */
  const night = useMemo(
    () => times.map((iso) => {
      const h = new Date(iso).getHours();
      return h < 7 || h >= 20;
    }),
    [times],
  );

  /* Ticks do eixo — o mesmo algoritmo da régua do spot: colisão medida em
     píxeis (a versão por distância em horas sobrepunha «qua 23» e «12h» no
     mobile, auditoria S8). Largura real da fila por ResizeObserver; o texto
     é Geist Mono 10 px, de avanço fixo, por isso a largura mede-se por
     contagem de caracteres (sem sonda no DOM). */
  const axisRef = useRef<HTMLDivElement | null>(null);
  const [axisW, setAxisW] = useState(0);
  const axisMounted = scrubOpen && hoursOn && n > 1;
  useEffect(() => {
    const el = axisRef.current;
    if (!axisMounted || !el) return;
    const ro = new ResizeObserver(() => setAxisW(el.getBoundingClientRect().width));
    ro.observe(el);
    setAxisW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [axisMounted]);
  const axisCandidates = useMemo(() => railAxisCandidates(times, locale), [times, locale]);
  const ticks = useMemo(() => {
    if (n <= 1) return [];
    const w = axisW || (isMobile ? 340 : 480); // estimativa pré-medida
    return pickRailAxisLabelsPx(
      axisCandidates,
      n,
      (i) => ((i + 0.5) / n) * w,
      (s) => s.length * AXIS_CHAR_PX,
      AXIS_GAP_PX,
    );
  }, [axisCandidates, n, axisW, isMobile]);

  /* Mede o scrubber → a zona levanta a legenda por cima dele. */
  useEffect(() => {
    const el = scrubRef.current;
    if (!el || !onSizeChange) return;
    const ro = new ResizeObserver(() => onSizeChange(el.offsetHeight));
    ro.observe(el);
    onSizeChange(el.offsetHeight);
    return () => ro.disconnect();
  }, [onSizeChange, scrubOpen, n]);

  /* Mobile: flutua 12 px acima da borda superior do sheet (maquete:
     `bottom: var(--peek)+12`). Segue o drag por rAF. */
  const [sheetLift, setSheetLift] = useState(12);
  useEffect(() => {
    if (!isMobile || !scrubOpen) {
      setSheetLift(12);
      return;
    }
    let raf = 0;
    const tick = () => {
      const sheet = document.querySelector<HTMLElement>('[data-explore-sheet]');
      const top = sheet ? sheet.getBoundingClientRect().top : window.innerHeight;
      setSheetLift(Math.max(12, Math.round(window.innerHeight - top + 12)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isMobile, scrubOpen]);

  // A pill está sempre presente (maquete) — com a camada desligada o
  // ficheiro ainda não foi pedido (useMapHours coalesce undefined→null) e a
  // pill mostra «Agora»; o clique liga a camada e abre o scrubber. Só se
  // esconde quando a camada está LIGADA e o ficheiro falhou (null).
  if (hoursOn && hoursFile === null) return null;

  const frame = Math.min(Math.max(hoursFrame, 0), Math.max(n - 1, 0));
  const frameTime = times[frame] ?? '';
  const live = hoursLive && frame === 0;

  // Copy: «Agora»/hint/valuetext são novos (mapUiChrome); scrub/play/pause
  // reutilizam as chaves canónicas do trilho temporal em t.map.
  const { timeNow, scrubBestHint, scrubValueText } = t.mapUiChrome;
  const timeScrubLabel = t.map.hoursScrub;
  const timePlay = t.map.hoursPlay;
  const timePause = t.map.hoursPause;

  /* Pill: ao vivo → «Agora · 16:00»; futuro → «qui 17:00» tingido pelo
     escalão do melhor score desse passo; camada off → «Agora». O cabeçalho
     do scrubber mostra «agora»/«qui 17:00» (mesmo formato da maquete). */
  const pillStyle: CSSProperties | undefined =
    hoursOn && !live && best[frame] !== undefined
      ? ({ '--verdict': getScoreCssVar(best[frame]) } as CSSProperties)
      : undefined;

  const stepLabel =
    n === 0 || live
      ? timeNow
      : `${formatWeekday(frameTime, locale)} ${formatHourLabel(frameTime, locale)}`;

  const scrubVisible = scrubOpen && hoursOn && n > 1;

  return (
    <>
      <button
        type="button"
        data-map-time-pill
        aria-expanded={scrubVisible}
        aria-controls="map-hours-scrubber-card"
        onClick={onToggleScrub}
        style={pillStyle}
        className="absolute top-3 left-1/2 z-[1150] inline-flex h-10 -translate-x-1/2 items-center gap-1.5 rounded-pill border border-divider bg-bg-elevated px-3.5 text-[13px] text-fg shadow-card transition-colors hover:bg-surface-2"
      >
        {!hoursOn || n === 0 ? (
          <span className="font-medium">{timeNow}</span>
        ) : live ? (
          <>
            <span className="text-fg-muted">{timeNow} · </span>
            <span className="font-mono font-semibold tabular-nums">{formatHourLabel(frameTime, locale)}</span>
          </>
        ) : (
          <span className="font-mono font-semibold tabular-nums" style={{ color: 'rgb(var(--verdict))' }}>
            {stepLabel}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 text-fg-muted transition-transform duration-150 ${scrubVisible ? 'rotate-180' : ''}`}
        />
      </button>

      {scrubVisible && (
        <div
          className="map-scrub-wrap pointer-events-none absolute left-0 right-3 z-[1140] flex justify-center"
          style={{ bottom: isMobile ? sheetLift : 40 }}
        >
          <section
            id="map-hours-scrubber-card"
            ref={scrubRef}
            data-map-hours-scrubber
            data-map-time-track-mode="hours"
            aria-label={timeScrubLabel}
            className="pointer-events-auto w-[min(560px,100%)] rounded-surface border border-divider bg-bg-elevated px-3.5 pb-2 pt-2.5 shadow-card"
          >
            {/* Cabeçalho NUMA linha (CORRECCOES-24SET M6#1): label + hint
                com truncate (o hint é muto, não é um nome) e «Agora» fixo;
                os chips de maré/térmica só entram no desktop — no mobile
                rebentavam a linha e esmagavam o texto. Botão play com o
                estilo .ib da maquete (transparente, ícone 18 px tinta fg —
                nunca uma caixa branca vazia). */}
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                data-map-hours-play
                aria-pressed={!hoursHudPaused}
                aria-label={hoursHudPaused ? timePlay : timePause}
                onClick={() => onUserPausedChange(!hoursUserPaused)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input text-fg transition-colors hover:bg-surface-2"
              >
                {hoursHudPaused ? (
                  <Play aria-hidden className="h-[18px] w-[18px] fill-current" />
                ) : (
                  <Pause aria-hidden className="h-[18px] w-[18px] fill-current" />
                )}
              </button>
              <span className="min-w-0 truncate text-meta text-fg-muted">
                <b className="font-semibold text-fg">{stepLabel}</b>
                <span className="text-[11px] text-fg-subtle"> · {scrubBestHint}</span>
              </span>
              <span className="flex-1" />
              {!isMobile && timeTrackChips}
              <button
                type="button"
                data-map-hours-now
                onClick={() => onIndexChange(0)}
                className="min-h-8 shrink-0 whitespace-nowrap rounded-input px-2.5 text-[12px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {timeNow}
              </button>
            </div>

            {/* Barras + range invisível por cima (pointer/keyboard/E2E). */}
            <div className="map-scrub-bars relative">
              <div className="grid h-14 items-end gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }} aria-hidden>
                {times.map((iso, i) => {
                  const v = best[i] ?? 0;
                  const on = i === frame;
                  return (
                    <div
                      key={iso}
                      className={`relative h-full rounded-[3px] ${night[i] ? 'bg-[rgb(var(--fg)/0.05)]' : ''}`}
                    >
                      {i === 0 && (
                        <i className="absolute -top-1 bottom-0 left-1/2 border-l border-dashed border-fg-subtle/70" />
                      )}
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-[3px_3px_1px_1px]"
                        style={{
                          height: `${Math.max(8, v)}%`,
                          background: `rgb(var(${getScoreCssVar(v)}))`,
                          opacity: on ? 1 : 0.32,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <input
                type="range"
                min={0}
                max={n - 1}
                step={1}
                value={frame}
                aria-label={timeScrubLabel}
                aria-valuetext={scrubValueText
                  .replace('{time}', formatHourLong(frameTime, locale))
                  .replace('{score}', String(best[frame] ?? 0))}
                onChange={(e) => {
                  // Maquete: qualquer interacção pára o autoplay.
                  onUserPausedChange(true);
                  onIndexChange(Number(e.target.value));
                }}
                onPointerDown={() => {
                  onUserPausedChange(true);
                  onScrubbingChange(true);
                }}
                onPointerUp={() => onScrubbingChange(false)}
                onPointerCancel={() => onScrubbingChange(false)}
                onBlur={() => onScrubbingChange(false)}
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              />
            </div>

            {/* Ticks canónicos anti-colisão — prioridade à mudança de dia. */}
            <div
              ref={axisRef}
              className="relative mt-1 h-4 font-mono text-[10px] tabular-nums text-fg-subtle"
              aria-hidden
            >
              {/* `left` já vem clampado às bordas pelo algoritmo — é a
                  caixa que foi testada contra colisões. */}
              {ticks.map((tick) => (
                <span
                  key={tick.index}
                  className="absolute top-0 whitespace-nowrap"
                  style={{ left: tick.left }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
