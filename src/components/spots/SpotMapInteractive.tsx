'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Anchor, CloudRain, Layers, HelpCircle, MapPin, Maximize2, Waves, Wind, Zap } from 'lucide-react';
import type L from 'leaflet';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { clearLeafletContainer, unlockPageInteraction } from '@/lib/mapFullscreen';
import type { GridSportFilter } from '@/lib/sportRatings';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel } from '@/lib/wind';
import MapExploreHud, { type MapExploreHudProps } from './MapExploreHud';
import BuoyLayerNotice from './BuoyLayerNotice';
import MapSpotSheet, { type MapSpotSheetData } from './MapSpotSheet';
import MapLegend from './MapLegend';
import MapLayerToggle from './MapLayerToggle';
import WindRingLegend from './WindRingLegend';
import type { BasemapMode } from './MapLayerToggle';
import { createClusterIconFunction } from './MapClusterIcon';
import {
  TILE_URLS,
  TILE_ATTRIBUTIONS,
  OPEN_METEO_ATTRIBUTION,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  CLUSTER_CONFIG,
  MAP_CLUSTER_LS_KEY,
  MAP_WIND_LS_KEY,
  MAP_ONLY_ON_LS_KEY,
  MAP_ISOBATHS_LS_KEY,
  MAP_COASTAL_LS_KEY,
} from '@/lib/map-constants';
import { getWindRelationLabel, getWindRelationToCoast } from '@/lib/wind';
import { hasSeenWindRingLegend } from '@/lib/windRingLegend';
import { getSpotImage } from '@/lib/spotImage';
import { getSpotDetailHref } from '@/lib/mapSpotDetail';
import {
  IPMA_RADAR_ATTRIBUTION_LABEL_PT,
  IPMA_RADAR_ATTRIBUTION_LABEL_EN,
} from '@/lib/ipmaAttribution';
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import { strongestSpotWarning, warningBadgeLabel } from '@/lib/ipmaWarnings';
import {
  fetchRadarData,
  radarBoundsCorners,
  radarFrames,
  type IpmaRadarData,
} from '@/lib/ipmaRadar';
import { SEA_STATE_WARNING_TYPES } from '@/lib/ipmaWarnings';
import type { MapMarkerWarning } from '@/lib/mapWindArrow';
import RadarCarousel from './RadarCarousel';
import {
  loadIsobathContours,
  ISOBATH_DEPTHS,
  ISOBATH_DEPTH_STYLE,
  type IsobathContoursFile,
} from '@/lib/isobaths';
import {
  loadCoastalNavWarnings,
  warningsForSpot,
  type CoastalWarningsFile,
} from '@/lib/ihCoastalWarnings';
import { spotMeetsOnFilter } from '@/lib/gridSpotFilters';
import type { MapSpotData } from './mapSpotData';
import { getBestScore } from './mapSpotData';
import { includeSpotInViewportBounds } from './mapViewportBounds';
import {
  readClusterPref,
  readWindPref,
  readOnlyOnPref,
  readIsobathsPref,
  readCoastalWarningsPref,
} from './mapHudPrefs';
import {
  readRadarEnabledPref,
  readRadarPref,
  writeRadarEnabledPref,
  writeRadarPref,
} from '@/lib/radarPrefs';
import {
  buildMarkerCacheKey,
  createSpotMarker,
  runChunked,
  MARKER_ADD_CHUNK_SIZE,
  MARKER_ADD_CHUNK_SIZE_MOBILE,
  MARKER_CHUNK_YIELD_MS_MOBILE,
} from './mapMarkers';

type SpotData = MapSpotData;

type MapHudProps = Omit<
  MapExploreHudProps,
  | 'isPt'
  | 'visible'
  | 'basemapMode'
  | 'onBasemapChange'
  | 'clusterEnabled'
  | 'onToggleCluster'
  | 'radarEnabled'
  | 'onToggleRadar'
  | 'radarLabel'
  | 'radarHint'
  | 'isobathsEnabled'
  | 'onToggleIsobaths'
  | 'isobathsLabel'
  | 'isobathsHint'
  | 'coastalWarningsEnabled'
  | 'onToggleCoastalWarnings'
  | 'coastalWarningsLabel'
  | 'coastalWarningsHint'
  | 'windEnabled'
  | 'showWindOnMarkers'
  | 'onToggleWind'
  | 'onlyOnEnabled'
  | 'onToggleOnlyOn'
  | 'onlyOnLabel'
  | 'onlyOnHint'
  | 'onExitFullscreen'
  | 'windHint'
  | 'exploreModeLabel'
  | 'layerMapLabel'
  | 'layerSatelliteLabel'
  | 'clusterLabel'
  | 'windLabel'
  | 'exitLabel'
  | 'windLegendHelpLabel'
  | 'onOpenWindLegend'
  | 'windButtonRef'
  | 'collapseHudLabel'
  | 'expandHudLabel'
  | 'onCollapsedChange'
>;

interface SpotMapInteractiveProps {
  spotsData: SpotData[];
  selectedSport: GridSportFilter;
  selectedRegion: string;
  locale: string;
  onSpotSelect?: (spotId: string) => void;
  mapHud?: MapHudProps;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  /** Home hero: fill parent, hide corner controls (overlay has filters). */
  embedMode?: 'default' | 'hero';
  /** Start in explore/fullscreen mode (e.g. /mapa page). */
  initialFullscreen?: boolean;
  /** Start with the IPMA radar overlay ON (e.g. /mapa?radar=1 deep link). */
  initialRadarEnabled?: boolean;
  /** Start with isobaths ON (e.g. /mapa?isobaths=1 deep link). */
  initialIsobathsEnabled?: boolean;
  /**
   * Deep link from a spot (?spot=<slug>, ex. «Ver no mapa» do bloco de avisos):
   * quando o spot tiver um aviso à navegação activo, liga a camada costeira e
   * centra o mapa na área coberta (a decisão usa os dados — spot sem aviso fica
   * apenas com o comportamento por omissão).
   */
  focusSpotId?: string;
  /** Fullscreen map below fixed header (top offset 4rem). */
  fullscreenBelowHeader?: boolean;
  /** Override exit fullscreen (e.g. navigate home). */
  onExitFullscreen?: () => void;
}

// ─── Component ───
export default function SpotMapInteractive({
  spotsData,
  selectedSport,
  selectedRegion,
  locale,
  onSpotSelect,
  mapHud,
  onFullscreenChange,
  embedMode = 'default',
  initialFullscreen = false,
  initialRadarEnabled = false,
  initialIsobathsEnabled = false,
  focusSpotId,
  fullscreenBelowHeader = false,
  onExitFullscreen: onExitFullscreenOverride,
}: SpotMapInteractiveProps) {
  const isHeroEmbed = embedMode === 'hero';
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const radarOverlayRef = useRef<L.ImageOverlay | null>(null);
  const isobathsLayerRef = useRef<L.LayerGroup | null>(null);
  const coastalLayerRef = useRef<L.LayerGroup | null>(null);
  const markersCacheRef = useRef<Map<string, L.Marker>>(new Map());
  const markerChunkCancelRef = useRef(false);
  const didFitBoundsRef = useRef(false);
  const filterBoundsKeyRef = useRef('');
  const onSpotSelectRef = useRef(onSpotSelect);
  const LRef = useRef<typeof L | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onSpotSelectRef.current = onSpotSelect;
  }, [onSpotSelect]);
  const [isReady, setIsReady] = useState(false);
  /** Delay marker build so the map is pan/zoomable first (esp. mobile). */
  const [allowMarkers, setAllowMarkers] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('map');
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [clusterEnabled, setClusterEnabled] = useState(readClusterPref);
  const [windEnabled, setWindEnabled] = useState(readWindPref);
  const [onlyOnEnabled, setOnlyOnEnabled] = useState(readOnlyOnPref);
  /** undefined = ainda não carregado · null = indisponível · data = pronto. */
  const [radarData, setRadarData] = useState<IpmaRadarData | null | undefined>(undefined);
  // Deep link ?radar=1 (ex: botão de imersão do carrossel) liga o radar à
  // entrada, sem tocar na preferência persistida (que só se grava ao desligar).
  // Sem deep link, restaura a preferência de ligar/desligar entre visitas
  // (como o vento e o cluster) — ligado/desligado, mas nunca opta por ligar
  // o radar numa nova área se o utilizador nunca o usou aqui.
  const [radarEnabled, setRadarEnabled] = useState<boolean>(() => {
    if (initialRadarEnabled) return true;
    return readRadarEnabledPref() === true;
  });
  // A navegação client-side (Link do carrossel → /mapa?radar=1) pode entregar
  // a prop DEPOIS do primeiro render (o MapaFullscreenClient lê o URL num
  // useEffect). Sincronizar: liga quando a prop inicial pede; nunca desliga
  // por mudança de prop — o toggle manual é dono do estado a partir daqui.
  useEffect(() => {
    if (initialRadarEnabled) setRadarEnabled(true);
  }, [initialRadarEnabled]);
  /** Camada vectorial das isóbatas 8/16/30 m (IH) — off por omissão, lazy.
   *  undefined = ainda não carregado · null = indisponível · data = pronto. */
  // No hero da homepage (embedMode='hero') as isóbatas entram LIGADAS por
  // omissão — mostram a batimetria real da costa no TopMap à primeira vista,
  // reutilizando exactamente a camada partilhada (o toggle permite desligar).
  // Precedência do estado inicial: deep link ?isobaths=1 > preferência persistida
  // (como o vento/cluster) > default do mapa (hero LIGADO, os outros DESLIGADO).
  // O grid de cards (embedMode default, nem hero nem fullscreen) fica sempre
  // DESLIGADO — omitir a geometria pesada em dezenas de mini-mapas.
  const [isobathsEnabled, setIsIsobathsEnabled] = useState<boolean>(() => {
    if (!isHeroEmbed && !initialFullscreen) return false;
    if (initialIsobathsEnabled) return true;
    const saved = readIsobathsPref();
    if (saved !== undefined) return saved;
    return isHeroEmbed;
  });
  // Deep link ?isobaths=1 (imersão no /mapa) pode entregar a prop DEPOIS do
  // primeiro render (o MapaFullscreenClient lê o URL num useEffect) — liga então;
  // nunca desliga por mudança de prop, o toggle manual é dono a partir daqui.
  useEffect(() => {
    if (initialIsobathsEnabled) setIsIsobathsEnabled(true);
  }, [initialIsobathsEnabled]);
  const [isobathsData, setIsIsobathsData] = useState<IsobathContoursFile | null | undefined>(undefined);
  /** Avisos à navegação costeiros (IH) — camada vectorial com os polígonos de
   *  TODOS os avisos activos (não só os do spot), off por omissão e lazy.
   *  A falha de rede degrada para «sem camada» (nunca quebra o mapa). */
  const [coastalWarningsEnabled, setCoastalWarningsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return readCoastalWarningsPref() === true;
  });
  const [coastalWarningsData, setCoastalWarningsData] = useState<CoastalWarningsFile | null | undefined>(undefined);
  /** Deep link ?spot= — guarda o auto-focus para correr só uma vez (o toggle
   *  manual é dono do enquadramento a partir daí). */
  const coastalFocusDoneRef = useRef(false);
  /** Frame actual do carrossel (índice em radarFrames). */
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  /** Pausa manual (botão play/pause) — restaurada de localStorage (preferência). */
  const [radarUserPaused, setRadarUserPaused] = useState<boolean>(() => readRadarPref().paused);
  const radarUserPausedRef = useRef(radarUserPaused);
  /** Fontes de movimento do mapa ainda activas (ex: 'drag', 'zoom') — o
   *  carrossel pausa enquanto estiver vazio. Um Set (não um boolean) acumula
   *  interacções sobrepostas: drag+zoom simultâneos só retomam quando a ÚLTIMA
   *  termina, em vez de retomar cedo de mais quando uma fica idle. */
  const [radarBusySources, setRadarBusySources] = useState<Set<string>>(new Set());
  /** Altura do HUD inferior em fullscreen (px) — o carrossel ergue-se por cima dele. */
  const [radarLift, setRadarLift] = useState(0);
  /** Espelho do índice para o intervalo do carrossel (evita stale closure). */
  const radarFrameIndexRef = useRef(0);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const [sheetSpot, setSheetSpot] = useState<MapSpotSheetData | null>(null);
  const [hudCollapsed, setHudCollapsed] = useState(true);
  const isPt = locale === 'pt';
  const t = getTranslation(validateLocale(locale));

  // Sea-state/wind warnings (Agitação Marítima, Vento) → badge on the marker.
  const warningsData = useIpmaWarnings();

  useEffect(() => {
    if (!isFullscreen) setHudCollapsed(true);
  }, [isFullscreen]);

  // Mobile viewport — bottom sheet instead of Leaflet popup
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Restore persisted map preferences
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('ventu.map.basemap');
      if (saved === 'map' || saved === 'satellite') {
        setBasemapMode(saved);
      }
    } catch { /* noop */ }
  }, []);

  // Detect theme
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkTheme = () => {
      const hasCoast = document.documentElement.classList.contains('theme-ocean');
      setIsDark(!hasCoast);
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Initialize map and cluster group
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;
    if (mapInstanceRef.current) return;

    let cancelled = false;
    const container = mapRef.current;

    const teardownMap = () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          /* noop */
        }
        mapInstanceRef.current = null;
      }
      markersCacheRef.current.forEach((marker) => {
        try {
          marker.remove();
        } catch {
          /* noop */
        }
      });
      markersCacheRef.current.clear();
      radarOverlayRef.current = null;
      isobathsLayerRef.current = null;
      clusterGroupRef.current = null;
      markersGroupRef.current = null;
      tileLayerRef.current = null;
      LRef.current = null;
      didFitBoundsRef.current = false;
      filterBoundsKeyRef.current = '';
      clearLeafletContainer(container);
      if (mountedRef.current) setIsReady(false);
    };

    (async () => {
      const mobileInit =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

      await Promise.all([
        import('leaflet/dist/leaflet.css'),
        import('leaflet.markercluster/dist/MarkerCluster.css'),
        import('leaflet.markercluster/dist/MarkerCluster.Default.css'),
      ]);
      const Leaflet = (await import('leaflet')).default;
      await import('leaflet.markercluster');
      if (cancelled || !mapRef.current) return;

      clearLeafletContainer(container);
      LRef.current = Leaflet;

      const map = Leaflet.map(container, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        attributionControl: false,
        // Canvas renderer on mobile — fewer DOM nodes while panning
        ...(mobileInit ? { renderer: Leaflet.canvas() } : {}),
        ...(isHeroEmbed
          ? {
              scrollWheelZoom: false,
              dragging: false,
              touchZoom: false,
              doubleClickZoom: false,
              boxZoom: false,
              keyboard: false,
            }
          : {}),
      });

      if (cancelled) {
        map.remove();
        clearLeafletContainer(container);
        return;
      }

      const darkOnInit = !document.documentElement.classList.contains('theme-ocean');
      const tileUrl = darkOnInit ? TILE_URLS.dark : TILE_URLS.light;
      tileLayerRef.current = Leaflet.tileLayer(tileUrl, {
        attribution: TILE_ATTRIBUTIONS.carto,
        subdomains: 'abcd',
        maxZoom: MAX_ZOOM,
      }).addTo(map);

      if (!isHeroEmbed) {
        Leaflet.control.zoom({ position: 'bottomright' }).addTo(map);
      }
      // Atribuição obrigatória do Open-Meteo (CC BY 4.0) + o crédito do basemap.
      // Presente em TODAS as superfícies, incluindo o hero da homepage. Prefixed
      // false: sem o prefixo «Leaflet». O crédito do basemap é regravado no
      // controlo a cada mudança (ver o efeito de troca de basemap). O TileLayer
      // inicial regista o Carto via onAdd (many surface) — corrigido depois.
      Leaflet.control
        .attribution({ position: 'bottomleft', prefix: false })
        .addAttribution(OPEN_METEO_ATTRIBUTION)
        .addTo(map);

      const mcg = Leaflet.markerClusterGroup({
        ...CLUSTER_CONFIG,
        ...(mobileInit
          ? { chunkInterval: 200, chunkDelay: 80, maxClusterRadius: 72 }
          : {}),
        iconCreateFunction: createClusterIconFunction(Leaflet, { simple: mobileInit }),
      });
      const lg = Leaflet.layerGroup();
      clusterGroupRef.current = mcg;
      markersGroupRef.current = lg;
      map.addLayer(mcg);

      if (cancelled) {
        map.remove();
        clearLeafletContainer(container);
        return;
      }

      mapInstanceRef.current = map;
      if (mountedRef.current) setIsReady(true);
      // Test hook: expõe o mapa só quando a página declara que quer (é2é de
      // sobreposição de movimentos — dispara eventos Leaflet de forma
      // determinística para provar que o carrossel só retoma no fim do último).
      if (typeof window !== 'undefined' && (window as any).__RADAR_TEST__) {
        (window as any).__RADAR_MAP__ = map;
      }
    })();

    return () => {
      cancelled = true;
      teardownMap();
    };
  }, [isHeroEmbed]);

  // Basemap + theme on Leaflet container (wind ring halo on satellite)
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const el = mapInstanceRef.current.getContainer();
    el.dataset.basemap = basemapMode;
    el.dataset.mapTheme = isDark ? 'dark' : 'light';
  }, [basemapMode, isDark, isReady]);

  // Switch basemap tiles
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url: string;
    let attribution: string;

    if (basemapMode === 'satellite') {
      url = TILE_URLS.satellite;
      attribution = TILE_ATTRIBUTIONS.esri;
    } else {
      url = isDark ? TILE_URLS.dark : TILE_URLS.light;
      attribution = TILE_ATTRIBUTIONS.carto;
    }

    // O crédito do basemap troca no controlo (Esri/OSM no satélite · Carto/OSM
    // no mapa). O AttributionControl do Leaflet mantém um CONTADOR de
    // referências por texto (add/removeAtribution incrementa/decrementa), e o
    // tile inicial regista o Carto no onAdd — um único removeAttribution não o
    // levaria a 0. Por isso REGRAVA-SE exactamente o conjunto pretendido
    // (Open-Meteo + basemap + créditos IH activos) em _attributions e chama-se
    // _update() — determinístico, sem contadores vazados, em todas as
    // superfícies incluindo o hero embebido com basemap satellite persistido.
    const ac = map.attributionControl as any;
    if (ac) {
      const attribs: Record<string, number> = {};
      const bump = (t: string) => {
        attribs[t] = (attribs[t] ?? 0) + 1;
      };
      bump(OPEN_METEO_ATTRIBUTION);
      bump(attribution);
      if (isobathsEnabled && isobathsData != null) {
        bump(
          isPt ? 'Isóbatas © Instituto Hidrográfico (CC BY 4.0)' : 'Isobaths © Instituto Hidrográfico (CC BY 4.0)',
        );
      }
      if (coastalWarningsEnabled && coastalWarningsData != null) {
        bump(
          isPt
            ? 'Avisos à Navegação Costeiros © Instituto Hidrográfico (CC BY 4.0)'
            : 'Coastal Navigation Warnings © Instituto Hidrográfico (CC BY 4.0)',
        );
      }
      ac._attributions = attribs;
      ac._update();
    }

    tileLayerRef.current = Leaflet.tileLayer(url, {
      attribution,
      subdomains: 'abcd',
      maxZoom: MAX_ZOOM,
    }).addTo(map);
    // Este efeito NÃO deve re-correr quando os toggles IH mudam (só lê o estado
    // actual para a fotografia do controlo; os efeitos IH gerem os seus créditos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemapMode, isDark, isReady]);

  // Handle basemap toggle
  const handleBasemapChange = useCallback((mode: BasemapMode) => {
    setBasemapMode(mode);
    try {
      localStorage.setItem('ventu.map.basemap', mode);
    } catch { /* noop */ }
  }, []);

  const fullscreenBtnRef = useRef<HTMLButtonElement>(null);
  const windButtonRef = useRef<HTMLButtonElement>(null);
  const windLegendAutoQueuedRef = useRef(false);
  const [windLegendOpen, setWindLegendOpen] = useState(false);
  const prevFocusRef = useRef<Element | null>(null);

  const enterFullscreen = useCallback(() => {
    prevFocusRef.current = document.activeElement;
    setIsFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    setSheetSpot(null);
    if (onExitFullscreenOverride) {
      onExitFullscreenOverride();
    } else {
      setIsFullscreen(false);
    }
    unlockPageInteraction();
  }, [onExitFullscreenOverride]);

  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  // Focus: enter fullscreen → exit control; exit → restore trigger
  useEffect(() => {
    if (isFullscreen) {
      requestAnimationFrame(() => {
        const exitBtn = document.querySelector<HTMLElement>('[data-map-exit-fullscreen]');
        exitBtn?.focus();
      });
    } else if (prevFocusRef.current instanceof HTMLElement) {
      prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [isFullscreen]);

  const toggleCluster = useCallback(() => {
    setClusterEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_CLUSTER_LS_KEY, next ? '1' : '0');
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const toggleWind = useCallback(() => {
    setWindEnabled((prev) => {
      const next = !prev;
      if (next) {
        setClusterEnabled(false);
        try {
          localStorage.setItem(MAP_CLUSTER_LS_KEY, '0');
        } catch { /* noop */ }
      }
      try {
        localStorage.setItem(MAP_WIND_LS_KEY, next ? '1' : '0');
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const toggleOnlyOn = useCallback(() => {
    setOnlyOnEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_ONLY_ON_LS_KEY, next ? '1' : '0');
      } catch { /* noop */ }
      return next;
    });
  }, []);

  const toggleIsobaths = useCallback(() => {
    setIsIsobathsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_ISOBATHS_LS_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const toggleCoastalWarnings = useCallback(() => {
    setCoastalWarningsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MAP_COASTAL_LS_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const toggleRadar = useCallback(() => {
    setRadarEnabled((prev) => {
      const next = !prev;
      // Persiste a preferência de ligar/desligar (como vento/cluster) entre
      // visitas; usar = ligar, esconder = desligar. Ao desligar grava também
      // a pausa + frame para restaurar na próxima abertura.
      writeRadarEnabledPref(next);
      if (!next) {
        writeRadarPref(radarUserPausedRef.current, radarFrameIndexRef.current);
      }
      return next;
    });
  }, []);

  /** Botão play/pause do carrossel — persiste a preferência imediatamente. */
  const handleRadarUserPausedChange = useCallback((paused: boolean) => {
    radarUserPausedRef.current = paused;
    setRadarUserPaused(paused);
    writeRadarPref(paused, radarFrameIndexRef.current);
  }, []);

  /** Move o overlay para o frame indicado (carrossel ou scrubber). */
  const handleRadarFrameChange = useCallback((value: number) => {
    const frames = radarFrames(radarData ?? null);
    if (frames.length === 0) return;
    const v = Math.max(0, Math.min(frames.length - 1, value));
    radarFrameIndexRef.current = v;
    setRadarFrameIndex(v);
    radarOverlayRef.current?.setUrl(frames[v].url);
    // Pausado → o frame escolhido fica persistido (scrub enquanto parado).
    if (radarUserPausedRef.current) writeRadarPref(true, v);
  }, [radarData]);

  const showWindOnMarkers = windEnabled && !clusterEnabled && !isHeroEmbed;
  const activeCluster = isHeroEmbed ? true : clusterEnabled;

  const openWindLegend = useCallback(() => {
    setWindLegendOpen(true);
  }, []);

  // IPMA radar overlay — camada opcional; metadata carregada lazy na primeira
  // activação (cache module-level) e o overlay aplicado com os bounds oficiais.
  useEffect(() => {
    if (!radarEnabled) {
      if (radarOverlayRef.current) {
        mapInstanceRef.current?.removeLayer(radarOverlayRef.current);
        radarOverlayRef.current = null;
      }
      return;
    }
    if (!isReady || !mapInstanceRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;

    if (radarData === undefined) {
      let cancelled = false;
      fetchRadarData().then((data) => {
        if (!cancelled) setRadarData(data);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!radarData) return; // indisponível — nada a mostrar

    const map = mapInstanceRef.current;
    const frames = radarFrames(radarData);
    // Restaura o frame escolhido pelo utilizador (persistido) em vez de
    // começar sempre no mais recente.
    const savedFrame = Math.max(0, Math.min(frames.length - 1, readRadarPref().frame));
    radarFrameIndexRef.current = savedFrame;
    setRadarFrameIndex(savedFrame);
    const overlay = Leaflet.imageOverlay(frames[savedFrame].url, Leaflet.latLngBounds(radarBoundsCorners(radarData)), {
      opacity: 0.8,
      attribution: radarData.attribution ?? 'IPMA',
    }).addTo(map);
    radarOverlayRef.current = overlay;

    return () => {
      if (mapInstanceRef.current?.hasLayer(overlay)) {
        mapInstanceRef.current.removeLayer(overlay);
      }
      radarOverlayRef.current = null;
    };
  }, [radarEnabled, isReady, radarData]);

  // Isóbatas 8/16/30 m (IH) — camada vectorial lazy sobre os contornos
  // simplificados nacionais; off por omissão. A falha de rede degrada para
  // «sem camada» (nunca quebra o mapa) e a atribuição IH junta-se à do radar
  // enquanto a camada estiver activa.
  useEffect(() => {
    if (!isobathsEnabled) {
      if (isobathsLayerRef.current) {
        mapInstanceRef.current?.removeLayer(isobathsLayerRef.current);
        isobathsLayerRef.current = null;
      }
      return;
    }
    if (!isReady || !mapInstanceRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;

    if (isobathsData === undefined) {
      let cancelled = false;
      loadIsobathContours().then((data) => {
        if (!cancelled) setIsIsobathsData(data);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!isobathsData) return; // indisponível — nada a mostrar

    const map = mapInstanceRef.current;
    const group = Leaflet.layerGroup();
    for (const depth of ISOBATH_DEPTHS) {
      const lines = isobathsData.contours?.[String(depth)];
      if (!lines) continue;
      const style = ISOBATH_DEPTH_STYLE[depth];
      for (const line of lines) {
        const latlngs = line.map(
          ([lon, lat]) => [lat, lon] as [number, number],
        );
        Leaflet.polyline(latlngs, {
          color: style.color,
          weight: 2,
          opacity: 0.85,
        }).addTo(group);
      }
    }
    group.addTo(map);
    isobathsLayerRef.current = group;
    const attr = isPt
      ? 'Isóbatas © Instituto Hidrográfico (CC BY 4.0)'
      : 'Isobaths © Instituto Hidrográfico (CC BY 4.0)';
    map.attributionControl?.addAttribution(attr);

    return () => {
      if (mapInstanceRef.current?.hasLayer(group)) {
        mapInstanceRef.current.removeLayer(group);
      }
      isobathsLayerRef.current = null;
      mapInstanceRef.current?.attributionControl?.removeAttribution(attr);
    };
  }, [isobathsEnabled, isReady, isobathsData, isPt]);

  // Deep link ?spot=<slug> de um spot com aviso activo: liga a camada costeira
  // automaticamente quando a leitura confirma que o spot está coberto (spot sem
  // aviso fica com o comportamento por omissão — camada desligada). Corre uma
  // vez; o toggle manual é dono do estado a partir daí.
  useEffect(() => {
    if (!focusSpotId) return;
    if (coastalFocusDoneRef.current) return;
    let cancelled = false;
    loadCoastalNavWarnings().then((file) => {
      if (cancelled || !file) return;
      const covering =
        warningsForSpot(file, focusSpotId)?.filter(
          (w) => Array.isArray(w.polygons) && w.polygons.length > 0,
        ) ?? [];
      if (covering.length === 0) return; // spot sem polígonos → deixa desligado
      setCoastalWarningsData(file);
      setCoastalWarningsEnabled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [focusSpotId]);

  // Avisos à navegação costeiros do IH (nav_warning_coastal) — camada vectorial
  // com os polígonos de TODOS os avisos activos (não só os do spot), lazy e off
  // por omissão. Cada polígono tem tooltip (ref — categoria) e popup ligado ao
  // detalhe oficial do IH (url). A falha de rede degrada para «sem camada» e a
  // atribuição IH junta-se à do basemap enquanto a camada estiver activa.
  useEffect(() => {
    if (!coastalWarningsEnabled) {
      if (coastalLayerRef.current) {
        mapInstanceRef.current?.removeLayer(coastalLayerRef.current);
        coastalLayerRef.current = null;
      }
      return;
    }
    if (!isReady || !mapInstanceRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;

    if (coastalWarningsData === undefined) {
      let cancelled = false;
      loadCoastalNavWarnings().then((data) => {
        if (!cancelled) setCoastalWarningsData(data);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!coastalWarningsData) return; // indisponível — nada a mostrar

    const map = mapInstanceRef.current;
    const warnings =
      coastalWarningsData.warnings?.filter(
        (w) => Array.isArray(w.polygons) && w.polygons.length > 0,
      ) ?? [];
    if (warnings.length === 0) return;

    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const group = Leaflet.layerGroup();
    for (const w of warnings) {
      for (const ring of w.polygons!) {
        // rings são [lon, lat] (GeoJSON) — Leaflet quer [lat, lon].
        const latlngs = ring.map(
          ([ringLon, ringLat]) => [ringLat, ringLon] as [number, number],
        );
        const url = w.url;
        // Tooltip ligado ao detalhe oficial do aviso (geoanavnet.hidrografico.pt):
        // com URL é um link clicável; sem URL fica só o texto (ref — categoria).
        const tooltipHtml = url
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(w.ref)}${w.category ? ` — ${escapeHtml(w.category)}` : ''} ↗</a>`
          : `${escapeHtml(w.ref)}${w.category ? ` — ${escapeHtml(w.category)}` : ''}`;
        const poly = Leaflet.polygon(latlngs, {
          color: '#ef4444',
          weight: 2,
          opacity: 0.9,
          fillColor: '#ef4444',
          fillOpacity: 0.18,
        }).bindTooltip(tooltipHtml, {
          sticky: true,
          direction: 'top',
          interactive: true,
        });
        // Clique no polígono abre o aviso no geoanavnet (nova aba) — sem URL
        // (ex. ES sem detalhe) o clique não faz nada. stopPropagation para o
        // mapa não reagir (fechar tooltips/popups de outros layers).
        if (url) {
          poly.on('click', (e) => {
            Leaflet.DomEvent.stopPropagation(e);
            window.open(url, '_blank', 'noopener,noreferrer');
          });
        }
        poly.addTo(group);
      }
    }
    group.addTo(map);
    coastalLayerRef.current = group;
    // Deep link ?spot=: centra o mapa na área coberta do spot (polígonos dos
    // avisos que o cobrem), para o utilizador ver a zona em aviso — uma vez;
    // o enquadramento manual/de outras camadas manda a partir daí.
    if (focusSpotId && !coastalFocusDoneRef.current && isReady) {
      const covering =
        warningsForSpot(coastalWarningsData, focusSpotId)?.filter(
          (w) => Array.isArray(w.polygons) && w.polygons.length > 0,
        ) ?? [];
      if (covering.length > 0) {
        const focus = Leaflet.latLngBounds([]);
        for (const w of covering) {
          for (const ring of w.polygons!) {
            for (const [ringLon, ringLat] of ring) focus.extend([ringLat, ringLon]);
          }
        }
        if (focus.isValid()) {
          map.fitBounds(focus.pad(0.15), { maxZoom: 10, animate: true });
        }
      }
      coastalFocusDoneRef.current = true;
    }
    const attr = isPt
      ? 'Avisos à Navegação Costeiros © Instituto Hidrográfico (CC BY 4.0)'
      : 'Coastal Navigation Warnings © Instituto Hidrográfico (CC BY 4.0)';
    map.attributionControl?.addAttribution(attr);
    map.getContainer().dataset.coastalWarnings = 'true';

    return () => {
      if (mapInstanceRef.current?.hasLayer(group)) {
        mapInstanceRef.current.removeLayer(group);
      }
      coastalLayerRef.current = null;
      mapInstanceRef.current?.attributionControl?.removeAttribution(attr);
      mapInstanceRef.current?.getContainer().removeAttribute('data-coastal-warnings');
    };
  }, [coastalWarningsEnabled, isReady, coastalWarningsData, isPt, focusSpotId]);

  // Pausa o carrossel durante drag/zoom do mapa (setUrl durante o movimento
  // causa flicker/despesa desnecessária). Cada evento claro marca a sua FONTE
  // ('move'/'drag'/'zoom') no Set; cada fim remove-a. O carrossel só retoma
  // quando o Set fica vazio — drag+zoom sobrepostos não retomam cedo de mais
  // porque a fonte que termina primeiro não limpa as outras ainda activas.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!isReady || !map) return;
    const busy = (src: string) =>
      setRadarBusySources((prev) => {
        if (prev.has(src)) return prev;
        const next = new Set(prev);
        next.add(src);
        return next;
      });
    const idle = (src: string) =>
      setRadarBusySources((prev) => {
        if (!prev.has(src)) return prev;
        const next = new Set(prev);
        next.delete(src);
        return next;
      });
    const onMoveStart = () => busy('move');
    const onDragStart = () => busy('drag');
    const onZoomStart = () => busy('zoom');
    const onMoveEnd = () => idle('move');
    const onDragEnd = () => idle('drag');
    const onZoomEnd = () => idle('zoom');
    map.on('movestart', onMoveStart);
    map.on('dragstart', onDragStart);
    map.on('zoomstart', onZoomStart);
    map.on('moveend', onMoveEnd);
    map.on('dragend', onDragEnd);
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('movestart', onMoveStart);
      map.off('dragstart', onDragStart);
      map.off('zoomstart', onZoomStart);
      map.off('moveend', onMoveEnd);
      map.off('dragend', onDragEnd);
      map.off('zoomend', onZoomEnd);
    };
  }, [isReady]);

  // Em fullscreen, o HUD inferior (altura variável, z-1100) cobre o carrossel
  // (que está em bottom-8) — mede a altura real do HUD e ergue o carrossel
  // por cima dele, para o scrubber/botão não ficarem interceptados nem
  // ocultos. ResizeObserver cobre resize e collapse/expand do HUD.
  useEffect(() => {
    if (!isFullscreen || !radarEnabled) return;
    const hud = document.querySelector('[data-map-hud-collapsed]');
    if (!hud) return;
    const measure = () => setRadarLift(hud.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hud);
    return () => ro.disconnect();
  }, [isFullscreen, radarEnabled, mapHud]);

  // A animação do carrossel vive no RadarCarousel partilhado (interval + pausa
  // por scrubber/drag); aqui fica só o overlay e a sincronização do frame.

  const closeWindLegend = useCallback(() => {
    setWindLegendOpen(false);
  }, []);

  // First-time coach when wind rings become visible — defer until browser is idle
  useEffect(() => {
    if (!isReady || !showWindOnMarkers || isHeroEmbed) return;
    if (windLegendAutoQueuedRef.current || hasSeenWindRingLegend()) return;
    windLegendAutoQueuedRef.current = true;
    const open = () => setWindLegendOpen(true);
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(open, { timeout: 4000 });
    } else {
      timeoutId = window.setTimeout(open, 2000);
    }
    return () => {
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [isReady, showWindOnMarkers, isHeroEmbed]);

  // Performance measurement — marker creation timing
  const perfMeasure = useCallback((label: string) => {
    if (typeof performance !== 'undefined') {
      performance.mark(`ventu-map-${label}`);
      const entries = performance.getEntriesByType('measure').filter(
        (e) => e.name.startsWith('ventu-map-'),
      );
      if (entries.length > 1) {
        const last = entries[entries.length - 1] as PerformanceMeasure;
        const prev = entries[entries.length - 2] as PerformanceMeasure;
        if (last.duration > 0) {
          console.log(`[map perf] ${label}: ${Math.round(last.duration)}ms`);
        }
      }
    }
  }, []);

  const visibleSpots = useMemo(() => {
    if (!onlyOnEnabled) return spotsData;
    return spotsData.filter((d) => spotMeetsOnFilter(d, selectedSport));
  }, [spotsData, onlyOnEnabled, selectedSport]);

  // Strongest sea-state/wind warning per visible spot (red > orange > yellow).
  const warningsBySpot = useMemo(() => {
    const map = new Map<string, MapMarkerWarning>();
    if (!warningsData) return map;
    for (const data of visibleSpots) {
      const w = strongestSpotWarning(warningsData, data.spot.id);
      if (w) {
        map.set(data.spot.id, {
          level: w.level,
          label: warningBadgeLabel(w, isPt),
          seaState: SEA_STATE_WARNING_TYPES.has(w.type),
        });
      }
    }
    return map;
  }, [warningsData, visibleSpots, isPt]);

  // Recalculate Leaflet size when toggling fullscreen or resizing
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const raf = requestAnimationFrame(() => {
      if (mapInstanceRef.current) map.invalidateSize({ animate: false });
    });
    // One delayed sync is enough — cascading 0/150/300 timers jank mobile
    const t = window.setTimeout(() => {
      if (mapInstanceRef.current) map.invalidateSize({ animate: false });
    }, isMobile ? 100 : 300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [isFullscreen, isReady, isMobile]);

  // Map paints first; markers load after a beat so touch isn't blocked
  useEffect(() => {
    if (!isReady) {
      setAllowMarkers(false);
      return;
    }
    const delay = isMobile ? 280 : 0;
    const t = window.setTimeout(() => setAllowMarkers(true), delay);
    return () => window.clearTimeout(t);
  }, [isReady, isMobile]);

  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isReady]);

  // Hero embed: keep Leaflet sized to the hero plane and refit Portugal into the right pane
  useEffect(() => {
    if (!isHeroEmbed || !isReady || !mapInstanceRef.current || !mapRef.current) return;
    const host = mapRef.current.closest('[data-map-hero-teaser]');
    if (!host) return;
    const map = mapInstanceRef.current;
    const Leaflet = LRef.current;
    if (!Leaflet) return;

    const fitHero = () => {
      const bounds = Leaflet.latLngBounds([]);
      visibleSpots.forEach((data) => {
        if (includeSpotInViewportBounds(data.spot, selectedRegion)) {
          bounds.extend([data.spot.lat, data.spot.lon]);
        }
      });
      if (!bounds.isValid()) return;
      map.invalidateSize({ animate: false });
      const leftPad = isMobile ? 20 : 300;
      map.fitBounds(bounds, {
        paddingTopLeft: Leaflet.point(leftPad, 48),
        paddingBottomRight: Leaflet.point(40, 96),
        maxZoom: isMobile ? 8 : 10,
        animate: false,
      });
    };

    const ro = new ResizeObserver(() => fitHero());
    ro.observe(host);
    const t1 = window.setTimeout(fitHero, 0);
    const t2 = window.setTimeout(fitHero, 150);
    const t3 = window.setTimeout(fitHero, 500);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [isHeroEmbed, isReady, visibleSpots, selectedRegion, isMobile]);

  // Lock page scroll while map is fullscreen — always clear on exit (Drawer pattern)
  useEffect(() => {
    if (!isFullscreen) {
      unlockPageInteraction();
      return;
    }

    document.body.classList.add('ventu-map-fullscreen-open');
    document.body.style.overflow = 'hidden';

    return () => {
      unlockPageInteraction();
    };
  }, [isFullscreen]);

  // Leaflet keeps viewport-sized panes until invalidateSize runs after layout settles
  useEffect(() => {
    if (isFullscreen || !isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const sync = () => map.invalidateSize({ animate: false });
    sync();
    const t = window.setTimeout(sync, isMobile ? 100 : 150);
    return () => {
      window.clearTimeout(t);
    };
  }, [isFullscreen, isReady, isMobile]);

  // Escape: close sheet first, then exit fullscreen
  useEffect(() => {
    if (!isFullscreen && !sheetSpot) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sheetSpot) {
        e.preventDefault();
        setSheetSpot(null);
        return;
      }
      if (isFullscreen) exitFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, sheetSpot, exitFullscreen]);

  // Fallback: popup buttons (Leaflet pane) — capture so clicks register before map handlers
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const container = mapInstanceRef.current.getContainer();
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.ventu-popup-detail');
      if (!btn) return;
      if (!onSpotSelectRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const spotId = btn.getAttribute('data-spot-id');
      if (spotId) onSpotSelectRef.current(spotId);
    };
    container.addEventListener('click', onClick, true);
    return () => container.removeEventListener('click', onClick, true);
  }, [isReady]);

  // Markers: reuse cached Leaflet markers when possible.
  useEffect(() => {
    if (
      !allowMarkers ||
      !isReady ||
      !mapInstanceRef.current ||
      !clusterGroupRef.current ||
      !markersGroupRef.current
    ) {
      return;
    }
    const Leaflet = LRef.current;
    if (!Leaflet) return;

    const map = mapInstanceRef.current;
    const mcg = clusterGroupRef.current;
    const lg = markersGroupRef.current;
    const cache = markersCacheRef.current;

    map.closePopup();
    setSheetSpot(null);
    mcg.clearLayers();
    lg.clearLayers();

    if (activeCluster) {
      if (map.hasLayer(lg)) map.removeLayer(lg);
      if (!map.hasLayer(mcg)) map.addLayer(mcg);
    } else {
      if (map.hasLayer(mcg)) map.removeLayer(mcg);
      if (!map.hasLayer(lg)) map.addLayer(lg);
    }

    const boundsKey = `${visibleSpots.length}:${onlyOnEnabled}:${selectedSport}:${selectedRegion}`;
    if (filterBoundsKeyRef.current !== boundsKey) {
      filterBoundsKeyRef.current = boundsKey;
      didFitBoundsRef.current = false;
    }

    if (visibleSpots.length === 0) return;

    const nextIds = new Set(visibleSpots.map((d) => d.spot.id));
    for (const [id, marker] of cache) {
      if (!nextIds.has(id)) {
        marker.remove();
        cache.delete(id);
      }
    }

    const bounds = Leaflet.latLngBounds([]);
    const useMobileSheet = isMobile;
    const chunkSize = isMobile ? MARKER_ADD_CHUNK_SIZE_MOBILE : MARKER_ADD_CHUNK_SIZE;
    const yieldMs = isMobile ? MARKER_CHUNK_YIELD_MS_MOBILE : 0;

    const fitBoundsIfNeeded = () => {
      if (didFitBoundsRef.current || !bounds.isValid() || !mapInstanceRef.current) return;
      const fitMap = mapInstanceRef.current;
      fitMap.invalidateSize({ animate: false });
      if (isHeroEmbed) {
        const leftPad = isMobile ? 20 : 300;
        fitMap.fitBounds(bounds, {
          paddingTopLeft: Leaflet.point(leftPad, 48),
          paddingBottomRight: Leaflet.point(40, 96),
          maxZoom: isMobile ? 8 : 10,
          animate: false,
        });
      } else {
        const fitMaxZoom = isMobile ? 9 : 11;
        fitMap.fitBounds(bounds, {
          padding: isMobile ? [16, 16] : [40, 40],
          maxZoom: fitMaxZoom,
          animate: false,
        });
      }
      didFitBoundsRef.current = true;
    };

    markerChunkCancelRef.current = false;
    runChunked(
      visibleSpots,
      (batch) => {
        const toCluster: L.Marker[] = [];
        const toPlain: L.Marker[] = [];

        for (const data of batch) {
          const warning = warningsBySpot.get(data.spot.id) ?? null;
          const cacheKey = buildMarkerCacheKey(
            data,
            selectedSport,
            showWindOnMarkers,
            locale,
            useMobileSheet,
            warning?.level ?? null,
          );
          let marker = cache.get(data.spot.id);
          const meta = marker as (L.Marker & { ventuKey?: string }) | undefined;

          if (!marker || meta?.ventuKey !== cacheKey) {
            if (marker) {
              marker.remove();
              cache.delete(data.spot.id);
            }
            marker = createSpotMarker(Leaflet, data, selectedSport, locale, showWindOnMarkers, {
              useMobileSheet,
              onMobileTap: (d) =>
                setSheetSpot({ ...d, warning: warningsBySpot.get(d.spot.id) ?? null }),
              onSpotSelect,
              warning: warningsBySpot.get(data.spot.id) ?? null,
            });
            (marker as L.Marker & { ventuKey?: string }).ventuKey = cacheKey;
            cache.set(data.spot.id, marker);
          }

          if (activeCluster) {
            toCluster.push(marker);
          } else {
            toPlain.push(marker);
          }
          if (includeSpotInViewportBounds(data.spot, selectedRegion)) {
            bounds.extend([data.spot.lat, data.spot.lon]);
          }
        }

        if (toCluster.length > 0) mcg.addLayers(toCluster);
        if (toPlain.length > 0) toPlain.forEach((m) => lg.addLayer(m));
      },
      markerChunkCancelRef,
      fitBoundsIfNeeded,
      chunkSize,
      yieldMs,
    );

    return () => {
      markerChunkCancelRef.current = true;
    };
  }, [
    allowMarkers,
    visibleSpots,
    onlyOnEnabled,
    selectedSport,
    selectedRegion,
    isReady,
    clusterEnabled,
    showWindOnMarkers,
    locale,
    onSpotSelect,
    isMobile,
    isHeroEmbed,
    activeCluster,
    warningsBySpot,
  ]);

  const exitFullscreenLabel = t.map.exitFullscreen;
  const clusterLabel = clusterEnabled ? t.map.showAllSpots : t.map.clusterSpots;
  const windLabel = windEnabled ? t.map.hideWind : t.map.showWind;
  // Only when cluster blocks wind rings — legend copy lives behind "?"
  const windHint =
    clusterEnabled && windEnabled ? t.map.windNeedsShowAll : null;
  const onlyOnLabel = onlyOnEnabled ? t.map.onlyOnOff : t.map.onlyOn;
  const onlyOnHint = t.map.onlyOnHint;
  const windLegendHelpLabel = t.map.windRingLegend.help;
  const radarLabel = radarEnabled ? t.map.hideRadar : t.map.showRadar;
  const radarHint = t.map.radarHint;
  const radarUnavailable = radarData === null;
  const coastalWarningsLabel = coastalWarningsEnabled
    ? t.map.hideCoastalWarnings
    : t.map.showCoastalWarnings;
  // Atribuição do radar no badge (a fonte dos frames é o IPMA, não o modelo).
  const ipmaRadarAttributionLabel = isPt
    ? IPMA_RADAR_ATTRIBUTION_LABEL_PT
    : IPMA_RADAR_ATTRIBUTION_LABEL_EN;
  const radarFrameList = radarFrames(radarData ?? null);
  const hudSpotCount = onlyOnEnabled ? visibleSpots.length : (mapHud?.spotCount ?? visibleSpots.length);

  return (
    <div
      className={
        isFullscreen
          ? fullscreenBelowHeader
            ? 'fixed left-0 right-0 bottom-0 z-40 w-full overflow-visible bg-surface-1/[0.04] top-16'
            : 'fixed inset-0 z-[1100] w-full overflow-visible bg-surface-1/[0.04] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
          : isHeroEmbed
            ? 'absolute inset-0 overflow-hidden bg-bg-base'
            : 'relative w-full rounded-2xl border border-divider overflow-hidden bg-surface-1/[0.04]'
      }
      style={
        isFullscreen
          ? fullscreenBelowHeader
            ? { height: 'calc(100dvh - 4rem)' }
            : { height: '100dvh' }
          : isHeroEmbed
            ? undefined
            : { height: 'clamp(300px, 50vh, 600px)' }
      }
      data-map-fullscreen={isFullscreen ? 'true' : 'false'}
      data-map-hud={isFullscreen && mapHud ? 'visible' : 'hidden'}
      data-map-cluster={clusterEnabled ? 'true' : 'false'}
      data-map-wind={showWindOnMarkers ? 'true' : 'false'}
      data-map-only-on={onlyOnEnabled ? 'true' : 'false'}
      data-map-hero-teaser={isHeroEmbed ? 'true' : undefined}
    >
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-1/[0.04] z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
            <span className="text-sm text-fg-muted">{t.map.loading}</span>
          </div>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" aria-label={isPt ? 'Mapa dos spots' : 'Spots map'} />

      {isReady && (
        <>
          {/* Aviso da camada de boias (no-key/down/stale): o mesmo BuoyLayerNotice
              do card/hero, sobreposto ao mapa — sujeito a as leituras estarem
              globalmente desactivadas ou em baixo. Envolto num contentor absolute
              e pointer-events-none para nunca bloquear a interacção com o mapa.
              Renderiza nada quando uma fonte (IH ou WMO) está saudável. */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] w-full max-w-[min(92%,460px)] px-2 pointer-events-none">
            <BuoyLayerNotice locale={locale} scope="home" overlay />
          </div>

          {!isHeroEmbed && (!isFullscreen || !mapHud) && (
            <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2">
              <button
                ref={fullscreenBtnRef}
                type="button"
                onClick={enterFullscreen}
                className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border border-divider bg-bg-elevated text-fg text-xs font-semibold shadow-card hover:bg-surface-1/[0.04] transition-colors duration-150 touch-manipulation"
                aria-label={t.map.exploreMode}
                aria-expanded={isFullscreen}
              >
                <Maximize2 className="w-4 h-4 shrink-0" aria-hidden />
                <span className="hidden sm:inline">{t.map.exploreMode}</span>
              </button>
              <button
                type="button"
                onClick={toggleCluster}
                className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border border-divider bg-bg-elevated text-fg text-xs font-semibold shadow-card hover:bg-surface-1/[0.04] transition-colors duration-150 touch-manipulation"
                aria-label={clusterLabel}
                aria-pressed={!clusterEnabled}
              >
                {clusterEnabled ? (
                  <MapPin className="w-4 h-4 shrink-0" aria-hidden />
                ) : (
                  <Layers className="w-4 h-4 shrink-0" aria-hidden />
                )}
                <span className="hidden sm:inline">{clusterLabel}</span>
              </button>
              <div className="inline-flex flex-col gap-1">
                <div className="inline-flex items-center gap-0.5">
                  <button
                    ref={windButtonRef}
                    type="button"
                    onClick={toggleWind}
                    title={windHint ?? undefined}
                    className={`flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border shadow-card transition-colors duration-150 touch-manipulation text-xs font-semibold ${
                      showWindOnMarkers
                        ? 'border-data-wind/40 bg-data-wind/15 text-fg'
                        : windEnabled && clusterEnabled
                          ? 'border-divider bg-bg-elevated text-fg-muted opacity-80'
                          : 'border-divider bg-bg-elevated text-fg hover:bg-surface-1/[0.04]'
                    }`}
                    aria-label={windLabel}
                    aria-pressed={showWindOnMarkers}
                  >
                    <Wind className="w-4 h-4 shrink-0 text-data-wind" aria-hidden />
                    <span className="hidden sm:inline">{windLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={openWindLegend}
                    className="flex items-center justify-center min-h-[36px] min-w-[36px] rounded-input border border-divider bg-bg-elevated text-fg-muted hover:bg-surface-1/[0.04] hover:text-fg transition-colors duration-150"
                    aria-label={windLegendHelpLabel}
                  >
                    <HelpCircle className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleRadar}
                disabled={radarUnavailable}
                title={radarUnavailable ? `${radarHint} — indisponível` : radarHint}
                className={`flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border shadow-card transition-colors duration-150 touch-manipulation text-xs font-semibold ${
                  radarUnavailable
                    ? 'border-divider bg-bg-elevated text-fg-subtle opacity-60 cursor-not-allowed'
                    : radarEnabled
                      ? 'border-data-waves/40 bg-data-waves/15 text-fg'
                      : 'border-divider bg-bg-elevated text-fg hover:bg-surface-1/[0.04]'
                }`}
                aria-label={radarLabel}
                aria-pressed={radarEnabled}
              >
                <CloudRain className="w-4 h-4 shrink-0 text-data-waves" aria-hidden />
                <span className="hidden sm:inline">{radarLabel}</span>
              </button>
              <button
                type="button"
                onClick={toggleIsobaths}
                title={t.map.isobathsHint}
                className={`flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border shadow-card transition-colors duration-150 touch-manipulation text-xs font-semibold ${
                  isobathsEnabled
                    ? 'border-data-waves/40 bg-data-waves/15 text-fg'
                    : 'border-divider bg-bg-elevated text-fg hover:bg-surface-1/[0.04]'
                }`}
                aria-label={isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths}
                aria-pressed={isobathsEnabled}
              >
                <Waves className="w-4 h-4 shrink-0 text-data-waves" aria-hidden />
                <span className="hidden sm:inline">
                  {isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths}
                </span>
              </button>
              <button
                type="button"
                onClick={toggleOnlyOn}
                title={onlyOnHint}
                className={`flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border shadow-card transition-colors duration-150 touch-manipulation text-xs font-semibold ${
                  onlyOnEnabled
                    ? 'border-score-good/40 bg-score-good/15 text-fg'
                    : 'border-divider bg-bg-elevated text-fg hover:bg-surface-1/[0.04]'
                }`}
                aria-label={onlyOnLabel}
                aria-pressed={onlyOnEnabled}
              >
                <Zap className="w-4 h-4 shrink-0 text-score-good" aria-hidden />
                <span className="hidden sm:inline">{onlyOnLabel}</span>
              </button>
            </div>
          )}

          {!isFullscreen && !isHeroEmbed && (
            <MapLayerToggle
              current={basemapMode}
              onChange={handleBasemapChange}
              isPt={isPt}
            />
          )}

          {!isHeroEmbed && (
            <MapLegend
              locale={locale}
              reserveHudSpace={isFullscreen}
              hudCompact={isFullscreen && hudCollapsed}
              isobathsTitle={t.map.isobathsLegend}
              isobathsVisible={isobathsEnabled && isobathsData != null}
            />
          )}

          {!isFullscreen && !isHeroEmbed && (
            <p className="absolute z-[1000] max-w-[min(100%,280px)] px-2.5 py-1 rounded-md text-meta-sm text-fg-muted bg-bg-elevated/90 border border-divider shadow-sm pointer-events-none max-md:hidden bottom-14 left-1/2 -translate-x-1/2">
              {t.map.mapDataHint}
            </p>
          )}

          {isHeroEmbed && (
            <>
              <button
                type="button"
                onClick={toggleRadar}
                aria-label={radarLabel}
                aria-pressed={radarEnabled}
                className="absolute top-3 right-3 z-[1000] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors pointer-events-auto"
              >
                <CloudRain className="w-3.5 h-3.5 text-data-waves" aria-hidden />
                <span className="hidden sm:inline">{radarLabel}</span>
              </button>
              {/* Isóbatas 8/16/30 m no TopMap — a mesma camada partilhada do mapa
                  de spot, com toggle dedicado no hero (as isóbatas são o único
                  controlo do infopanel hero escondido). Label só em >=sm. */}
              <button
                type="button"
                onClick={toggleIsobaths}
                aria-label={isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths}
                title={t.map.isobathsHint}
                aria-pressed={isobathsEnabled}
                className="absolute top-[54px] right-3 z-[1000] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors pointer-events-auto"
              >
                <Waves className="w-3.5 h-3.5 text-data-waves" aria-hidden />
                <span className="hidden sm:inline">
                  {isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths}
                </span>
              </button>
            </>
          )}

          {radarEnabled && radarData && (
            <RadarCarousel
              className={
                isHeroEmbed
                  ? 'absolute bottom-20 right-3 z-[1000] pointer-events-auto'
                  : isFullscreen
                    ? 'absolute left-2 z-[1000]'
                    : // Mapa embebido (grid de spots): o canto inferior ESQUERDO
                      // colide com a pilha de controlos (top-left, 5 botões) em
                      // mapas baixos — o carrossel fica no canto inferior
                      // direito, longe dos controlos e do toggle de basemap
                      // (top-right), e nunca intercepta os cliques.
                      'absolute bottom-8 right-2 z-[1000]'
              }
              style={isFullscreen ? { bottom: Math.max(radarLift + 12, 32) } : undefined}
              frames={radarFrameList}
              frameIndex={radarFrameIndex}
              onFrameChange={handleRadarFrameChange}
              mapBusyCount={radarBusySources.size}
              userPaused={radarUserPaused}
              onUserPausedChange={handleRadarUserPausedChange}
              labels={{
                badge: t.map.radarBadge,
                hint: t.map.radarHint,
                scrub: t.map.radarScrub,
                play: t.map.radarPlay,
                pause: t.map.radarPause,
                paused: t.map.radarPaused,
                ipmaAttribution: ipmaRadarAttributionLabel,
                gap: t.map.radarGap,
              }}
              // Imersão: abrir o /mapa (ecrã inteiro) com o radar já ligado —
              // só faz sentido fora do fullscreen (no /mapa já lá estamos).
              fullscreenHref={isFullscreen ? undefined : `/${locale}/mapa/?radar=1`}
              fullscreenLabel={t.map.radarFullscreen}
            />
          )}

          {mapHud && isFullscreen && (
            <MapExploreHud
              {...mapHud}
              spotCount={hudSpotCount}
              visible
              isPt={isPt}
              basemapMode={basemapMode}
              onBasemapChange={handleBasemapChange}
              clusterEnabled={clusterEnabled}
              onToggleCluster={toggleCluster}
              radarEnabled={radarEnabled}
              onToggleRadar={toggleRadar}
              radarLabel={radarLabel}
              radarHint={radarHint}
              isobathsEnabled={isobathsEnabled}
              onToggleIsobaths={toggleIsobaths}
              isobathsLabel={isobathsEnabled ? t.map.hideIsobaths : t.map.showIsobaths}
              isobathsHint={t.map.isobathsHint}
              coastalWarningsEnabled={coastalWarningsEnabled}
              onToggleCoastalWarnings={toggleCoastalWarnings}
              coastalWarningsLabel={coastalWarningsLabel}
              coastalWarningsHint={t.map.coastalWarningsHint}
              windEnabled={windEnabled}
              showWindOnMarkers={showWindOnMarkers}
              onToggleWind={toggleWind}
              onlyOnEnabled={onlyOnEnabled}
              onToggleOnlyOn={toggleOnlyOn}
              onlyOnLabel={onlyOnLabel}
              onlyOnHint={onlyOnHint}
              onExitFullscreen={exitFullscreen}
              windHint={windHint}
              exploreModeLabel={t.map.exploreMode}
              layerMapLabel={t.map.layerMap}
              layerSatelliteLabel={t.map.layerSatellite}
              clusterLabel={clusterLabel}
              windLabel={windLabel}
              exitLabel={exitFullscreenLabel}
              windLegendHelpLabel={windLegendHelpLabel}
              onOpenWindLegend={openWindLegend}
              windButtonRef={windButtonRef}
              collapseHudLabel={t.map.collapseHud}
              expandHudLabel={t.map.expandHud}
              onCollapsedChange={setHudCollapsed}
            />
          )}

          <WindRingLegend
            open={windLegendOpen}
            onClose={closeWindLegend}
            anchorRef={windButtonRef}
            locale={locale}
          />

          {isMobile && (
            <MapSpotSheet
              data={sheetSpot}
              selectedSport={selectedSport}
              locale={locale}
              onClose={() => setSheetSpot(null)}
              onViewSpot={onSpotSelect}
            />
          )}
        </>
      )}
    </div>
  );
}
