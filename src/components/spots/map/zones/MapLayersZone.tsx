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
  Navigation, Sailboat, SatelliteDish, CloudLightning,
  Thermometer, AlertTriangle, Waves,
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
import { useMapSwellField, useSwellToggle } from '../hooks/useMapSwellField';
import { useSeaGrid, useSeaGridFrame } from '../hooks/useSeaGrid';
import { setMapLayerUrlParam } from '@/lib/mapShareUrl';
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
  initialNauticalChartEnabled: boolean;
  initialHoursEnabled: boolean;
  initialHourOfDay: number | null;
  initialBuoysEnabled: boolean;
  initialGoesIrEnabled: boolean;
  initialStormsEnabled: boolean;
  initialWarnAreasEnabled: boolean;
  initialCoastalWarningsEnabled: boolean;
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
  initialNauticalChartEnabled,
  initialHoursEnabled,
  initialHourOfDay,
  initialBuoysEnabled,
  initialGoesIrEnabled,
  initialStormsEnabled,
  initialWarnAreasEnabled,
  initialCoastalWarningsEnabled,
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
    initialNauticalChartEnabled,
    initialGoesIrEnabled,
    initialCoastalWarningsEnabled,
    initialStormsEnabled,
    initialWarnAreasEnabled,
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
  swellLabel: string;
  swellHint: string;
  nauticalChartLabel: string;
  nauticalChartHint: string;
  satIrLabel: string;
  satIrHint: string;
  stormsLabel: string;
  stormsHint: string;
  warnAreasLabel: string;
  warnAreasHint: string;
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
  /** Deep link `?swell=1` — camada «Ondulação». */
  initialSwellEnabled?: boolean;
  /** Spots com símbolo de ondulação (os visíveis no mapa, já filtrados). */
  swellSpots?: FieldSpot[];
  locale?: string;
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
  initialSwellEnabled = false,
  swellSpots,
  locale = 'pt',
  base,
  hsSpots,
  windEnabled,
  t,
}: UseMapLayersFieldsParams) {
  const {
    radarEnabled, radarLabel, radarHint, radarUnavailable, toggleRadar,
    hoursFile, hoursLive, hoursFrame, hoursOn, hoursUnavailable, toggleHours,
    buoysEnabled, toggleBuoys,
    nauticalChartEnabled, isobathsData, toggleNauticalChart,
    goesIrEnabled, toggleGoesIr,
    stormsEnabled, stormsUnavailable, toggleStorms,
    warnAreasEnabled, warnAreasUnavailable, toggleWarnAreas,
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
  // Grelha de modelo (sea-grid.json) partilhada pelo vento e pela
  // «Ondulação» — só pedida quando uma das duas está ligada no fullscreen.
  const { swellWanted, toggleSwell: toggleSwellRaw, disableSwell } = useSwellToggle({
    initialEnabled: initialSwellEnabled,
  });
  const fieldsSurface = isFullscreen && !isHeroEmbed;
  const seaGrid = useSeaGrid(fieldsSurface && (windEnabled || swellWanted));
  const seaFrame = useSeaGridFrame(seaGrid, hoursFile, hoursLive, hoursFrame);

  const { windFieldOn, windRange } = useMapWindField({
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
    seaGrid,
    seaFrame,
  });

  const { swellOn, swellUnavailable, swellRange } = useMapSwellField({
    mapInstanceRef,
    LRef,
    isReady,
    isFullscreen,
    isHeroEmbed,
    isMobile,
    enabled: swellWanted,
    seaGrid,
    seaFrame,
    spots: swellSpots ?? hsSpots,
    locale,
    windOn: windFieldOn,
    labels: t.mapUiLayers,
  });
  // Botão do menu: «ligada» = o utilizador pediu a camada (mesmo enquanto a
  // grelha carrega); o desenho segue `swellOn`.
  const swellEnabled = fieldsSurface && swellWanted;

  useEffect(() => {
    if (sstEnabled && hsEnabled) disableHs();
  }, [sstEnabled, hsEnabled, disableHs]);

  // «Ondulação», Hs (IDW) e SST pintam o mar inteiro — uma de cada vez.
  useEffect(() => {
    if (!swellEnabled) return;
    if (hsEnabled) disableHs();
    if (sstEnabled) disableSst();
  }, [swellEnabled, hsEnabled, sstEnabled, disableHs, disableSst]);

  const toggleHs = useCallback(() => {
    if (!hsEnabled && sstEnabled) disableSst();
    if (!hsEnabled && swellWanted) disableSwell();
    toggleHsRaw();
  }, [hsEnabled, sstEnabled, swellWanted, toggleHsRaw, disableSst, disableSwell]);

  const toggleSst = useCallback(() => {
    if (!sstEnabled && hsEnabled) disableHs();
    if (!sstEnabled && swellWanted) disableSwell();
    toggleSstRaw();
  }, [sstEnabled, hsEnabled, swellWanted, toggleSstRaw, disableHs, disableSwell]);

  const toggleSwell = useCallback(() => {
    toggleSwellRaw();
  }, [toggleSwellRaw]);

  // URL acompanha a camada (merge — os outros params ficam): um reload ou
  // um link copiado da barra mantém a «Ondulação». Só no /mapa.
  useEffect(() => {
    if (!fieldsSurface) return;
    setMapLayerUrlParam('swell', swellWanted);
  }, [fieldsSurface, swellWanted]);

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
    swellLabel: t.mapUiLayers.layerSwell,
    swellHint: t.mapUiLayers.swellHint,
    nauticalChartLabel: t.mapUiLayers.layerNauticalChart,
    nauticalChartHint: t.map.nauticalChartHint,
    satIrLabel: t.mapUiLayers.layerSatelliteIr,
    satIrHint: t.map.satIrHint,
    stormsLabel: t.mapUiLayers.layerStorms,
    stormsHint: t.map.stormsHint,
    warnAreasLabel: t.mapUiLayers.layerWarnAreas,
    warnAreasHint: t.map.warnAreasHint,
    coastalWarningsLabel,
    coastalWarningsHint: t.map.coastalWarningsHint,
    layersMenuLabel: t.map.layersMenu,
  }), [
    radarLabel, radarHint,
    hoursOn, buoysEnabled, hsEnabled, sstEnabled, currentsEnabled,
    coastalWarningsLabel,
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
      key: 'goesIr',
      group: 'time',
      label: lyr.layerSatelliteIr,
      hint: layerCopy.satIrHint,
      icon: <SatelliteDish className="w-4 h-4" aria-hidden />,
      pressed: goesIrEnabled,
      onToggle: toggleGoesIr,
      toggleAttr: 'data-map-goes-ir-toggle',
      iconClass: 'text-data-period',
    },
    // Camadas sazonais/de evento: sem tempestades activas na região (ou
    // ficheiro stale) e sem áreas sob aviso, o toggle que não pinta nada
    // ESCONDE-SE em vez de ocupar a lista desactivado — volta a aparecer
    // sozinho quando houver dados (Fase 3 — consolidação do menu).
    ...(stormsUnavailable ? [] : [{
      key: 'storms',
      group: 'time',
      label: lyr.layerStorms,
      hint: layerCopy.stormsHint,
      icon: <CloudLightning className="w-4 h-4" aria-hidden />,
      pressed: stormsEnabled,
      onToggle: toggleStorms,
      toggleAttr: 'data-map-storms-toggle',
      iconClass: 'text-score-poor',
    } satisfies MapLayersMenuItem]),
    ...(warnAreasUnavailable ? [] : [{
      key: 'warnAreas',
      group: 'time',
      label: lyr.layerWarnAreas,
      hint: layerCopy.warnAreasHint,
      icon: <AlertTriangle className="w-4 h-4" aria-hidden />,
      pressed: warnAreasEnabled,
      onToggle: toggleWarnAreas,
      toggleAttr: 'data-map-warn-areas-toggle',
      iconClass: 'text-score-poor',
    } satisfies MapLayersMenuItem]),
    {
      key: 'swell',
      group: 'sea',
      label: lyr.layerSwell,
      hint: swellEnabled && swellUnavailable ? `${layerCopy.swellHint} — ${lyr.unavailable}` : layerCopy.swellHint,
      icon: <Waves className="w-4 h-4" aria-hidden />,
      pressed: swellEnabled,
      onToggle: toggleSwell,
      toggleAttr: 'data-map-swell-toggle',
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
      key: 'nauticalChart',
      group: 'nav',
      label: lyr.layerNauticalChart,
      hint: layerCopy.nauticalChartHint,
      icon: <Sailboat className="w-4 h-4" aria-hidden />,
      pressed: nauticalChartEnabled,
      onToggle: toggleNauticalChart,
      toggleAttr: 'data-map-nautical-chart-toggle',
      iconClass: 'text-data-water',
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
    goesIrEnabled, toggleGoesIr,
    swellEnabled, swellUnavailable, toggleSwell,
    hsUnavailable, hsEnabled, toggleHs,
    sstUnavailable, sstEnabled, toggleSst,
    currentsUnavailable, currentsEnabled, toggleCurrents,
    buoysEnabled, toggleBuoys,
    nauticalChartEnabled, toggleNauticalChart,
    stormsEnabled, stormsUnavailable, toggleStorms,
    warnAreasEnabled, warnAreasUnavailable, toggleWarnAreas,
    coastalWarningsEnabled, toggleCoastalWarnings,
  ]);

  // Legenda — props partilhadas entre a flutuante (desktop) e a embutida
  // no <details> do sheet (mobile). Uma só legenda por superfície.
  const legendLayerProps = {
    radarTitle: t.map.radarLegend,
    radarVisible: radarEnabled,
    isobathsTitle: t.map.isobathsLegend,
    isobathsVisible: nauticalChartEnabled && isobathsData != null,
    hsTitle: t.map.hsLegend,
    hsVisible: hsEnabled,
    sstTitle: t.map.sstLegend,
    sstVisible: sstEnabled,
    currentsTitle: t.map.currentsLegend,
    currentsVisible: currentsEnabled,
    windTitle: t.map.windLegend,
    windVisible: isFullscreen && !isHeroEmbed && windEnabled,
    windRange: windFieldOn ? windRange : null,
    swellVisible: swellOn,
    swellRange,
    seaLegendCopy: t.mapUiLayers,
    bathymetryTitle: t.map.bathymetryLegend,
    // Em hero embeds a «Carta náutica» resume-se às isóbatas — batimetria e
    // seamarks não pintam lá, logo a legenda também não as mostra.
    bathymetryVisible: nauticalChartEnabled && !isHeroEmbed,
    bathymetryContoursLabel: t.map.bathymetryContours,
    seamarksTitle: t.map.seamarksLegend,
    seamarksVisible: nauticalChartEnabled && !isHeroEmbed,
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
    swellEnabled, swellUnavailable, toggleSwell,
    layerCopy, sheetLayers, legendLayerProps,
  };
}

export type MapLayersFields = ReturnType<typeof useMapLayersFields>;

// A vista (indicadores de tiles, basemap flutuante, botões do hero,
// carrossel de radar) vive em MapLayersZoneView.tsx — chunk dinâmico (M7-F).
