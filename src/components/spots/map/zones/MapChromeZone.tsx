'use client';

/**
 * MapChromeZone — compartimento «cromo» do mapa (dono M2,
 * docs/design/MAP-ZONES.md): barra de ferramentas (MapControls), acções
 * rápidas (localizar/partilhar), legenda, pill/track de tempo (48 h + maré +
 * térmica + radar) e legenda de vento. Estado e JSX movidos do
 * SpotMapInteractive sem alteração de comportamento.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { usePathname } from 'next/navigation';
import type L from 'leaflet';
import { getTranslation } from '@/lib/i18n';
import type { GridSportFilter } from '@/lib/sportRatings';
import { useToast } from '@/components/ui/ToastProvider';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useMapLocate } from '../hooks/useMapLocate';
import { useMapTimeTrack } from '../useMapTimeTrack';
import { buildMapShareUrl } from '@/lib/mapShareUrl';
import { hasSeenWindRingLegend, markWindRingLegendSeen } from '@/lib/windRingLegend';
import { radarFrameClock } from '@/lib/ipmaRadar';
import {
  MAP_HOURS_TICK_MS,
  type MapHoursFile,
} from '@/lib/mapHours';
import { mapTideChipAt, pickMapTideCurve } from '@/lib/mapTideChip';
import { thermalHudAt } from '@/lib/mapThermal';
import type { IsobathContoursFile } from '@/lib/isobaths';
import MapControls from '../components/MapControls';
import MapControlStack from '../components/MapControlStack';
import MapLegend from '../../MapLegend';
import WindRingLegend from '../../WindRingLegend';
import MapTimeTrack from '../MapTimeTrack';
import MapTimeChrome from '../MapTimeChrome';
import MapTideChip from '../MapTideChip';
import MapThermalChip from '../MapThermalChip';
import type { MapLayersFields } from './MapLayersZone';
import '../mapChrome.css';

type MapTranslation = ReturnType<typeof getTranslation>;

/** UX v3 §4 — preferência da legenda flutuante (null = ainda não escolhida). */
const MAP_LEGEND_LS_KEY = 'ventu.map.legend';

// ─── Estado: localizar/partilhar, legenda de vento, trilho temporal ───

interface UseMapChromeZoneParams {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  /** Contentor observado pelo trilho temporal (autoplay fora do ecrã). */
  observeRef: React.RefObject<HTMLElement | null>;
  isReady: boolean;
  locale: string;
  selectedSport: GridSportFilter;
  selectedRegion: string;
  windEnabled: boolean;
  // Estados das camadas usados pelo trilho e pela partilha (dono M5)
  radarEnabled: boolean;
  radarFrameList: Array<{ url: string; frameTime: string | null }>;
  radarFrameIndex: number;
  radarBusySources: Set<string>;
  radarUserPaused: boolean;
  hoursOn: boolean;
  hoursLive: boolean;
  hoursTimes: readonly string[];
  hoursFrame: number;
  hoursUserPaused: boolean;
  hoursFile: MapHoursFile | null | undefined;
  isobathsEnabled: boolean;
  buoysEnabled: boolean;
  hsEnabled: boolean;
  sstEnabled: boolean;
  currentsEnabled: boolean;
  handleHoursFrameChange: (index: number) => void;
  handleHoursUserPausedChange: (paused: boolean) => void;
  handleRadarFrameChange: (index: number) => void;
  handleRadarUserPausedChange: (paused: boolean) => void;
  t: MapTranslation;
}

export function useMapChromeZone({
  mapInstanceRef,
  observeRef,
  isReady,
  locale,
  selectedSport,
  selectedRegion,
  windEnabled,
  radarEnabled,
  radarFrameList,
  radarFrameIndex,
  radarBusySources,
  radarUserPaused,
  hoursOn,
  hoursLive,
  hoursTimes,
  hoursFrame,
  hoursUserPaused,
  hoursFile,
  isobathsEnabled,
  buoysEnabled,
  hsEnabled,
  sstEnabled,
  currentsEnabled,
  handleHoursFrameChange,
  handleHoursUserPausedChange,
  handleRadarFrameChange,
  handleRadarUserPausedChange,
  t,
}: UseMapChromeZoneParams) {
  const reducedMotion = usePrefersReducedMotion();
  const [radarScrubbing, setRadarScrubbing] = useState(false);
  const [hoursScrubbing, setHoursScrubbing] = useState(false);
  const radarHudPaused =
    radarScrubbing || radarBusySources.size > 0 || radarUserPaused || reducedMotion || hoursOn;
  const radarClock = radarFrameClock(radarFrameList[radarFrameIndex]?.frameTime ?? null) ?? '';
  const { paused: hoursHudPaused } = useMapTimeTrack({
    length: hoursLive ? hoursTimes.length : 0,
    index: hoursFrame,
    onIndexChange: handleHoursFrameChange,
    mapBusyCount: radarBusySources.size,
    userPaused: hoursUserPaused,
    externalScrubbing: hoursScrubbing,
    tickMs: MAP_HOURS_TICK_MS,
    observeRef,
  });
  const tideChip = useMemo(() => {
    const curve = pickMapTideCurve(hoursFile?.tides, selectedRegion);
    if (!curve) return undefined;
    const at = hoursLive && hoursTimes[hoursFrame]
      ? new Date(hoursTimes[hoursFrame])
      : new Date();
    const model = mapTideChipAt(curve, at, locale);
    if (!model) return undefined;
    const phaseLabel =
      model.phase === 'rising' ? t.map.tideChipRising
        : model.phase === 'falling' ? t.map.tideChipFalling
          : model.phase === 'high' ? t.map.tideChipHigh
            : t.map.tideChipLow;
    const kindLabel = model.nextKind === 'high'
      ? t.map.tideChipHigh
      : model.nextKind === 'low' ? t.map.tideChipLow
        : '';
    const ariaLabel = model.nextTime && kindLabel
      ? t.map.tideChipAriaNext
        .replace('{phase}', phaseLabel)
        .replace('{kind}', kindLabel)
        .replace('{time}', model.nextTime)
      : t.map.tideChipAria.replace('{phase}', phaseLabel);
    return (
      <MapTideChip
        phase={model.phase}
        phaseLabel={phaseLabel}
        nextTime={model.nextTime}
        ariaLabel={ariaLabel}
      />
    );
  }, [
    hoursFile,
    selectedRegion,
    hoursLive,
    hoursTimes,
    hoursFrame,
    locale,
    t.map.tideChipRising,
    t.map.tideChipFalling,
    t.map.tideChipHigh,
    t.map.tideChipLow,
    t.map.tideChipAria,
    t.map.tideChipAriaNext,
  ]);

  const thermalChip = useMemo(() => {
    const summary = thermalHudAt(hoursFile, hoursLive ? hoursFrame : 0);
    if (!summary) return undefined;
    const kindLabel = summary.kind === 'sea' ? t.map.thermalSea : t.map.thermalLand;
    const ariaLabel = t.map.thermalChipAria
      .replace('{kind}', kindLabel)
      .replace('{count}', String(summary.count));
    return (
      <MapThermalChip
        kind={summary.kind}
        kindLabel={kindLabel}
        count={summary.count}
        ariaLabel={ariaLabel}
      />
    );
  }, [
    hoursFile,
    hoursLive,
    hoursFrame,
    t.map.thermalSea,
    t.map.thermalLand,
    t.map.thermalChipAria,
  ]);

  const timeTrackChips = tideChip || thermalChip ? (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      {tideChip}
      {thermalChip}
    </span>
  ) : undefined;

  useEffect(() => {
    if (!radarEnabled) setRadarScrubbing(false);
  }, [radarEnabled]);
  useEffect(() => {
    if (!hoursOn) setHoursScrubbing(false);
  }, [hoursOn]);

  // Time track partilhado — UX v3 §4: no /mapa fullscreen o trilho «48 h»
  // é o scrubber do MapTimeChrome (barras por escalão), por isso este nó só
  // cobre o radar; embeds continuam a recebê-lo via MapTimeTrack.
  const timeTrackNode = radarEnabled && radarFrameList.length > 1 ? (
    <MapTimeTrack
      variant="hud"
      mode="radar"
      length={radarFrameList.length}
      index={radarFrameIndex}
      onIndexChange={handleRadarFrameChange}
      paused={radarHudPaused}
      userPaused={radarUserPaused}
      onUserPausedChange={handleRadarUserPausedChange}
      onScrubbingChange={setRadarScrubbing}
      clock={radarClock}
      tideChip={timeTrackChips}
      labels={{
        scrub: t.map.radarScrub,
        play: t.map.radarPlay,
        pause: t.map.radarPause,
      }}
    />
  ) : undefined;

  // ── «Perto de mim» + «Partilhar vista» (fullscreen /mapa) ──
  const { showToast } = useToast();
  const { locate, locating } = useMapLocate({
    mapInstanceRef,
    isReady,
    labels: {
      locate: t.map.locateMe,
      here: t.map.locateHere,
      denied: t.map.locateDenied,
      unavailable: t.map.locateUnavailable,
      timeout: t.map.locateTimeout,
    },
    onToast: showToast,
  });
  const handleShareView = useCallback(async () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const c = map.getCenter();
    const url = buildMapShareUrl(`${window.location.origin}/${locale}/mapa/`, {
      center: [c.lat, c.lng],
      zoom: map.getZoom(),
      sport: selectedSport,
      region: selectedRegion,
      layers: {
        radar: radarEnabled,
        isobaths: isobathsEnabled,
        hours: hoursOn,
        buoys: buoysEnabled,
        hs: hsEnabled,
        sst: sstEnabled,
        currents: currentsEnabled,
      },
    });
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'VenTu', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast(t.map.shareCopied);
    } catch {
      // AbortError (partilha cancelada) ou clipboard negado — sem toast.
    }
  }, [
    mapInstanceRef, locale, selectedSport, selectedRegion,
    radarEnabled, isobathsEnabled, hoursOn, buoysEnabled,
    hsEnabled, sstEnabled, currentsEnabled, showToast, t.map.shareCopied,
  ]);

  // ── UX v3 §4 — pilha de controlos: zoom (pointer fino) ──
  const zoomIn = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (reducedMotion) map.setZoom(map.getZoom() + 1);
    else map.zoomIn();
  }, [mapInstanceRef, reducedMotion]);
  const zoomOut = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (reducedMotion) map.setZoom(map.getZoom() - 1);
    else map.zoomOut();
  }, [mapInstanceRef, reducedMotion]);

  // ── UX v3 §4 — legenda flutuante controlada pela pilha ──
  // Preferência persistida; default: aberta no desktop, fechada no mobile.
  const [legendPref, setLegendPrefState] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const v = window.localStorage.getItem(MAP_LEGEND_LS_KEY);
      return v === null ? null : v === '1';
    } catch {
      return null;
    }
  });
  const setLegendPref = useCallback((v: boolean) => {
    setLegendPrefState(v);
    try {
      window.localStorage.setItem(MAP_LEGEND_LS_KEY, v ? '1' : '0');
    } catch {
      /* storage indisponível — a sessão mantém o estado em memória */
    }
  }, []);

  // ── UX v3 §4 — scrubber 48 h: «Camadas → 48 h» abre-o; a pill alterna. ──
  const [scrubOpen, setScrubOpen] = useState(false);
  const [scrubH, setScrubH] = useState(0);
  useEffect(() => {
    if (hoursOn && hoursFile !== null) setScrubOpen(true);
    else if (!hoursOn) setScrubOpen(false);
    if (hoursFile === null) setScrubOpen(false);
  }, [hoursOn, hoursFile]);

  // ── Wind legend ──
  const [windLegendOpen, setWindLegendOpen] = useState(false);
  const openWindLegend = useCallback(() => { setWindLegendOpen(true); }, []);
  const closeWindLegend = useCallback(() => { setWindLegendOpen(false); }, []);

  // One-time inline teaching hint (non-modal, never blocks the map). Shows
  // once after the user's FIRST marker interaction, then never again
  // (persisted via the same localStorage flag the ? button honors).
  const [windLegendHintVisible, setWindLegendHintVisible] = useState(false);
  const windLegendHintQueuedRef = useRef(false);
  const onMarkerInteract = useCallback(() => {
    if (windLegendHintQueuedRef.current || hasSeenWindRingLegend()) return;
    windLegendHintQueuedRef.current = true;
    markWindRingLegendSeen();
    setWindLegendHintVisible(true);
  }, []);
  useEffect(() => {
    if (!windLegendHintVisible) return;
    const id = window.setTimeout(() => setWindLegendHintVisible(false), 12_000);
    return () => window.clearTimeout(id);
  }, [windLegendHintVisible]);

  const exitFullscreenLabel = t.map.exitFullscreen;
  const windLabel = windEnabled ? t.map.hideWind : t.map.showWind;
  const windHint = null;
  const windLegendHelpLabel = t.map.windRingLegend.help;

  return {
    locate, locating, handleShareView,
    windLegendOpen, openWindLegend, closeWindLegend,
    windLegendHintVisible, onMarkerInteract,
    radarScrubbing, timeTrackNode,
    exitFullscreenLabel, windLabel, windHint, windLegendHelpLabel,
    // UX v3 §4 — pilha de controlos + chrome temporal
    mapInstanceRef,
    zoomIn, zoomOut,
    legendPref, setLegendPref,
    scrubOpen, setScrubOpen, scrubH, setScrubH,
    hoursOn, hoursLive, hoursTimes, hoursFrame, hoursFile,
    hoursHudPaused, hoursUserPaused, hoursScrubbing,
    setHoursScrubbing,
    hoursSetFrame: handleHoursFrameChange,
    hoursSetUserPaused: handleHoursUserPausedChange,
    timeTrackChips,
  };
}

export type MapChromeState = ReturnType<typeof useMapChromeZone>;

// ─── Vista: toolbar, acções rápidas, hint de vento, legenda e modal ───

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

export function MapChromeZone({
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
