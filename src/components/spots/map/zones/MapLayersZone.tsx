'use client';

/**
 * MapLayersZone — compartimento «camadas» do mapa (dono M5,
 * docs/design/MAP-ZONES.md): menu Camadas (itens partilhados com o sheet),
 * basemap, camadas raster/vectoriais (radar, Hs, SST, correntes, isóbatas,
 * batimetria, sinalização, avisos costeiros, boias), campo de vento e
 * indicadores de tiles. Estado e JSX movidos do SpotMapInteractive sem
 * alteração de comportamento.
 */

import { useCallback, useEffect, useMemo } from 'react';
import type L from 'leaflet';
import {
  Activity, Anchor, Clock, CloudRain, LifeBuoy,
  Mountain, Navigation, RotateCcw, Sailboat,
  Thermometer, Waves,
} from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import {
  OPEN_METEO_ATTRIBUTION,
  type BasemapLoadState,
} from '@/lib/map-constants';
import { openMeteoAttributionHtml } from '@/lib/openMeteoAttribution';
import type { IpmaRadarData } from '@/lib/ipmaRadar';
import type { MapLayersMenuItem } from '../components/MapLayersMenu';
import { useMapLayers } from '../hooks/useMapLayers';
import { useMapHours } from '../hooks/useMapHours';
import { useMapBuoyDots } from '../hooks/useMapBuoyDots';
import { useMapAttribution } from '../hooks/useMapAttribution';
import { useMapHsField } from '../hooks/useMapHsField';
import { useMapSstField } from '../hooks/useMapSstField';
import { useMapCurrentsField } from '../hooks/useMapCurrentsField';
import { useMapWindField } from '../hooks/useMapWindField';
import MapLayerToggle from '../../MapLayerToggle';
import type { BasemapMode } from '../../MapLayerToggle';
import RadarCarousel from '../../RadarCarousel';
import type { FieldSpot } from '@/lib/mapHsField';

type MapTranslation = ReturnType<typeof getTranslation>;

// ─── Estado base das camadas (radar, 48 h, boias, isóbatas, batimetria,
//     sinalização, avisos) + créditos de atribuição ───

interface UseMapLayersBaseParams {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  radarOverlayRef: React.MutableRefObject<L.ImageOverlay | null>;
  isobathsLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  coastalLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  buoyLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  isReady: boolean;
  locale: string;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  focusSpotId?: string;
  initialRadarEnabled: boolean;
  initialIsobathsEnabled: boolean;
  initialHoursEnabled: boolean;
  initialHourOfDay: number | null;
  initialBuoysEnabled: boolean;
  t: MapTranslation;
}

export function useMapLayersBase({
  mapInstanceRef,
  LRef,
  radarOverlayRef,
  isobathsLayerRef,
  coastalLayerRef,
  buoyLayerRef,
  isReady,
  locale,
  isFullscreen,
  isHeroEmbed,
  focusSpotId,
  initialRadarEnabled,
  initialIsobathsEnabled,
  initialHoursEnabled,
  initialHourOfDay,
  initialBuoysEnabled,
  t,
}: UseMapLayersBaseParams) {
  const layers = useMapLayers({
    mapInstanceRef,
    LRef,
    isReady,
    locale,
    isFullscreen,
    isHeroEmbed,
    focusSpotId,
    initialRadarEnabled,
    initialIsobathsEnabled,
    radarOverlayRef,
    isobathsLayerRef,
    coastalLayerRef,
    t,
  });

  const hours = useMapHours({
    isFullscreen,
    initialEnabled: initialHoursEnabled,
    initialHourOfDay,
  });

  const { buoysEnabled, toggleBuoys } = useMapBuoyDots({
    mapInstanceRef,
    LRef,
    buoyLayerRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    initialEnabled: initialBuoysEnabled,
    labels: {
      hs: t.map.buoyHs,
      stale: t.map.buoyStale,
      sourceIh: t.map.buoySourceIh,
      sourceWmo: t.map.buoySourceWmo,
      noHs: t.map.buoyNoHs,
    },
  });

  // Créditos do controlo Leaflet — espelhados dentro do sheet/painel, que
  // tapam o controlo real no fullscreen (licença OSM/CARTO/Open-Meteo).
  const attributionHtml = useMapAttribution(mapInstanceRef, isReady);

  // O crédito do basemap e das camadas é gerido pelo próprio Leaflet: cada
  // layer regista `attribution` ao entrar no mapa e o AttributionControl faz
  // add/remove por contagem de referências (os efeitos IH em useMapLayers
  // usam add/removeAttribution; basemap/EMODnet/OpenSeaMap/radar vão na opção
  // `attribution` do layer). NÃO regravar `_attributions` aqui — a fotografia
  // antiga apagava os créditos EMODnet/OpenSeaMap/radar registados pelas
  // camadas e deixava o crédito OSM duplicado.
  // A única excepção é o crédito do Open-Meteo: o controlo nasce em useMapCore
  // com a cadeia canónica EN (que não conhece a tradução) e aqui troca-se pelo
  // lead-in localizado.
  const openMeteoCredit = openMeteoAttributionHtml(t.map.weatherCredit);
  useEffect(() => {
    if (!isReady) return;
    const ac = mapInstanceRef.current?.attributionControl;
    if (!ac || openMeteoCredit === OPEN_METEO_ATTRIBUTION) return;
    ac.removeAttribution(OPEN_METEO_ATTRIBUTION);
    ac.addAttribution(openMeteoCredit);
    return () => {
      ac.removeAttribution(openMeteoCredit);
      ac.addAttribution(OPEN_METEO_ATTRIBUTION);
    };
  }, [isReady, openMeteoCredit, mapInstanceRef]);

  return { ...layers, ...hours, buoysEnabled, toggleBuoys, attributionHtml };
}

export type MapLayersBase = ReturnType<typeof useMapLayersBase>;

// ─── Campos interpolados (Hs, SST, correntes, vento) + itens do menu
//     Camadas + props da legenda + rótulos das camadas ───

/** Rótulos/hints das camadas — usados pelo menu Camadas (sheet) e pelos
 *  controlos do cromo (toolbar/painel). */
export interface MapLayerCopy {
  radarLabel: string;
  radarHint: string;
  radarResetLabel: string;
  hoursLabel: string;
  hoursHint: string;
  hoursResetLabel: string;
  buoysLabel: string;
  buoysHint: string;
  hsLabel: string;
  hsHint: string;
  sstLabel: string;
  sstHint: string;
  currentsLabel: string;
  currentsHint: string;
  isobathsLabel: string;
  isobathsHint: string;
  bathymetryLabel: string;
  bathymetryHint: string;
  seamarksLabel: string;
  seamarksHint: string;
  coastalWarningsLabel: string;
  coastalWarningsHint: string;
  layersMenuLabel: string;
}

interface UseMapLayersFieldsParams {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  isReady: boolean;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  isMobile: boolean;
  initialHsEnabled: boolean;
  initialSstEnabled: boolean;
  initialCurrentsEnabled: boolean;
  /** Estado base (radar/48 h/boias/etc.) — lido pelos itens do menu e legenda. */
  base: MapLayersBase;
  /** Spots mínimos para os campos interpolados (mesma fonte dos marcadores). */
  hsSpots: FieldSpot[];
  /** Toggle de vento partilhado — o campo segue os anéis dos pins. */
  windEnabled: boolean;
  t: MapTranslation;
}

export function useMapLayersFields({
  mapInstanceRef,
  LRef,
  isReady,
  isFullscreen,
  isHeroEmbed,
  isMobile,
  initialHsEnabled,
  initialSstEnabled,
  initialCurrentsEnabled,
  base,
  hsSpots,
  windEnabled,
  t,
}: UseMapLayersFieldsParams) {
  const {
    radarEnabled, radarLabel, radarHint, radarUnavailable, toggleRadar,
    hoursFile, hoursLive, hoursFrame, hoursOn, hoursUnavailable, toggleHours,
    buoysEnabled, toggleBuoys,
    isobathsEnabled, isobathsData, toggleIsobaths,
    bathymetryEnabled, toggleBathymetry,
    seamarksEnabled, toggleSeamarks,
    coastalWarningsEnabled, toggleCoastalWarnings, coastalWarningsLabel,
  } = base;

  const { hsEnabled, hsUnavailable, toggleHs: toggleHsRaw, disableHs } = useMapHsField({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    initialEnabled: initialHsEnabled,
    hoursFile,
    hoursLive,
    hoursFrame,
    spots: hsSpots,
  });
  const { sstEnabled, sstUnavailable, toggleSst: toggleSstRaw, disableSst } = useMapSstField({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    initialEnabled: initialSstEnabled,
    hoursFile,
    hoursLive,
    hoursFrame,
    spots: hsSpots,
  });
  const { currentsEnabled, currentsUnavailable, toggleCurrents } = useMapCurrentsField({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    initialEnabled: initialCurrentsEnabled,
    hoursFile,
    hoursLive,
    hoursFrame,
    spots: hsSpots,
  });
  useMapWindField({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    enabled: windEnabled,
    hoursFile,
    hoursLive,
    hoursFrame,
    spots: hsSpots,
  });

  useEffect(() => {
    if (sstEnabled && hsEnabled) disableHs();
  }, [sstEnabled, hsEnabled, disableHs]);

  const toggleHs = useCallback(() => {
    if (!hsEnabled && sstEnabled) disableSst();
    toggleHsRaw();
  }, [hsEnabled, sstEnabled, toggleHsRaw, disableSst]);

  const toggleSst = useCallback(() => {
    if (!sstEnabled && hsEnabled) disableHs();
    toggleSstRaw();
  }, [sstEnabled, hsEnabled, toggleSstRaw, disableHs]);

  const layerCopy = useMemo<MapLayerCopy>(() => ({
    radarLabel,
    radarHint,
    radarResetLabel: t.map.radarReset,
    hoursLabel: hoursOn ? t.map.hideHours : t.map.showHours,
    hoursHint: t.map.hoursHint,
    hoursResetLabel: t.map.hoursReset,
    buoysLabel: buoysEnabled ? t.map.hideBuoys : t.map.showBuoys,
    buoysHint: t.map.buoysHint,
    hsLabel: hsEnabled ? t.map.hideHs : t.map.showHs,
    hsHint: t.map.hsHint,
    sstLabel: sstEnabled ? t.map.hideSst : t.map.showSst,
    sstHint: t.map.sstHint,
    currentsLabel: currentsEnabled ? t.map.hideCurrents : t.map.showCurrents,
    currentsHint: t.map.currentsHint,
    isobathsLabel: isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths,
    isobathsHint: t.map.isobathsHint,
    bathymetryLabel: bathymetryEnabled ? t.map.hideBathymetry : t.map.showBathymetry,
    bathymetryHint: t.map.bathymetryHint,
    seamarksLabel: seamarksEnabled ? t.map.hideSeamarks : t.map.showSeamarks,
    seamarksHint: t.map.seamarksHint,
    coastalWarningsLabel,
    coastalWarningsHint: t.map.coastalWarningsHint,
    layersMenuLabel: t.map.layersMenu,
  }), [
    radarLabel, radarHint,
    hoursOn, buoysEnabled, hsEnabled, sstEnabled, currentsEnabled,
    isobathsEnabled, bathymetryEnabled, seamarksEnabled, coastalWarningsLabel,
    t,
  ]);

  // Camadas de dados do sheet (mesmas do menu «Camadas» do desktop — com
  // rótulo, nunca ícones soltos) e primários do «Ver também».
  const sheetLayers: MapLayersMenuItem[] = useMemo(() => [
    {
      key: 'radar',
      label: layerCopy.radarLabel,
      hint: radarUnavailable ? `${layerCopy.radarHint} — indisponível` : layerCopy.radarHint,
      icon: <CloudRain className="w-4 h-4" aria-hidden />,
      pressed: radarEnabled,
      disabled: radarUnavailable,
      onToggle: toggleRadar,
      toggleAttr: 'data-map-radar-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'hours',
      label: layerCopy.hoursLabel,
      hint: hoursUnavailable ? `${layerCopy.hoursHint} — indisponível` : layerCopy.hoursHint,
      icon: <Clock className="w-4 h-4" aria-hidden />,
      pressed: hoursOn,
      disabled: hoursUnavailable,
      onToggle: toggleHours,
      toggleAttr: 'data-map-hours-toggle',
      iconClass: 'text-score-good',
    },
    {
      key: 'hs',
      label: layerCopy.hsLabel,
      hint: hsUnavailable ? `${layerCopy.hsHint} — indisponível` : layerCopy.hsHint,
      icon: <Activity className="w-4 h-4" aria-hidden />,
      pressed: hsEnabled,
      disabled: hsUnavailable,
      onToggle: toggleHs,
      toggleAttr: 'data-map-hs-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'sst',
      label: layerCopy.sstLabel,
      hint: sstUnavailable ? `${layerCopy.sstHint} — indisponível` : layerCopy.sstHint,
      icon: <Thermometer className="w-4 h-4" aria-hidden />,
      pressed: sstEnabled,
      disabled: sstUnavailable,
      onToggle: toggleSst,
      toggleAttr: 'data-map-sst-toggle',
      iconClass: 'text-data-period',
    },
    {
      key: 'currents',
      label: layerCopy.currentsLabel,
      hint: currentsUnavailable ? `${layerCopy.currentsHint} — indisponível` : layerCopy.currentsHint,
      icon: <Navigation className="w-4 h-4" aria-hidden />,
      pressed: currentsEnabled,
      disabled: currentsUnavailable,
      onToggle: toggleCurrents,
      toggleAttr: 'data-map-currents-toggle',
      iconClass: 'text-data-water',
    },
    {
      key: 'buoys',
      label: layerCopy.buoysLabel,
      hint: layerCopy.buoysHint,
      icon: <LifeBuoy className="w-4 h-4" aria-hidden />,
      pressed: buoysEnabled,
      onToggle: toggleBuoys,
      toggleAttr: 'data-map-buoys-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'isobaths',
      label: layerCopy.isobathsLabel,
      hint: layerCopy.isobathsHint,
      icon: <Waves className="w-4 h-4" aria-hidden />,
      pressed: isobathsEnabled,
      onToggle: toggleIsobaths,
      toggleAttr: 'data-map-isobaths-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'bathymetry',
      label: layerCopy.bathymetryLabel,
      hint: layerCopy.bathymetryHint,
      icon: <Mountain className="w-4 h-4" aria-hidden />,
      pressed: bathymetryEnabled,
      onToggle: toggleBathymetry,
      toggleAttr: 'data-map-bathymetry-toggle',
      iconClass: 'text-data-water',
    },
    {
      key: 'seamarks',
      label: layerCopy.seamarksLabel,
      hint: layerCopy.seamarksHint,
      icon: <Sailboat className="w-4 h-4" aria-hidden />,
      pressed: seamarksEnabled,
      onToggle: toggleSeamarks,
      toggleAttr: 'data-map-seamarks-toggle',
      iconClass: 'text-score-good',
    },
    {
      key: 'coastalWarnings',
      label: layerCopy.coastalWarningsLabel,
      hint: layerCopy.coastalWarningsHint,
      icon: <Anchor className="w-4 h-4" aria-hidden />,
      pressed: coastalWarningsEnabled,
      onToggle: toggleCoastalWarnings,
      toggleAttr: 'data-map-coastal-warnings-toggle',
      iconClass: 'text-score-poor',
    },
  ], [
    layerCopy,
    radarUnavailable, radarEnabled, toggleRadar,
    hoursUnavailable, hoursOn, toggleHours,
    hsUnavailable, hsEnabled, toggleHs,
    sstUnavailable, sstEnabled, toggleSst,
    currentsUnavailable, currentsEnabled, toggleCurrents,
    buoysEnabled, toggleBuoys,
    isobathsEnabled, toggleIsobaths,
    bathymetryEnabled, toggleBathymetry,
    seamarksEnabled, toggleSeamarks,
    coastalWarningsEnabled, toggleCoastalWarnings,
  ]);

  // Legenda — props partilhadas entre a flutuante (desktop) e a embutida
  // no <details> do sheet (mobile). Uma só legenda por superfície.
  const legendLayerProps = {
    isobathsTitle: t.map.isobathsLegend,
    isobathsVisible: isobathsEnabled && isobathsData != null,
    hsTitle: t.map.hsLegend,
    hsVisible: hsEnabled,
    sstTitle: t.map.sstLegend,
    sstVisible: sstEnabled,
    currentsTitle: t.map.currentsLegend,
    currentsVisible: currentsEnabled,
    windTitle: t.map.windLegend,
    windVisible: isFullscreen && !isHeroEmbed && windEnabled,
    bathymetryTitle: t.map.bathymetryLegend,
    bathymetryVisible: bathymetryEnabled,
    bathymetryContoursLabel: t.map.bathymetryContours,
    seamarksTitle: t.map.seamarksLegend,
    seamarksVisible: seamarksEnabled,
    seamarksMarksLabel: t.map.seamarksLegendMarks,
    warningsTitle: t.map.coastalWarningsLegend,
    warningsVisible: isFullscreen && !isHeroEmbed && coastalWarningsEnabled,
    warningsZoneLabel: t.map.coastalWarningsLegendZone,
    warningsOrcaLabel: t.map.coastalWarningsLegendOrca,
  };

  return {
    hsEnabled, hsUnavailable, toggleHs,
    sstEnabled, sstUnavailable, toggleSst,
    currentsEnabled, currentsUnavailable, toggleCurrents,
    layerCopy, sheetLayers, legendLayerProps,
  };
}

export type MapLayersFields = ReturnType<typeof useMapLayersFields>;

// ─── Vista: indicadores de tiles, basemap flutuante, botões do hero e
//     carrossel de radar ───

interface MapLayersZoneProps {
  t: MapTranslation;
  locale: string;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  isMobile: boolean;
  // Tiles do basemap
  tileState: BasemapLoadState;
  retryBasemap: () => void;
  refreshLabel: string;
  basemapMode: BasemapMode;
  onBasemapChange: (mode: BasemapMode) => void;
  // Botões de camada do hero (embed da homepage)
  radarLabel: string;
  radarEnabled: boolean;
  radarPrefSet: boolean;
  radarResetLabel: string;
  toggleRadar: () => void;
  handleResetRadar: () => void;
  isobathsEnabled: boolean;
  isobathsLabel: string;
  isobathsHint: string;
  toggleIsobaths: () => void;
  // Carrossel de radar
  radarData: IpmaRadarData | null | undefined;
  radarFrameList: Array<{ url: string; frameTime: string | null }>;
  radarFrameIndex: number;
  radarBusyCount: number;
  radarUserPaused: boolean;
  radarLift: number;
  radarAttributionLabel: string;
  radarScrubbing: boolean;
  hoursOn: boolean;
  panelCollapsed: boolean;
  handleRadarFrameChange: (index: number) => void;
  handleRadarUserPausedChange: (paused: boolean) => void;
  handleRadarImmersionOpen: () => void;
}

export function MapLayersZone({
  t,
  locale,
  isFullscreen,
  isHeroEmbed,
  isMobile,
  tileState,
  retryBasemap,
  refreshLabel,
  basemapMode,
  onBasemapChange,
  radarLabel,
  radarEnabled,
  radarPrefSet,
  radarResetLabel,
  toggleRadar,
  handleResetRadar,
  isobathsEnabled,
  isobathsLabel,
  isobathsHint,
  toggleIsobaths,
  radarData,
  radarFrameList,
  radarFrameIndex,
  radarBusyCount,
  radarUserPaused,
  radarLift,
  radarAttributionLabel,
  radarScrubbing,
  hoursOn,
  panelCollapsed,
  handleRadarFrameChange,
  handleRadarUserPausedChange,
  handleRadarImmersionOpen,
}: MapLayersZoneProps) {
  return (
    <>
      {tileState === 'loading' && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1002] flex items-center gap-2 rounded-full border border-divider bg-bg-elevated/90 backdrop-blur-sm px-3 py-1.5 shadow-card pointer-events-none"
        >
          <span
            className="w-3.5 h-3.5 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin"
            aria-hidden
          />
          <span className="text-meta-sm text-fg-muted">{t.map.loading}</span>
        </div>
      )}

      {tileState === 'failed' && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[1002] flex justify-center px-4 pointer-events-none">
          <div
            role="alert"
            className="pointer-events-auto flex flex-col items-center gap-2.5 rounded-card border border-divider bg-bg-elevated shadow-card px-5 py-4 max-w-xs text-center"
          >
            <p className="text-meta-sm font-semibold text-fg">{t.map.mapUnavailable}</p>
            <button
              type="button"
              onClick={retryBasemap}
              className="inline-flex items-center gap-1.5 rounded-input border border-divider bg-surface-1/[0.06] px-3 py-1.5 text-meta-sm font-semibold text-fg hover:bg-surface-1/[0.12] transition-colors duration-150 touch-manipulation"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              {refreshLabel}
            </button>
          </div>
        </div>
      )}

      {!isFullscreen && !isHeroEmbed && (
        <MapLayerToggle current={basemapMode} onChange={onBasemapChange} locale={locale} />
      )}

      {isHeroEmbed && (
        <>
          <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 pointer-events-auto">
            <button type="button" onClick={toggleRadar} aria-label={radarLabel} aria-pressed={radarEnabled} className="inline-flex min-h-[44px] min-w-[44px] justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors">
              <CloudRain className="w-3.5 h-3.5 text-data-waves" aria-hidden />
              <span className="hidden sm:inline">{radarLabel}</span>
            </button>
            {(radarPrefSet || radarEnabled) && (
              <button type="button" onClick={handleResetRadar} aria-label={radarResetLabel} title={radarResetLabel} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center w-8 h-8 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors">
                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              </button>
            )}
          </div>
          <button type="button" onClick={toggleIsobaths} aria-label={isobathsLabel} title={isobathsHint} aria-pressed={isobathsEnabled} className="absolute top-[70px] right-3 z-[1000] inline-flex min-h-[44px] min-w-[44px] justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors pointer-events-auto">
            <Waves className="w-3.5 h-3.5 text-data-waves" aria-hidden />
            <span className="hidden sm:inline">{isobathsLabel}</span>
          </button>
        </>
      )}

      {radarEnabled && radarData && (
        <RadarCarousel
          className={isHeroEmbed ? 'absolute bottom-20 right-3 z-[1000] pointer-events-auto' : isFullscreen ? 'absolute z-[1000]' : 'absolute bottom-8 left-2 sm:left-auto sm:right-2 z-[1000] max-w-[min(100%,320px)] sm:max-w-none'}
          style={isFullscreen
            ? {
                bottom: Math.max(radarLift + 12, 32),
                // O painel desktop ocupa a margem esquerda — o carrossel
                // desvia para a direita do painel (ou do rail recolhido).
                left: isMobile ? 8 : panelCollapsed ? 64 : 364,
              }
            : undefined}
          frames={radarFrameList}
          frameIndex={radarFrameIndex}
          onFrameChange={handleRadarFrameChange}
          mapBusyCount={radarBusyCount}
          userPaused={radarUserPaused || hoursOn}
          onUserPausedChange={handleRadarUserPausedChange}
          labels={{ badge: t.map.radarBadge, hint: t.map.radarHint, scrub: t.map.radarScrub, play: t.map.radarPlay, pause: t.map.radarPause, paused: t.map.radarPaused, ipmaAttribution: radarAttributionLabel, gap: t.map.radarGap, stale: t.map.radarStale }}
          fullscreenHref={isFullscreen ? undefined : `/${locale}/mapa/?radar=1`}
          fullscreenLabel={t.map.radarFullscreen}
          onFullscreenOpen={handleRadarImmersionOpen}
          hideScrubber={isFullscreen}
          externalScrubbing={radarScrubbing}
        />
      )}
    </>
  );
}
