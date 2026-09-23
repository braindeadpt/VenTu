'use client';

/**
 * MapChromeZone — compartimento «cromo» do mapa (dono M2,
 * docs/design/MAP-ZONES.md): barra de ferramentas (MapControls), acções
 * rápidas (localizar/partilhar), legenda, pill/track de tempo (48 h + maré +
 * térmica + radar) e legenda de vento. Estado e JSX movidos do
 * SpotMapInteractive sem alteração de comportamento.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
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
  mapHoursClock,
  type MapHoursFile,
} from '@/lib/mapHours';
import { mapTideChipAt, pickMapTideCurve } from '@/lib/mapTideChip';
import { thermalHudAt } from '@/lib/mapThermal';
import type { IsobathContoursFile } from '@/lib/isobaths';
import MapControls from '../components/MapControls';
import MapQuickActions from '../components/MapQuickActions';
import MapLegend from '../../MapLegend';
import WindRingLegend from '../../WindRingLegend';
import MapTimeTrack from '../MapTimeTrack';
import MapTideChip from '../MapTideChip';
import MapThermalChip from '../MapThermalChip';
import type { MapLayersFields } from './MapLayersZone';

type MapTranslation = ReturnType<typeof getTranslation>;

// ─── Estado: localizar/partilhar, legenda de vento, trilho temporal ───

interface UseMapChromeZoneParams {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  /** Contentor observado pelo trilho temporal (autoplay fora do ecrã). */
  observeRef: React.RefObject<HTMLElement | null>;
  isReady: boolean;
  locale: string;
  isPt: boolean;
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
  isPt,
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
  const hoursClock = hoursTimes[hoursFrame] ? mapHoursClock(hoursTimes[hoursFrame]) : '';
  const tideChip = useMemo(() => {
    const curve = pickMapTideCurve(hoursFile?.tides, selectedRegion);
    if (!curve) return undefined;
    const at = hoursLive && hoursTimes[hoursFrame]
      ? new Date(hoursTimes[hoursFrame])
      : new Date();
    const model = mapTideChipAt(curve, at, isPt ? 'pt' : 'en');
    if (!model) return undefined;
    const phaseLabel =
      model.phase === 'rising' ? t.mapUiChrome.tideChipRising
        : model.phase === 'falling' ? t.mapUiChrome.tideChipFalling
          : model.phase === 'high' ? t.mapUiChrome.tideChipHigh
            : t.mapUiChrome.tideChipLow;
    const kindLabel = model.nextKind === 'high'
      ? t.mapUiChrome.tideChipHigh
      : model.nextKind === 'low' ? t.mapUiChrome.tideChipLow
        : '';
    const ariaLabel = model.nextTime && kindLabel
      ? t.mapUiChrome.tideChipAriaNext
        .replace('{phase}', phaseLabel)
        .replace('{kind}', kindLabel)
        .replace('{time}', model.nextTime)
      : t.mapUiChrome.tideChipAria.replace('{phase}', phaseLabel);
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
    isPt,
    t.mapUiChrome.tideChipRising,
    t.mapUiChrome.tideChipFalling,
    t.mapUiChrome.tideChipHigh,
    t.mapUiChrome.tideChipLow,
    t.mapUiChrome.tideChipAria,
    t.mapUiChrome.tideChipAriaNext,
  ]);

  const thermalChip = useMemo(() => {
    const summary = thermalHudAt(hoursFile, hoursLive ? hoursFrame : 0);
    if (!summary) return undefined;
    const kindLabel = summary.kind === 'sea' ? t.mapUiChrome.thermalSea : t.mapUiChrome.thermalLand;
    const ariaLabel = t.mapUiChrome.thermalChipAria
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
    t.mapUiChrome.thermalSea,
    t.mapUiChrome.thermalLand,
    t.mapUiChrome.thermalChipAria,
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

  // Time track partilhado — o mesmo nó que o HUD antigo recebia.
  const timeTrackNode = hoursLive ? (
    <MapTimeTrack
      variant="hud"
      mode="hours"
      length={hoursTimes.length}
      index={hoursFrame}
      onIndexChange={handleHoursFrameChange}
      paused={hoursHudPaused}
      userPaused={hoursUserPaused}
      onUserPausedChange={handleHoursUserPausedChange}
      onScrubbingChange={setHoursScrubbing}
      clock={hoursClock}
      tideChip={timeTrackChips}
      labels={{
        scrub: t.mapUiChrome.hoursScrub,
        play: t.mapUiChrome.hoursPlay,
        pause: t.mapUiChrome.hoursPause,
      }}
    />
  ) : radarEnabled && radarFrameList.length > 1 ? (
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
        scrub: t.mapUiChrome.radarScrub,
        play: t.mapUiChrome.radarPlay,
        pause: t.mapUiChrome.radarPause,
      }}
    />
  ) : undefined;

  // ── «Perto de mim» + «Partilhar vista» (fullscreen /mapa) ──
  const { showToast } = useToast();
  const { locate, locating } = useMapLocate({
    mapInstanceRef,
    isReady,
    labels: {
      locate: t.mapUiChrome.locateMe,
      here: t.mapUiChrome.locateHere,
      denied: t.mapUiChrome.locateDenied,
      unavailable: t.mapUiChrome.locateUnavailable,
      timeout: t.mapUiChrome.locateTimeout,
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
      showToast(t.mapUiChrome.shareCopied);
    } catch {
      // AbortError (partilha cancelada) ou clipboard negado — sem toast.
    }
  }, [
    mapInstanceRef, locale, selectedSport, selectedRegion,
    radarEnabled, isobathsEnabled, hoursOn, buoysEnabled,
    hsEnabled, sstEnabled, currentsEnabled, showToast, t.mapUiChrome.shareCopied,
  ]);

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

  const exitFullscreenLabel = t.mapUiChrome.exitFullscreen;
  const windLabel = windEnabled ? t.mapUiChrome.hideWind : t.mapUiChrome.showWind;
  const windHint = null;
  const windLegendHelpLabel = t.mapUiChrome.windRingLegend.help;

  return {
    locate, locating, handleShareView,
    windLegendOpen, openWindLegend, closeWindLegend,
    windLegendHintVisible, onMarkerInteract,
    radarScrubbing, timeTrackNode,
    exitFullscreenLabel, windLabel, windHint, windLegendHelpLabel,
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
    'openWindLegend' | 'closeWindLegend' | 'windLegendHintVisible'
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

  return (
    <>
      {/* Auditoria 2026-09-16 (C4): o banner toast sobre o mapa saiu —
          chrome+toast cobriam ~55% do viewport mobile. O mesmo aviso vive
          agora só no chip compacto do HUD (BuoyLayerChip), ligado ao
          mesmo useBuoyLayerNotice. */}
      <MapControls {...controls} />

      {/* Acções rápidas — «Perto de mim» e «Partilhar vista», mesma
          posição flutuante em desktop e mobile (o pill de controlos
          está centrado e o sheet em baixo). */}
      {isFullscreen && (
        <MapQuickActions
          locateLabel={locateLabel}
          shareLabel={shareLabel}
          locating={locating}
          onLocate={locate}
          onShare={handleShareView}
        />
      )}

      {windLegendHintVisible && (
        <div
          role="note"
          aria-label={t.mapUiChrome.windRingLegend.help}
          className="absolute z-[1150] bottom-32 left-3 right-3 sm:right-auto sm:w-[320px] rounded-card border border-divider bg-bg-elevated shadow-card px-4 py-3 motion-reduce:animate-none animate-fade-up"
        >
          <p className="text-body-sm font-semibold text-fg mb-1">{t.mapUiChrome.windRingLegend.title}</p>
          <p className="text-meta-sm text-fg-muted leading-snug">{t.mapUiChrome.windRingLegend.rule}</p>
          <button
            type="button"
            onClick={openWindLegend}
            className="mt-2 text-meta-sm font-semibold text-accent hover:underline underline-offset-2"
          >
            {t.mapUiChrome.windRingLegend.help}
          </button>
        </div>
      )}

      {/* Legenda flutuante — escondida no fullscreen mobile: lá vive
          dentro do <details> do sheet (uma legenda por superfície). */}
      {!(isFullscreen && isMobile) && (!isHeroEmbed || (isobathsEnabled && isobathsData != null)) && (
        <MapLegend
          locale={locale}
          reserveHudSpace={isFullscreen && isMobile}
          hudLift={isFullscreen ? radarLift : 0}
          placement={isHeroEmbed ? 'hero' : 'map'}
          {...legendLayerProps}
        />
      )}

      {!isFullscreen && !isHeroEmbed && (
        <p className="absolute z-[1000] max-w-[min(100%,280px)] px-2.5 py-1 rounded-md text-meta-sm text-fg-muted bg-bg-elevated/90 border border-divider shadow-sm pointer-events-none max-md:hidden bottom-14 left-1/2 -translate-x-1/2">
          {t.mapUiChrome.mapDataHint}
        </p>
      )}

      <WindRingLegend open={windLegendOpen} onClose={closeWindLegend} anchorRef={windButtonRef} locale={locale} />
    </>
  );
}
