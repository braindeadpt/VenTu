'use client';

/**
 * MapChromeZone — compartimento «cromo» do mapa (dono M2,
 * docs/design/MAP-ZONES.md): barra de ferramentas (MapControls), acções
 * rápidas (localizar/partilhar), legenda, pill/track de tempo (48 h + maré +
 * térmica + radar) e legenda de vento. Estado e JSX movidos do
 * SpotMapInteractive sem alteração de comportamento.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import MapTimeTrack from '../MapTimeTrack';
import MapTideChip from '../MapTideChip';
import MapThermalChip from '../MapThermalChip';
// M6 (CORRECCOES-24SET): o cromo CSS vive num bloco delimitado da
// globals.css («MAPA — CROMO UX V3») — já não há import por ficheiro.

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

// A vista (pilha de controlos, pill/scrubber, legenda, modal de vento)
// vive em MapChromeZoneView.tsx — chunk dinâmico (M7-F).
