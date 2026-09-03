'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { CloudRain, Maximize2, Pause } from 'lucide-react';
import { radarFrameClock, radarFrameFullClock, radarMissingFrames } from '@/lib/ipmaRadar';
import { OpenMeteoAttribution } from '@/lib/openMeteoAttribution';
import { IPMA_URL } from '@/lib/ipmaAttribution';
import MapTimeTrack from './map/MapTimeTrack';
import { useMapTimeTrack } from './map/useMapTimeTrack';

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
    /** Atribuição do radar (IPMA, localizada) — «Dados IPMA» / «IPMA data». */
    ipmaAttribution: string;
    /**
     * Rótulo discreto quando a cadência do radar tem bruturas (frames em falta):
     * template com `{count}` a contar os slots de 5 min consecutivos em falta
     * (ex: '{count} frames em falta'). Vazio em cadência contígua.
     */
    gap: string;
  };
  /** Cadência da animação em ms (1 s no ar; test hook). */
  tickMs?: number;
  /** Classe do wrapper posicionado (absolute bottom-left/right, z-index). */
  className?: string;
  /** Estilo extra (ex: bottom dinâmico em fullscreen, acima do HUD). */
  style?: React.CSSProperties;
  /**
   * Link de imersão — abre o mapa fullscreen (/mapa) com o radar já ligado
   * (`?radar=1`). Quando presente, o badge ganha um botão «ecrã inteiro» para
   * quem quer ver o radar a ocupar o ecrã todo (ex: a partir do mapa de spot).
   */
  fullscreenHref?: string;
  /** Rótulo do botão de imersão (aria-label/title — traduzido pelo pai). */
  fullscreenLabel?: string;
  /** Persiste o estado ACTUAL (frame + pausa do utilizador) no clique do link
   *  de imersão — o /mapa?radar=1 entra exactamente onde o carrossel ficou,
   *  mesmo que o frame venha de um scrub transitório sem pausa (que hoje não
   *  fica gravado — só grava quando pausado). O pai é dono da persistência. */
  onFullscreenOpen?: (frame: number, userPaused: boolean) => void;
  /**
   * Fullscreen HUD owns the scrubber. Badge + attribution stay on the map;
   * ticks still run here so HUD and overlay share one clock.
   */
  hideScrubber?: boolean;
  /** HUD range is dragging — pause ticks without flipping userPaused. */
  externalScrubbing?: boolean;
  onScrubbingChange?: (scrubbing: boolean) => void;
}

/**
 * Carrossel de radar IPMA (frames 5-min) partilhado entre o mapa de spot /
 * ecrã inteiro e o mapa da homepage (hero). Controlado: o pai é dono do
 * índice e do overlay (L.imageOverlay setUrl); este componente trata da
 * animação, do scrubber (pausa enquanto se interage) e do badge com a hora
 * do frame + atribuição Open-Meteo. Em fullscreen o HUD aloja o track
 * (`hideScrubber`); o radar é um modo da linha do tempo, não o dono exclusivo.
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
  fullscreenHref,
  fullscreenLabel,
  onFullscreenOpen,
  hideScrubber = false,
  externalScrubbing = false,
  onScrubbingChange,
}: RadarCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { paused, setScrubbing } = useMapTimeTrack({
    length: frames.length,
    index: frameIndex,
    onIndexChange: onFrameChange,
    mapBusyCount,
    userPaused,
    externalScrubbing,
    tickMs,
    observeRef: rootRef,
  });

  const handleScrubbingChange = (next: boolean) => {
    setScrubbing(next);
    onScrubbingChange?.(next);
  };

  if (frames.length === 0) return null;

  const clock = radarFrameClock(frames[frameIndex]?.frameTime ?? null) ?? '';
  // Data + hora do frame actual para o tooltip (distinguir dias diferentes).
  const fullClock = radarFrameFullClock(frames[frameIndex]?.frameTime ?? null);
  // Frames de 5 min em FALTA entre o frame actual e o seguinte (mais antigo) —
  // o IPMA falha cadências; o carrossel salta para o próximo frame válido e o
  // badge avisa discretamente (gaps > 5 min), em vez de mostrar saltos mudos.
  const missingAfter = radarMissingFrames(frames)[frameIndex] ?? 0;
  const gapLabel = missingAfter > 0 ? labels.gap.replace('{count}', String(missingAfter)) : null;

  return (
    <div ref={rootRef} className={className} style={style} data-radar-carousel="true">
      {!hideScrubber && (
        <MapTimeTrack
          length={frames.length}
          index={frameIndex}
          onIndexChange={onFrameChange}
          paused={paused}
          userPaused={userPaused}
          onUserPausedChange={onUserPausedChange}
          onScrubbingChange={handleScrubbingChange}
          clock={clock}
          labels={{ scrub: labels.scrub, play: labels.play, pause: labels.pause }}
          variant="floating"
          mode="radar"
        />
      )}

      <div
        // max-md:relative — o link de imersão flutua à direita do badge em
        // mobile (compacto); em >=sm volta a ser uma linha própria abaixo.
        className="mt-1.5 flex flex-col items-start gap-1 px-2.5 py-1.5 rounded-md text-meta-sm text-fg bg-bg-elevated/90 border border-divider shadow-card pointer-events-none max-md:relative max-md:mt-0.5 max-md:px-2 max-md:py-0.5"
        // O tooltip mostra sempre a data/hora exacta do frame (distinguir dias),
        // mesmo quando o carrossel está pausado — o estado «pausado» já é
        // visível no corpo do badge (ícone + rótulo), não precisa do tooltip.
        title={
          fullClock ? `${labels.hint} · ${fullClock}` : labels.hint
        }
        data-radar-badge="true"
        data-radar-paused={paused ? 'true' : undefined}
      >
        {/* pr-20 em mobile: reserva o espaço do link de imersão flutuante. */}
        <div className="flex items-center gap-1.5 max-md:pr-20">
          {paused ? (
            // Ponto verde a piscar → estado âmbar «pausado»: não parece avariado,
            // está apenas parado (drag/zoom do mapa, scrubber ou pausa manual).
            <span className="flex h-3.5 items-center gap-1 text-data-period">
              <Pause className="w-3 h-3" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wide">{labels.paused}</span>
            </span>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-data-waves motion-reduce:animate-none animate-pulse" aria-hidden />
          )}
          <CloudRain className="w-3.5 h-3.5 text-data-waves" aria-hidden />
          <span>{labels.badge}</span>
          <span className="font-semibold tabular-nums">{clock}</span>
          {frames.length > 1 && (
            <span className="text-fg-muted tabular-nums">
              · {frameIndex + 1}/{frames.length}
            </span>
          )}
          {/* Brutura na cadência (gaps > 5 min): aviso discreto com a contagem —
              o carrossel salta para o último frame válido e explica o salto. */}
          {gapLabel && (
            <span
              className="text-meta-xs text-data-waves/80"
              data-radar-gap="true"
              title={`${gapLabel} · ${fullClock ?? labels.hint}`}
            >
              · {gapLabel}
            </span>
          )}
        </div>
        {/* Atribuições lado a lado junto ao overlay do radar — os dados são do
            IPMA por cima de previsões Open-Meteo, por isso o badge mostra as
            DUAS obrigatórias. Links clicáveis mesmo com o badge em
            pointer-events-none. URLs e textos vêm dos módulos partilhados. */}
        <div
          // Em mobile o painel tem de caber na banda livre entre o HUD e a
          // atribuição Leaflet (para não cobrir marcadores) — a fonte das
          // atribuições encolhe um grau para caberem numa linha.
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta-xs text-fg-subtle max-md:gap-x-1.5 max-md:text-[10px]"
          data-radar-attributions="true"
        >
          <a
            href={IPMA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto underline hover:text-fg transition-colors"
          >
            {labels.ipmaAttribution}
          </a>
          <span aria-hidden className="text-fg-muted">·</span>
          {/* Fonte única da cadeia CC BY — mesmo componente do About//fontes/
              card de onda. As duas âncoras (Open-Meteo.com + licença CC BY 4.0)
              vêm de openMeteoAttribution.tsx e nunca divergem entre superfícies. */}
          <OpenMeteoAttribution className="pointer-events-auto underline hover:text-fg transition-colors" />
        </div>

        {/* Imersão: abrir o /mapa com o radar já ligado (ecrã inteiro). O link é
            clicável mesmo com o badge em pointer-events-none. */}
        {fullscreenHref && fullscreenLabel && (
          <Link
            href={fullscreenHref}
            onClick={() => onFullscreenOpen?.(frameIndex, userPaused)}
            aria-label={fullscreenLabel}
            title={fullscreenLabel}
            data-radar-fullscreen="true"
            className="pointer-events-auto mt-1 inline-flex items-center gap-1 text-meta-xs text-fg-subtle underline hover:text-fg transition-colors max-md:absolute max-md:right-2 max-md:top-1/2 max-md:-translate-y-1/2 max-md:mt-0"
          >
            <Maximize2 className="w-3 h-3" aria-hidden />
            {fullscreenLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
