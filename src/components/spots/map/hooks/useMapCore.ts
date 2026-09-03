'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type L from 'leaflet';
import { clearLeafletContainer } from '@/lib/mapFullscreen';
import type { BasemapMode } from '@/components/spots/MapLayerToggle';
import {
  TILE_URLS,
  TILE_ATTRIBUTIONS,
  OPEN_METEO_ATTRIBUTION,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  CLUSTER_CONFIG,
  rasterTileLayerOptions,
  getEsriRasterBasemap,
  bindRasterTileFallback,
} from '@/lib/map-constants';
import { createClusterIconFunction } from '@/components/spots/MapClusterIcon';

interface UseMapCoreOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isHeroEmbed: boolean;
}

interface UseMapCoreReturn {
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  LRef: React.MutableRefObject<typeof L | null>;
  isReady: boolean;
  isDark: boolean;
  basemapMode: BasemapMode;
  isMobile: boolean;
  handleBasemapChange: (mode: BasemapMode) => void;
  tileLayerRef: React.MutableRefObject<L.TileLayer | null>;
  clusterGroupRef: React.MutableRefObject<L.MarkerClusterGroup | null>;
  markersGroupRef: React.MutableRefObject<L.LayerGroup | null>;
  radarOverlayRef: React.MutableRefObject<L.ImageOverlay | null>;
  isobathsLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  coastalLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  markersCacheRef: React.MutableRefObject<Map<string, L.Marker>>;
}

export function useMapCore({ containerRef, isHeroEmbed }: UseMapCoreOptions): UseMapCoreReturn {
  const mapInstanceRef = useRef<L.Map | null>(null);
  const LRef = useRef<typeof L | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const radarOverlayRef = useRef<L.ImageOverlay | null>(null);
  const isobathsLayerRef = useRef<L.LayerGroup | null>(null);
  const coastalLayerRef = useRef<L.LayerGroup | null>(null);
  const markersCacheRef = useRef<Map<string, L.Marker>>(new Map());
  const mountedRef = useRef(true);

  const [isReady, setIsReady] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('map');
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  // Mounted tracking
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Mobile viewport detection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Restore persisted basemap preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('ventu.map.basemap');
      if (saved === 'map' || saved === 'satellite') setBasemapMode(saved);
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

  // Initialize Leaflet map
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;
    if (mapInstanceRef.current) return;

    let cancelled = false;
    const container = containerRef.current;

    const teardownMap = () => {
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch { /* noop */ }
        mapInstanceRef.current = null;
      }
      markersCacheRef.current.forEach((marker) => {
        try { marker.remove(); } catch { /* noop */ }
      });
      markersCacheRef.current.clear();
      radarOverlayRef.current = null;
      isobathsLayerRef.current = null;
      clusterGroupRef.current = null;
      markersGroupRef.current = null;
      tileLayerRef.current = null;
      LRef.current = null;
      clearLeafletContainer(container);
      if (mountedRef.current) setIsReady(false);
    };

    (async () => {
      const mobileInit = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

      await Promise.all([
        import('leaflet/dist/leaflet.css'),
        import('leaflet.markercluster/dist/MarkerCluster.css'),
        import('leaflet.markercluster/dist/MarkerCluster.Default.css'),
      ]);
      const Leaflet = (await import('leaflet')).default;
      await import('leaflet.markercluster');
      if (cancelled || !containerRef.current) return;

      clearLeafletContainer(container);
      LRef.current = Leaflet;

      const map = Leaflet.map(container, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        attributionControl: false,
        ...(mobileInit ? { renderer: Leaflet.canvas() } : {}),
        ...(isHeroEmbed
          ? { scrollWheelZoom: false, dragging: false, touchZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false }
          : {}),
      });

      if (cancelled) { map.remove(); clearLeafletContainer(container); return; }

      const darkOnInit = !document.documentElement.classList.contains('theme-ocean');
      const { url, ...opts } = rasterTileLayerOptions(darkOnInit);
      const rasterLayer = Leaflet.tileLayer(url, opts);
      bindRasterTileFallback(rasterLayer, () => {
        try { map.removeLayer(rasterLayer); } catch { /* noop */ }
        const esri = getEsriRasterBasemap(darkOnInit);
        tileLayerRef.current = Leaflet.tileLayer(esri.url, {
          attribution: esri.attribution,
          maxZoom: MAX_ZOOM,
        }).addTo(map);
      });
      tileLayerRef.current = rasterLayer.addTo(map);

      if (!isHeroEmbed) Leaflet.control.zoom({ position: 'bottomright' }).addTo(map);

      Leaflet.control
        .attribution({ position: 'bottomleft', prefix: false })
        .addAttribution(OPEN_METEO_ATTRIBUTION)
        .addTo(map);

      const mcg = Leaflet.markerClusterGroup({
        ...CLUSTER_CONFIG,
        ...(mobileInit ? { chunkInterval: 200, chunkDelay: 80, maxClusterRadius: 72 } : {}),
        iconCreateFunction: createClusterIconFunction(Leaflet, { simple: mobileInit }),
      });
      const lg = Leaflet.layerGroup();
      clusterGroupRef.current = mcg;
      markersGroupRef.current = lg;
      map.addLayer(mcg);

      if (cancelled) { map.remove(); clearLeafletContainer(container); return; }

      mapInstanceRef.current = map;
      if (mountedRef.current) setIsReady(true);
      if (typeof window !== 'undefined' && (window as any).__RADAR_TEST__) {
        (window as any).__RADAR_MAP__ = map;
      }
    })();

    return () => { cancelled = true; teardownMap(); };
  }, [isHeroEmbed, containerRef]);

  // Basemap + theme on Leaflet container
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
      tileLayerRef.current = null;
    }

    if (basemapMode === 'satellite') {
      tileLayerRef.current = Leaflet.tileLayer(TILE_URLS.satellite, {
        attribution: TILE_ATTRIBUTIONS.esri,
        maxZoom: MAX_ZOOM,
      }).addTo(map);
    } else {
      const raster = rasterTileLayerOptions(isDark);
      const { url, ...opts } = raster;
      const rasterLayer = Leaflet.tileLayer(url, opts);
      bindRasterTileFallback(rasterLayer, () => {
        try { map.removeLayer(rasterLayer); } catch { /* noop */ }
        const esri = getEsriRasterBasemap(isDark);
        tileLayerRef.current = Leaflet.tileLayer(esri.url, {
          attribution: esri.attribution,
          maxZoom: MAX_ZOOM,
        }).addTo(map);
      });
      tileLayerRef.current = rasterLayer.addTo(map);
    }
  }, [basemapMode, isDark, isReady]);

  // Handle basemap toggle
  const handleBasemapChange = useCallback((mode: BasemapMode) => {
    setBasemapMode(mode);
    try { localStorage.setItem('ventu.map.basemap', mode); } catch { /* noop */ }
  }, []);

  // Resize handling
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const raf = requestAnimationFrame(() => {
      if (mapInstanceRef.current) map.invalidateSize({ animate: false });
    });
    const t = window.setTimeout(() => {
      if (mapInstanceRef.current) map.invalidateSize({ animate: false });
    }, isMobile ? 100 : 300);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [isReady, isMobile]);

  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isReady]);

  return {
    mapInstanceRef,
    LRef,
    isReady,
    isDark,
    basemapMode,
    isMobile,
    handleBasemapChange,
    tileLayerRef,
    clusterGroupRef,
    markersGroupRef,
    radarOverlayRef,
    isobathsLayerRef,
    coastalLayerRef,
    markersCacheRef,
  };
}
