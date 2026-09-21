'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { findCurrentHourIndex } from '@/lib/openMeteoTime';
import { spotTimelineScore } from '@/lib/spotTimelineScore';
import { spotTimelineWindow } from '@/components/spots/timeline/spotTimelineWindow';
import { mapTimeTrackPaused } from '@/components/spots/map/mapTimeTrackPaused';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Eixo de tempo partilhado da página de spot (docs/design/SPOT-PAGE.md):
 * uma hora escolhida comanda o veredicto, a régua e a previsão.
 *
 * Dois contextos separados — dados estáticos (horas/scores) e índice — para
 * que quem só precisa dos dados não re-renderize a cada scrub.
 */
export interface SpotTimelineDataValue {
  /** ISO local times (Open-Meteo, Europe/Lisbon wall time) alinhadas com scores. */
  hours: readonly string[];
  /** Scores canónicos por hora (mesma fonte da ForecastTable/WhenToGoCard). */
  scores: readonly number[];
  /** Índice da hora «agora»; -1 antes de montar ou sem horas. */
  nowIndex: number;
  /** Score «agora» com correcções observadas (badge do herói). */
  nowScore?: number;
  /** Janela visível da régua/autoplay: [windowStart, windowEnd) — 48 h a partir de «agora». */
  windowStart: number;
  windowEnd: number;
}

export interface SpotTimelineIndexValue {
  index: number;
  setIndex: (index: number) => void;
  /** A hora escolhida é a hora actual. */
  isNow: boolean;
  /** Volta à hora «agora» (índice 0 se não existir). */
  goNow: () => void;
  /** Move a escolha ±delta horas (setas, PageUp/PageDown). */
  step: (delta: number) => void;
  selectedHour: string | undefined;
  selectedScore: number | undefined;
  /** Autoplay «Reproduzir 48 h» — opt-in do utilizador (S2A). */
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  /** Autoplay efectivamente parado (qualquer fonte de pausa). */
  paused: boolean;
  /** Scrub em curso (arrasto na régua) — pausa o autoplay. */
  setScrubbing: (scrubbing: boolean) => void;
  /** Reporta régua fora do ecrã / documento escondido — pausa o autoplay. */
  setOffScreen: (offScreen: boolean) => void;
}

export const SpotTimelineDataContext = createContext<SpotTimelineDataValue | null>(null);
export const SpotTimelineIndexContext = createContext<SpotTimelineIndexValue | null>(null);

interface SpotTimelineProviderProps {
  /** Horas do eixo — as mesmas que alimentam a ForecastTable. */
  hours: readonly string[];
  /** Scores canónicos alinhados com `hours` (mesmo índice). */
  scores: readonly number[];
  /** Score «agora» com correcções observadas. */
  nowScore?: number;
  /**
   * `false` até o cliente montar (padrão mounted+bakedAtMs do
   * SpotDetailClient): antes disso o índice fica em 0, nowIndex em -1 e nada
   * depende da hora actual — o primeiro paint reproduz o bake (React #418).
   */
  mounted: boolean;
  /** Relógio de referência opcional (bake/testes); depois de montar usa-se o relógio real. */
  nowMs?: number;
  /** Cadência do autoplay em ms. */
  tickMs?: number;
  children: ReactNode;
}

export default function SpotTimelineProvider({
  hours,
  scores,
  nowScore,
  mounted,
  nowMs,
  tickMs = 1000,
  children,
}: SpotTimelineProviderProps) {
  const [index, setIndexRaw] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [offScreen, setOffScreen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // Índice «agora»: só depois de montar, com o relógio real (ou o de
  // referência em testes). Antes disso -1 — nada depende da hora actual.
  // Recomputa em visibilitychange (página aberta durante horas) — mexer no
  // nowIndex NÃO move o índice escolhido pelo utilizador (a aterragem
  // inicial está protegida por didLandOnNow).
  const [nowIndex, setNowIndex] = useState(-1);
  useEffect(() => {
    if (!mounted || hours.length === 0) {
      setNowIndex(-1);
      return;
    }
    const compute = () =>
      setNowIndex(findCurrentHourIndex(hours as string[], new Date(nowMs ?? Date.now())));
    compute();
    const onVisible = () => {
      if (document.visibilityState === 'visible') compute();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [mounted, hours, nowMs]);

  // Janela de 48 h da régua — a mesma que limita o autoplay.
  const { start: windowStart, end: windowEnd } = useMemo(
    () => spotTimelineWindow(hours.length, nowIndex),
    [hours.length, nowIndex],
  );

  // Aterragem inicial na hora actual — uma vez, depois de montar.
  const didLandOnNow = useRef(false);
  useEffect(() => {
    if (!mounted || didLandOnNow.current) return;
    didLandOnNow.current = true;
    if (nowIndex >= 0) setIndexRaw(nowIndex);
  }, [mounted, nowIndex]);

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(i, Math.max(0, hours.length - 1))),
    [hours.length],
  );
  const setIndex = useCallback(
    (i: number) => setIndexRaw(clamp(i)),
    [clamp],
  );
  const step = useCallback(
    (delta: number) => setIndexRaw((i) => clamp(i + delta)),
    [clamp],
  );
  const goNow = useCallback(
    () => setIndexRaw(nowIndex >= 0 ? nowIndex : 0),
    [nowIndex],
  );

  // Autoplay: as mesmas regras de pausa do mapa (mapTimeTrackPaused) —
  // scrub, fora do ecrã, pausa do utilizador e reduced-motion vencem.
  // «userPaused» é o inverso de `playing`: o autoplay é opt-in.
  const paused = mapTimeTrackPaused({
    scrubbing,
    mapBusyCount: 0,
    offScreen,
    userPaused: !playing,
    reducedMotion,
  });

  useEffect(() => {
    if (paused || windowEnd - windowStart <= 1) return;
    const id = window.setInterval(() => {
      // Autoplay dá a volta dentro da janela de 48 h, não no array inteiro.
      setIndexRaw((i) => (i >= windowStart && i + 1 < windowEnd ? i + 1 : windowStart));
    }, tickMs);
    return () => window.clearInterval(id);
  }, [paused, windowStart, windowEnd, tickMs]);

  const dataValue = useMemo<SpotTimelineDataValue>(
    () => ({ hours, scores, nowIndex, nowScore, windowStart, windowEnd }),
    [hours, scores, nowIndex, nowScore, windowStart, windowEnd],
  );

  const indexValue = useMemo<SpotTimelineIndexValue>(
    () => ({
      index,
      setIndex,
      isNow: nowIndex >= 0 && index === nowIndex,
      goNow,
      step,
      selectedHour: hours[index],
      selectedScore: spotTimelineScore({ index, nowIndex, scores, nowScore }),
      playing,
      setPlaying,
      paused,
      setScrubbing,
      setOffScreen,
    }),
    [index, setIndex, nowIndex, goNow, step, hours, scores, nowScore, playing, paused],
  );

  return (
    <SpotTimelineDataContext.Provider value={dataValue}>
      <SpotTimelineIndexContext.Provider value={indexValue}>
        {children}
      </SpotTimelineIndexContext.Provider>
    </SpotTimelineDataContext.Provider>
  );
}
