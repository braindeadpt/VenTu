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
  clusterReady: boolean;
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
  buoyLayerRef: React.MutableRefObject<L.LayerGroup | null>;
  markersCacheRef: React.MutableRefObject<Map<string, L.Marker>>;
}

function readBasemapPref(): BasemapMode {
  if (typeof window === 'undefined') return 'map';
  try {
    const saved = localStorage.getItem('ventu.map.basemap');
    if (saved === 'map' || saved === 'satellite') return saved;
  } catch {
    /* noop */
  }
  return 'map';
}

function readIsDark(): boolean {
  if (typeof document === 'undefined') return false;
  return !document.documentElement.classList.contains('theme-ocean');
}

function tileSignature(mode: BasemapMode, dark: boolean): string {
  return mode === 'satellite' ? 'satellite' : `map:${dark ? 'dark' : 'light'}`;
}

function waitForMapBox(
  el: HTMLElement,
  isCancelled: () => boolean,
): Promise<boolean> {
  const sized = () => el.clientWidth >= 32 && el.clientHeight >= 32;
  if (sized()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      ro.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(maxWait);
      resolve(ok);
    };
    const ro = new ResizeObserver(() => {
      if (isCancelled()) finish(false);
      else if (sized()) finish(true);
    });
    ro.observe(el);
    const poll = window.setInterval(() => {
      if (isCancelled()) finish(false);
      else if (sized()) finish(true);
    }, 50);
    const maxWait = window.setTimeout(() => finish(sized()), 4000);
  });
}

function attachBasemap(
  Leaflet: typeof L,
  map: L.Map,
  mode: BasemapMode,
  dark: boolean,
  tileLayerRef: React.MutableRefObject<L.TileLayer | null>,
  fallbackCleanupRef: React.MutableRefObject<(() => void) | null>,
): void {
  fallbackCleanupRef.current?.();
  fallbackCleanupRef.current = null;
  if (tileLayerRef.current) {
    try {
      map.removeLayer(tileLayerRef.current);
    } catch {
      /* noop */
    }
    tileLayerRef.current = null;
  }

  if (mode === 'satellite') {
    tileLayerRef.current = Leaflet.tileLayer(TILE_URLS.satellite, {
      attribution: TILE_ATTRIBUTIONS.esri,
      maxZoom: MAX_ZOOM,
    }).addTo(map);
    return;
  }

  const { url, ...opts } = rasterTileLayerOptions(dark);
  const rasterLayer = Leaflet.tileLayer(url, opts);
  const swapToEsri = () => {
    if (tileLayerRef.current !== rasterLayer) return;
    try {
      map.removeLayer(rasterLayer);
    } catch {
      /* noop */
    }
    const esri = getEsriRasterBasemap(dark);
    tileLayerRef.current = Leaflet.tileLayer(esri.url, {
      attribution: esri.attribution,
      maxZoom: MAX_ZOOM,
    }).addTo(map);
  };
  fallbackCleanupRef.current = bindRasterTileFallback(rasterLayer, swapToEsri);
  tileLayerRef.current = rasterLayer.addTo(map);
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
  const buoyLayerRef = useRef<L.LayerGroup | null>(null);
  const markersCacheRef = useRef<Map<string, L.Marker>>(new Map());
  const mountedRef = useRef(true);
  const tileSignatureRef = useRef<string | null>(null);
  const tileFallbackCleanupRef = useRef<(() => void) | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [clusterReady, setClusterReady] = useState(false);
  const [isDark, setIsDark] = useState(readIsDark);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>(readBasemapPref);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  // Mounted tracking
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
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

    let cancelled = false;
    const container = containerRef.current;
    const initialBasemap = basemapMode;
    const initialDark = isDark;
    // Shared with teardown so Strict Mode never calls remove() on a map whose
    // container was already reused (that left iOS Safari with a grey canvas).
    let created: L.Map | null = null;

    const teardownMap = () => {
      if (created) {
        try {
          created.remove();
        } catch {
          /* noop */
        }
        created = null;
      }
      mapInstanceRef.current = null;
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
      coastalLayerRef.current = null;
      buoyLayerRef.current = null;
      clusterGroupRef.current = null;
      markersGroupRef.current = null;
      tileLayerRef.current = null;
      tileSignatureRef.current = null;
      tileFallbackCleanupRef.current?.();
      tileFallbackCleanupRef.current = null;
      LRef.current = null;
      clearLeafletContainer(container);
      if (mountedRef.current) {
        setIsReady(false);
        setClusterReady(false);
      }
    };

    (async () => {
      const mobileInit = window.matchMedia('(max-width: 767px)').matches;

      try {
        await import('leaflet/dist/leaflet.css');
        const leafletMod = await import('leaflet');
        const Leaflet = leafletMod.default;
        if (cancelled || !containerRef.current) return;

        const hasBox = await waitForMapBox(container, () => cancelled);
        if (cancelled || !hasBox) return;

        clearLeafletContainer(container);
        LRef.current = Leaflet;

        const mapOptions = {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          zoomControl: false,
          attributionControl: false,
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
        };
        try {
          created = Leaflet.map(container, mapOptions);
        } catch {
          clearLeafletContainer(container);
          created = Leaflet.map(container, mapOptions);
        }
        mapInstanceRef.current = created;
        created.invalidateSize({ animate: false });

        if (cancelled) return;

        attachBasemap(Leaflet, created, initialBasemap, initialDark, tileLayerRef, tileFallbackCleanupRef);
        tileSignatureRef.current = tileSignature(initialBasemap, initialDark);

        if (!isHeroEmbed) Leaflet.control.zoom({ position: 'bottomright' }).addTo(created);

        Leaflet.control
          .attribution({ position: 'bottomleft', prefix: false })
          .addAttribution(OPEN_METEO_ATTRIBUTION)
          .addTo(created);

        if (mountedRef.current) setIsReady(true);
        created.invalidateSize({ animate: false });
        if (typeof window !== 'undefined' && (window as any).__RADAR_TEST__) {
          (window as any).__RADAR_MAP__ = created;
        }

        await Promise.all([
          import('leaflet.markercluster/dist/MarkerCluster.css'),
          import('leaflet.markercluster/dist/MarkerCluster.Default.css'),
          import('leaflet.markercluster'),
        ]);
        if (cancelled || !created) return;

        const mcg = Leaflet.markerClusterGroup({
          ...CLUSTER_CONFIG,
          ...(mobileInit ? { chunkInterval: 200, chunkDelay: 80, maxClusterRadius: 72 } : {}),
          iconCreateFunction: createClusterIconFunction(Leaflet, { simple: mobileInit }),
        });
        const lg = Leaflet.layerGroup();
        clusterGroupRef.current = mcg;
        markersGroupRef.current = lg;
        created.addLayer(mcg);
        if (!cancelled && mountedRef.current) setClusterReady(true);
      } catch {
        if (!cancelled) teardownMap();
      }
    })();

    return () => {
      cancelled = true;
      teardownMap();
    };
    // basemapMode / isDark are snapshotted for the first tile layer; later
    // changes go through the sync effect (same signature → no second fetch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHeroEmbed, containerRef]);

  // Basemap + theme on Leaflet container
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const el = mapInstanceRef.current.getContainer();
    el.dataset.basemap = basemapMode;
    el.dataset.mapTheme = isDark ? 'dark' : 'light';
  }, [basemapMode, isDark, isReady]);

  // Switch basemap tiles only when mode/theme actually changed
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;
    const map = mapInstanceRef.current;
    const next = tileSignature(basemapMode, isDark);
    if (tileSignatureRef.current === next && tileLayerRef.current) return;

    attachBasemap(Leaflet, map, basemapMode, isDark, tileLayerRef, tileFallbackCleanupRef);
    tileSignatureRef.current = next;
  }, [basemapMode, isDark, isReady]);

  // Handle basemap toggle
  const handleBasemapChange = useCallback((mode: BasemapMode) => {
    setBasemapMode(mode);
    try {
      localStorage.setItem('ventu.map.basemap', mode);
    } catch {
      /* noop */
    }
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
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [isReady, isMobile]);

  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const onResize = () => map.invalidateSize({ animate: false });
    window.addEventListener('resize', onResize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      vv?.removeEventListener('resize', onResize);
    };
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !mapInstanceRef.current || !containerRef.current) return;
    const map = mapInstanceRef.current;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isReady, containerRef]);

  return {
    mapInstanceRef,
    LRef,
    isReady,
    clusterReady,
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
    buoyLayerRef,
    markersCacheRef,
  };
}
