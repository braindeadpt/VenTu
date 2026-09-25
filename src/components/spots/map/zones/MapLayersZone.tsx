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
  Mountain, Navigation, Sailboat,
  Thermometer, Waves,
} from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import {
  OPEN_METEO_ATTRIBUTION,
} from '@/lib/map-constants';
import { openMeteoAttributionHtml } from '@/lib/openMeteoAttribution';
import type { MapLayersMenuItem } from '../components/MapLayersMenu';
import { useMapLayers } from '../hooks/useMapLayers';
import { useMapHours } from '../hooks/useMapHours';
import { useMapBuoyDots } from '../hooks/useMapBuoyDots';
import { useMapAttribution } from '../hooks/useMapAttribution';
import { useMapHsField } from '../hooks/useMapHsField';
import { useMapSstField } from '../hooks/useMapSstField';
import { useMapCurrentsField } from '../hooks/useMapCurrentsField';
import { useMapWindField } from '../hooks/useMapWindField';
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
  // §8 (maquete): o label é o NOME da camada (substantivo — o estado mostra
  // o switch/aria-pressed), a ordem segue os grupos Tempo→Mar→Navegação e
  // cada item declara o `group` para as superfícies agrupadas.
  const lyr = t.mapUiLayers;
  const sheetLayers: MapLayersMenuItem[] = useMemo(() => [
    {
      key: 'hours',
      group: 'time',
      label: lyr.layerHours,
      hint: hoursUnavailable ? `${layerCopy.hoursHint} — ${lyr.unavailable}` : layerCopy.hoursHint,
      icon: <Clock className="w-4 h-4" aria-hidden />,
      pressed: hoursOn,
      disabled: hoursUnavailable,
      onToggle: toggleHours,
      toggleAttr: 'data-map-hours-toggle',
      iconClass: 'text-score-good',
    },
    {
      key: 'radar',
      group: 'time',
      label: lyr.layerRadar,
      hint: radarUnavailable ? `${layerCopy.radarHint} — ${lyr.unavailable}` : layerCopy.radarHint,
      icon: <CloudRain className="w-4 h-4" aria-hidden />,
      pressed: radarEnabled,
      disabled: radarUnavailable,
      onToggle: toggleRadar,
      toggleAttr: 'data-map-radar-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'isobaths',
      group: 'sea',
      label: lyr.layerIsobaths,
      hint: layerCopy.isobathsHint,
      icon: <Waves className="w-4 h-4" aria-hidden />,
      pressed: isobathsEnabled,
      onToggle: toggleIsobaths,
      toggleAttr: 'data-map-isobaths-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'hs',
      group: 'sea',
      label: lyr.layerHs,
      hint: hsUnavailable ? `${layerCopy.hsHint} — ${lyr.unavailable}` : layerCopy.hsHint,
      icon: <Activity className="w-4 h-4" aria-hidden />,
      pressed: hsEnabled,
      disabled: hsUnavailable,
      onToggle: toggleHs,
      toggleAttr: 'data-map-hs-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'sst',
      group: 'sea',
      label: lyr.layerSst,
      hint: sstUnavailable ? `${layerCopy.sstHint} — ${lyr.unavailable}` : layerCopy.sstHint,
      icon: <Thermometer className="w-4 h-4" aria-hidden />,
      pressed: sstEnabled,
      disabled: sstUnavailable,
      onToggle: toggleSst,
      toggleAttr: 'data-map-sst-toggle',
      iconClass: 'text-data-period',
    },
    {
      key: 'currents',
      group: 'sea',
      label: lyr.layerCurrents,
      hint: currentsUnavailable ? `${layerCopy.currentsHint} — ${lyr.unavailable}` : layerCopy.currentsHint,
      icon: <Navigation className="w-4 h-4" aria-hidden />,
      pressed: currentsEnabled,
      disabled: currentsUnavailable,
      onToggle: toggleCurrents,
      toggleAttr: 'data-map-currents-toggle',
      iconClass: 'text-data-water',
    },
    {
      key: 'bathymetry',
      group: 'sea',
      label: lyr.layerBathymetry,
      hint: layerCopy.bathymetryHint,
      icon: <Mountain className="w-4 h-4" aria-hidden />,
      pressed: bathymetryEnabled,
      onToggle: toggleBathymetry,
      toggleAttr: 'data-map-bathymetry-toggle',
      iconClass: 'text-data-water',
    },
    {
      key: 'buoys',
      group: 'nav',
      label: lyr.layerBuoys,
      hint: layerCopy.buoysHint,
      icon: <LifeBuoy className="w-4 h-4" aria-hidden />,
      pressed: buoysEnabled,
      onToggle: toggleBuoys,
      toggleAttr: 'data-map-buoys-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'seamarks',
      group: 'nav',
      label: lyr.layerSeamarks,
      hint: layerCopy.seamarksHint,
      icon: <Sailboat className="w-4 h-4" aria-hidden />,
      pressed: seamarksEnabled,
      onToggle: toggleSeamarks,
      toggleAttr: 'data-map-seamarks-toggle',
      iconClass: 'text-score-good',
    },
    {
      key: 'coastalWarnings',
      group: 'nav',
      label: lyr.layerWarnings,
      hint: layerCopy.coastalWarningsHint,
      icon: <Anchor className="w-4 h-4" aria-hidden />,
      pressed: coastalWarningsEnabled,
      onToggle: toggleCoastalWarnings,
      toggleAttr: 'data-map-coastal-warnings-toggle',
      iconClass: 'text-score-poor',
    },
  ], [
    layerCopy, lyr,
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

// A vista (indicadores de tiles, basemap flutuante, botões do hero,
// carrossel de radar) vive em MapLayersZoneView.tsx — chunk dinâmico (M7-F).
