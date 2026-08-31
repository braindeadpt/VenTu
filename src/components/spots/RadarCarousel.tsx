'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudRain, Pause, Play } from 'lucide-react';
import { radarFrameClock, radarFrameFullClock } from '@/lib/ipmaRadar';

export interface RadarCarouselFrame {
  url: string;
  frameTime: string | null;
}

interface RadarCarouselProps {
  frames: RadarCarouselFrame[];
  /** Índice do frame actual (controlado pelo pai — sincroniza o overlay). */
  frameIndex: number;
  /** Callback quando o frame muda (carrossel ou scrubber). */
  onFrameChange: (index: number) => void;
  /** Conjunto de fontes de movimento do mapa (ex: 'drag', 'zoom') com a animação
   *  ainda a decorrer. >0 pausa o carrossel; voltar a 0 retoma. Um contador
   *  (não um boolean) garante que drag+zoom sobrepostos só retomam quando o
   *  ÚLTIMO termina — uma única fonte que fica idle num boolean retomava cedo
   *  demais. O scrubber pausa internamente. */
  mapBusyCount?: number;
  /** Pausa manual (controlada pelo pai — persistida em localStorage). */
  userPaused?: boolean;
  /** Notifica o pai quando o utilizador alterna a pausa manual. */
  onUserPausedChange?: (paused: boolean) => void;
  /** Rótulos i18n do bloco `map` (badge/hint/scrub/play/pause/paused). */
  labels: {
    badge: string;
    hint: string;
    scrub: string;
    play: string;
    pause: string;
    /** Rótulo de estado «Pausado» (ícone do badge quando o carrossel está parado). */
    paused: string;
  };
  /** Cadência da animação em ms (1 s no ar; test hook). */
  tickMs?: number;
  /** Classe do wrapper posicionado (absolute bottom-left/right, z-index). */
  className?: string;
  /** Estilo extra (ex: bottom dinâmico em fullscreen, acima do HUD). */
  style?: React.CSSProperties;
}

/**
 * Carrossel de radar IPMA (frames 5-min) partilhado entre o mapa de spot /
 * ecrã inteiro e o mapa da homepage (hero). Controlado: o pai é dono do
 * índice e do overlay (L.imageOverlay setUrl); este componente trata da
 * animação, do scrubber (pausa enquanto se interage) e do badge com a hora
 * do frame + atribuição Open-Meteo.
 */
export default function RadarCarousel({
  frames,
  frameIndex,
  onFrameChange,
  mapBusyCount = 0,
  userPaused = false,
  onUserPausedChange,
  labels,
  tickMs = 1000,
  className,
  style,
}: RadarCarouselProps) {
  const [scrubbing, setScrubbing] = useState(false);
  // Separador escondido ou mapa fora do viewport → pausa (poupa rede/CPU
  // quando ninguém está a ver). A IntersectionObserver cobre o scroll;
  // o visibilitychange cobre o tab em background.
  const [offScreen, setOffScreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const paused = scrubbing || mapBusyCount > 0 || offScreen || userPaused;

  // Tab invisível (visibilitychange) — pausa o carrossel até voltar ao foco.
  useEffect(() => {
    const onVisibility = () => {
      setOffScreen(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Mapa fora do viewport (scroll) — deixa de animar (e de trocar o overlay)
  // enquanto não está visível; retoma automaticamente quando volta.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setOffScreen(!entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Carrossel 5-min — um frame por segundo (volta completa ≈ 12 s). Pausa
  // durante scrubber/mapa, tab escondido ou fora do viewport para não
  // disparar setUrl (rede) nem o intervalo (CPU) quando ninguém está a ver.
  useEffect(() => {
    if (paused || frames.length <= 1) return;
    const intervalId = window.setInterval(() => {
      onFrameChange((frameIndex + 1) % frames.length);
    }, tickMs);
    return () => window.clearInterval(intervalId);
  }, [paused, frames.length, frameIndex, onFrameChange, tickMs]);

  if (frames.length === 0) return null;

  const clock = radarFrameClock(frames[frameIndex]?.frameTime ?? null) ?? '';
  // Data + hora do frame actual para o tooltip (distinguir dias diferentes).
  const fullClock = radarFrameFullClock(frames[frameIndex]?.frameTime ?? null);

  return (
    <div ref={rootRef} className={className} style={style} data-radar-carousel="true">
      {frames.length > 1 && (
        <div
          className="flex flex-col gap-1 px-2.5 pt-1.5 pb-2 rounded-md bg-bg-elevated/95 border border-divider shadow-card"
          data-radar-scrubber="true"
        >
          <div className="flex items-center justify-between gap-3 text-meta-sm">
            <span className="flex items-center gap-1.5 text-fg-muted">
              <button
                type="button"
                onClick={() => onUserPausedChange?.(!paused)}
                aria-label={paused ? labels.play : labels.pause}
                aria-pressed={userPaused}
                title={paused ? labels.play : labels.pause}
                data-radar-toggle="true"
                className="flex items-center justify-center w-6 h-6 rounded-md text-fg bg-bg-elevated border border-divider shadow-sm hover:bg-bg-elevated/60 active:scale-95 transition-colors"
              >
                {paused ? (
                  <Play className="w-3.5 h-3.5" aria-hidden />
                ) : (
                  <Pause className="w-3.5 h-3.5" aria-hidden />
                )}
              </button>
              {labels.scrub}
            </span>
            <span className="font-semibold tabular-nums">{clock}</span>
          </div>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            step={1}
            value={frameIndex}
            onChange={(e) => onFrameChange(Number(e.target.value))}
            onPointerDown={() => setScrubbing(true)}
            onPointerUp={() => setScrubbing(false)}
            onPointerCancel={() => setScrubbing(false)}
            onBlur={() => setScrubbing(false)}
            aria-label={labels.scrub}
            className="w-40 accent-data-waves cursor-pointer touch-manipulation"
          />
        </div>
      )}

      <div
        className="mt-1.5 flex flex-col items-start gap-1 px-2.5 py-1.5 rounded-md text-meta-sm text-fg bg-bg-elevated/90 border border-divider shadow-card pointer-events-none"
        // O tooltip mostra sempre a data/hora exacta do frame (distinguir dias),
        // mesmo quando o carrossel está pausado — o estado «pausado» já é
        // visível no corpo do badge (ícone + rótulo), não precisa do tooltip.
        title={
          fullClock ? `${labels.hint} · ${fullClock}` : labels.hint
        }
        data-radar-badge="true"
        data-radar-paused={paused ? 'true' : undefined}
      >
        <div className="flex items-center gap-1.5">
          {paused ? (
            // Ponto verde a piscar → estado âmbar «pausado»: não parece avariado,
            // está apenas parado (drag/zoom do mapa, scrubber ou pausa manual).
            <span className="flex h-3.5 items-center gap-1 text-data-period">
              <Pause className="w-3 h-3" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wide">{labels.paused}</span>
            </span>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-data-waves animate-pulse" aria-hidden />
          )}
          <CloudRain className="w-3.5 h-3.5 text-data-waves" aria-hidden />
          <span>{labels.badge}</span>
          <span className="font-semibold tabular-nums">{clock}</span>
          {frames.length > 1 && (
            <span className="text-fg-muted tabular-nums">
              · {frameIndex + 1}/{frames.length}
            </span>
          )}
        </div>
        {/* Atribuição Open-Meteo (CC BY 4.0) junto ao overlay do radar — o link
            é clicável mesmo com o badge em pointer-events-none. */}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto text-meta-xs text-fg-subtle underline hover:text-fg transition-colors"
        >
          Weather data by Open-Meteo.com (CC BY 4.0)
        </a>
      </div>
    </div>
  );
}
