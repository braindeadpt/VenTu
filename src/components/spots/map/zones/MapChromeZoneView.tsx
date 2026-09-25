'use client';

/**
 * MapChromeZoneView — vista do compartimento «cromo» (dono M2): pilha de
 * controlos, pill/scrubber temporal, legenda flutuante e modal de vento.
 *
 * Separado de MapChromeZone.tsx (M7-F): a árvore de cromo
 * (MapControlStack/MapControls, MapTimeChrome, MapLegend, WindRingLegend)
 * avalia-se num chunk próprio, carregado quando o mapa fica pronto —
 * fora da tarefa única de avaliação do chunk principal.
 */

import { useEffect, useState, type ComponentProps } from 'react';
import { usePathname } from 'next/navigation';
import MapControls from '../components/MapControls';
import MapControlStack from '../components/MapControlStack';
import MapLegend from '../../MapLegend';
import WindRingLegend from '../../WindRingLegend';
import MapTimeChrome from '../MapTimeChrome';
import type { IsobathContoursFile } from '@/lib/isobaths';
import type { MapChromeState } from './MapChromeZone';
import type { MapLayersFields } from './MapLayersZone';
import type { getTranslation } from '@/lib/i18n';

type MapTranslation = ReturnType<typeof getTranslation>;

interface MapChromeZoneProps {
  t: MapTranslation;
  locale: string;
  isFullscreen: boolean;
  isMobile: boolean;
  isHeroEmbed: boolean;
  controls: ComponentProps<typeof MapControls>;
  // «Perto de mim» / «Partilhar vista»
  locateLabel: string;
  shareLabel: string;
  // Legenda de camadas (props montadas pela zona de camadas)
  isobathsEnabled: boolean;
  isobathsData: IsobathContoursFile | null | undefined;
  radarLift: number;
  legendLayerProps: MapLayersFields['legendLayerProps'];
  // Legenda de vento
  state: Pick<
    MapChromeState,
    'locate' | 'locating' | 'handleShareView' | 'windLegendOpen' |
    'openWindLegend' | 'closeWindLegend' | 'windLegendHintVisible' |
    'mapInstanceRef' | 'zoomIn' | 'zoomOut' | 'legendPref' | 'setLegendPref' |
    'scrubOpen' | 'setScrubOpen' | 'scrubH' | 'setScrubH' |
    'hoursOn' | 'hoursLive' | 'hoursTimes' | 'hoursFrame' | 'hoursFile' |
    'hoursHudPaused' | 'hoursUserPaused' | 'hoursScrubbing' |
    'setHoursScrubbing' | 'hoursSetFrame' | 'hoursSetUserPaused' |
    'timeTrackChips'
  >;
  windButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export default function MapChromeZone({
  t,
  locale,
  isFullscreen,
  isMobile,
  isHeroEmbed,
  controls,
  locateLabel,
  shareLabel,
  isobathsEnabled,
  isobathsData,
  radarLift,
  legendLayerProps,
  state,
  windButtonRef,
}: MapChromeZoneProps) {
  const {
    locate, locating, handleShareView,
    windLegendOpen, openWindLegend, closeWindLegend,
    windLegendHintVisible,
  } = state;

  // UX v3 §1/§2 — na rota /mapa a saída é o logo/Esc (a maquete não tem
  // botão de saída); no overlay fullscreen (/spots/ grid) a pilha precisa
  // de um «Sair» explícito — também é o alvo de foco ao entrar.
  const pathname = usePathname() || '';
  const isMapRoute =
    pathname === `/${locale}/mapa` || pathname === `/${locale}/mapa/`;

  // UX v3 §4 — legenda: preferência persistida; por omissão aberta no
  // desktop, fechada no mobile (a pilha tem o toggle em ambos).
  const legendOpen = state.legendPref ?? !isMobile;
  // A legenda sobe por cima do scrubber aberto (40 px base + altura + 12 px).
  const legendBottom = state.scrubOpen && state.hoursOn ? state.scrubH + 52 : 34;

  // §12 — no mobile a legenda ancora no topo (top-16, por baixo da pill);
  // a altura é limitada ao espaço livre acima do scrubber aberto ou do
  // topo do sheet, com scroll interno — nunca colide a 390 px.
  const [legendCap, setLegendCap] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!isMobile || !legendOpen) {
      setLegendCap(undefined);
      return;
    }
    // rAF enquanto a legenda está aberta: o sheet pode estar a animar e o
    // scrubber segue-o — uma medida única ficava obsoleta a meio do drag.
    let raf = 0;
    const measure = () => {
      const scrubTop = document
        .querySelector<HTMLElement>('[data-map-hours-scrubber]')
        ?.getBoundingClientRect().top;
      const sheetTop = document
        .querySelector<HTMLElement>('[data-explore-sheet]')
        ?.getBoundingClientRect().top;
      const bound =
        Math.min(scrubTop ?? Number.POSITIVE_INFINITY, sheetTop ?? Number.POSITIVE_INFINITY, window.innerHeight) - 8;
      // A legenda ancora a top-16 dentro do shell (que começa sob o header
      // de 48 px) → topo absoluto = 48 + 64 = 112.
      const next = Math.round(bound - 112);
      setLegendCap((prev) => (prev === next ? prev : next));
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [isMobile, legendOpen]);

  // Se a faixa livre não chega a 120 px (sheet a meio/aberto + scrubber),
  // o cartão flutuante é suprimido — a preferência mantém-se e a legenda
  // canónica continua no sheet (MapLegend embedded, zona M3).
  const legendVisible =
    legendOpen && (!isMobile || legendCap == null || legendCap >= 120);

  // Pill temporal: liga a camada «48 h» se ainda estiver desligada e
  // abre/fecha o scrubber (maquete: o toggle da camada é o interruptor
  // principal, a pill é a vista).
  const toggleScrub = () => {
    if (!state.hoursOn) controls.toggleHours();
    state.setScrubOpen(!state.scrubOpen);
  };

  return (
    <>
      {/* Auditoria 2026-09-16 (C4): o banner toast sobre o mapa saiu —
          chrome+toast cobriam ~55% do viewport mobile. O mesmo aviso vive
          agora só no chip compacto do HUD (BuoyLayerChip), ligado ao
          mesmo useBuoyLayerNotice. */}
      {isFullscreen && !isHeroEmbed ? (
        /* UX v3 §4/maquete — pilha vertical à direita: zoom (pointer fino),
           localizar, camadas, vento, legenda, partilhar. Substitui o pill
           centrado (MapControls) + os quick actions (MapQuickActions). */
        <MapControlStack
          controls={controls}
          locateLabel={locateLabel}
          shareLabel={shareLabel}
          locating={locating}
          onLocate={locate}
          onShare={handleShareView}
          onZoomIn={state.zoomIn}
          onZoomOut={state.zoomOut}
          legendOpen={legendVisible}
          onToggleLegend={() => state.setLegendPref(!legendOpen)}
          legendLabel={t.spotsMap.mapLegend}
          controlsLabel={t.mapUiChrome.controlsLabel}
          zoomInLabel={t.mapUiChrome.zoomIn}
          zoomOutLabel={t.mapUiChrome.zoomOut}
          windToggleLabel={t.map.wind}
          exitLabel={isMapRoute ? undefined : t.map.exitFullscreen}
          onExit={isMapRoute ? undefined : controls.exitFullscreen}
        />
      ) : (
        <MapControls {...controls} />
      )}

      {/* Pill «Agora · HH:MM» + scrubber 48 h — topo e fundo centrados. */}
      {isFullscreen && !isHeroEmbed && (
        <MapTimeChrome
          t={t}
          locale={locale}
          isMobile={isMobile}
          hoursOn={state.hoursOn}
          hoursLive={state.hoursLive}
          hoursTimes={state.hoursTimes}
          hoursFrame={state.hoursFrame}
          hoursFile={state.hoursFile}
          hoursHudPaused={state.hoursHudPaused}
          hoursUserPaused={state.hoursUserPaused}
          mapInstanceRef={state.mapInstanceRef}
          onIndexChange={state.hoursSetFrame}
          onUserPausedChange={state.hoursSetUserPaused}
          onScrubbingChange={state.setHoursScrubbing}
          scrubOpen={state.scrubOpen}
          onToggleScrub={toggleScrub}
          onSizeChange={state.setScrubH}
          timeTrackChips={state.timeTrackChips}
        />
      )}

      {windLegendHintVisible && (
        <div
          role="note"
          aria-label={t.map.windRingLegend.help}
          className="absolute z-[1150] bottom-32 left-3 right-3 sm:right-auto sm:w-[320px] rounded-card border border-divider bg-bg-elevated shadow-card px-4 py-3 motion-reduce:animate-none animate-fade-up"
        >
          <p className="text-body-sm font-semibold text-fg mb-1">{t.map.windRingLegend.title}</p>
          <p className="text-meta-sm text-fg-muted leading-snug">{t.map.windRingLegend.rule}</p>
          <button
            type="button"
            onClick={openWindLegend}
            className="mt-2 text-meta-sm font-semibold text-accent hover:underline underline-offset-2"
          >
            {t.map.windRingLegend.help}
          </button>
        </div>
      )}

      {/* UX v3 §4 — legenda flutuante controlada pela pilha: bottom-right
          no desktop (acima do scrubber aberto), top-right no mobile. Nos
          embeds/hero mantém-se o comportamento anterior (colapsável). */}
      {isFullscreen ? (
        <MapLegend
          locale={locale}
          chrome={{
            open: legendVisible,
            mobile: isMobile,
            bottomOffset: legendBottom,
            maxHeight: isMobile ? legendCap : undefined,
          }}
          {...legendLayerProps}
        />
      ) : (
        (!isHeroEmbed || (isobathsEnabled && isobathsData != null)) && (
          <MapLegend
            locale={locale}
            reserveHudSpace={isFullscreen && isMobile}
            hudLift={isFullscreen ? radarLift : 0}
            placement={isHeroEmbed ? 'hero' : 'map'}
            {...legendLayerProps}
          />
        )
      )}

      {!isFullscreen && !isHeroEmbed && (
        <p className="absolute z-[1000] max-w-[min(100%,280px)] px-2.5 py-1 rounded-md text-meta-sm text-fg-muted bg-bg-elevated/90 border border-divider shadow-sm pointer-events-none max-md:hidden bottom-14 left-1/2 -translate-x-1/2">
          {t.map.mapDataHint}
        </p>
      )}

      <WindRingLegend open={windLegendOpen} onClose={closeWindLegend} anchorRef={windButtonRef} locale={locale} />
    </>
  );
}
