'use client';

import { startTransition, useEffect, useRef, useState, useCallback } from 'react';
import type L from 'leaflet';

import { guardLeafletCanvas } from '@/components/spots/map/leafletCanvasGuard';
import { sweepOverlaysBeforeMapRemove } from '@/components/spots/map/mapOverlaySweep';
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
  cartoBasemapKey,
  watchTileLayer,
  CARTO_TILE_HANG_MS,
  type BasemapLoadState,
} from '@/lib/map-constants';
import { createClusterIconFunction } from '@/components/spots/MapClusterIcon';
import { applyExploreMapFit, exploreFitPadding, resolveExploreChrome } from '@/components/spots/mapMarkers';
import {
  MAP_AREA_BOUNDS,
  MAP_BASEMAP_EVENT,
  MAP_FIT_AREA_EVENT,
  isMapAreaKey,
} from '@/lib/mapLayerBus';

interface UseMapCoreOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isHeroEmbed: boolean;
  /** Idioma do nome acessivel dos clusters (role="button" precisa de nome). */
  locale?: string;
  /**
   * Bounds da vista «Explorar» calculados das coords dos spots (dados
   * estáticos). Com eles o mapa nasce já enquadrado — o basemap é anexado
   * na vista final e não pede (nem aborta) tiles do zoom default.
   * Ignorado no hero (o fit próprio vive no SpotMapInteractive).
   */
  initialViewBounds?: [[number, number], [number, number]] | null;
  /**
   * O mapa nasce em ecrã inteiro com o sheet (mobile) ou o painel (desktop)
   * do modo Explorar por cima — o enquadramento inicial desconta-os.
   */
  exploreChrome?: { enabled: boolean; panelCollapsed: boolean };
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
  /** Estado de carregamento dos tiles do basemap ('loading' | 'ok' | 'failed'). */
  tileState: BasemapLoadState;
  /** Re-anexa o basemap actual — usado pelo botão «Atualizar» do estado failed. */
  retryBasemap: () => void;
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

/**
 * M7-F: cede a main thread entre as peças do init — cada segmento fica
 * num task próprio (<50 ms → fora do TBT) em vez de uma cadeia síncrona.
 */
const yieldToMain = () => new Promise<void>((r) => window.setTimeout(r, 0));

/** requestIdleCallback com fallback setTimeout (Safari <15 / iframes). */
function onIdle(cb: () => void, timeoutMs = 1200): void {
  const ric = window.requestIdleCallback;
  if (typeof ric === 'function') ric(cb, { timeout: timeoutMs });
  else window.setTimeout(cb, 1);
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
  onTileState: (state: BasemapLoadState) => void,
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
  onTileState('loading');

  const watch = (layer: L.TileLayer, onFail?: () => void, hangMs?: number) => {
    fallbackCleanupRef.current = watchTileLayer(layer, (state) => {
      if (state === 'ok') onTileState('ok');
      else onFail?.();
    }, hangMs);
  };

  // CORRECCOES-24SET (M5 — gate «pan ≤ 50 ms» a 4× CPU): `updateWhenIdle`
  // adia o pedido/decode de tiles novos para o fim do gesto — a M4 mediu o
  // raster dos tiles como residual de long tasks no pan (idêntico com o
  // vento desligado). Durante o arraste a faixa recém-exposta fica vazia
  // até ao release — o comportamento que o Leaflet já aplica por defeito
  // no mobile, estendido ao desktop pela mesma razão de performance.
  const tilePerf = { updateWhenIdle: true } as const;
  if (mode === 'satellite') {
    const layer = Leaflet.tileLayer(TILE_URLS.satellite, {
      attribution: TILE_ATTRIBUTIONS.esri,
      maxZoom: MAX_ZOOM,
      ...tilePerf,
    });
    tileLayerRef.current = layer;
    // Subscribe BEFORE addTo: Leaflet fires tileloadstart synchronously during
    // addTo, and the watchdog counts requested tiles — attaching after would
    // miss the initial batch and skew the all-errored verdict.
    watch(layer, () => onTileState('failed'));
    layer.addTo(map);
    return;
  }

  const { url, ...opts } = rasterTileLayerOptions(dark);
  const rasterLayer = Leaflet.tileLayer(url, { ...opts, ...tilePerf });
  const swapToEsri = () => {
    if (tileLayerRef.current !== rasterLayer) return;
    try {
      map.removeLayer(rasterLayer);
    } catch {
      /* noop */
    }
    const esri = getEsriRasterBasemap(dark);
    const esriLayer = Leaflet.tileLayer(esri.url, {
      attribution: esri.attribution,
      maxZoom: MAX_ZOOM,
      ...tilePerf,
    });
    tileLayerRef.current = esriLayer;
    watch(esriLayer, () => onTileState('failed'));
    esriLayer.addTo(map);
  };
  tileLayerRef.current = rasterLayer;
  if (cartoBasemapKey()) {
    // Carto é o primário; troca para Esri apenas numa falha definitiva
    // (todos os tiles pedidos falharam, ou stall total em CARTO_TILE_HANG_MS).
    // Uma ligação lenta mas viva não é rasgada a meio do carregamento.
    watch(rasterLayer, swapToEsri, CARTO_TILE_HANG_MS);
  } else {
    // Sem key o raster já é Esri — uma falha definitiva é o estado final
    // ('failed'), que o UI expõe com o botão de retry.
    watch(rasterLayer, () => onTileState('failed'));
  }
  rasterLayer.addTo(map);
}

export function useMapCore({ containerRef, isHeroEmbed, locale = 'pt', initialViewBounds = null, exploreChrome }: UseMapCoreOptions): UseMapCoreReturn {
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
  const [tileState, setTileState] = useState<BasemapLoadState>('loading');
  const [isDark, setIsDark] = useState(readIsDark);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>(readBasemapPref);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  // Espelhos em refs: as callbacks estáveis (handleTileState / auto-recover)
  // usam sempre o modo/tema mais recentes sem se re-criarem.
  const basemapModeRef = useRef<BasemapMode>(basemapMode);
  const isDarkRef = useRef(isDark);
  useEffect(() => {
    basemapModeRef.current = basemapMode;
    isDarkRef.current = isDark;
  });

  // Recuperação automática do basemap. O watchdog declara 'failed' quando
  // nenhum tile pintou (stall ou rajada de tileerrors — reset de ligação,
  // QUIC/HTTP3 a cair, glitch do CDN). Sem isto, uma falha transitória deixa
  // o mapa cinzento com «Não foi possível carregar o mapa» até o utilizador
  // clicar em «Atualizar». Com isto, o basemap é re-anexado em segundo plano
  // (limitado e espaçado), mantendo a UI de erro visível até um tile pintar —
  // aí volta a 'ok' e a mensagem desaparece sozinha. Esgotadas as 4 tentativas
  // rápidas, entra um batimento cardíaco lento (60s, indefinido): uma falha
  // que sobreviva ao ciclo rápido é uma indisponibilidade real, e o mapa tem
  // de se auto-curar quando ela passa — nunca ficar num beco sem saída que
  // só um reload resolve.
  const AUTO_RECOVER_ATTEMPTS = 4;
  const AUTO_RECOVER_INTERVAL_MS = 15_000;
  const AUTO_RECOVER_SLOW_MS = 60_000;
  const autoRecoverRef = useRef<{ attempts: number }>({ attempts: 0 });
  const [autoRecoverTick, setAutoRecoverTick] = useState(0);

  useEffect(() => {
    if (tileState !== 'failed') return;
    const exhausted = autoRecoverRef.current.attempts >= AUTO_RECOVER_ATTEMPTS;
    const timer = setTimeout(() => {
      // Conta apenas re-anexos reais: o incremento vive aqui, dentro do
      // setTimeout, não no corpo do efeito — uma re-corrida do efeito (nova
      // tentativa agendada) não deve gastar uma tentativa sem tentar nada.
      autoRecoverRef.current.attempts += 1;
      const Leaflet = LRef.current;
      const map = mapInstanceRef.current;
      if (!Leaflet || !map) return;
      // Re-anexa em silêncio: a UI de erro ('failed') permanece até um tile
      // pintar; os estados intermédios ('loading') são ignorados.
      const onSilent = (state: BasemapLoadState) => {
        if (state === 'ok') {
          autoRecoverRef.current.attempts = 0;
          setTileState('ok');
        } else if (state === 'failed') {
          setAutoRecoverTick((t) => t + 1); // nova tentativa limitada
        }
      };
      attachBasemap(Leaflet, map, basemapModeRef.current, isDarkRef.current, tileLayerRef, tileFallbackCleanupRef, onSilent);
      tileSignatureRef.current = tileSignature(basemapModeRef.current, isDarkRef.current);
    }, exhausted ? AUTO_RECOVER_SLOW_MS : AUTO_RECOVER_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [tileState, autoRecoverTick, tileLayerRef, tileFallbackCleanupRef]);

  // Rede de volta durante um 'failed' → ciclo de recuperação fresco e
  // imediato. O bump do tick re-corre o efeito acima, limpando qualquer
  // timer pendente (rápido ou lento) sem dupla re-anexação.
  useEffect(() => {
    if (tileState !== 'failed') return;
    const onOnline = () => {
      autoRecoverRef.current.attempts = 0;
      setAutoRecoverTick((t) => t + 1);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [tileState]);

  const stopAutoRecover = useCallback(() => {
    autoRecoverRef.current.attempts = 0;
  }, []);

  // Encaminha os estados do watchdog; 'failed' arma a recuperação automática
  // (limitada) mantendo a UI de erro até um tile pintar.
  // CORRECCOES-24SET (M5 — gate «pan ≤ 50 ms»): o estado dos tiles chega
  // frequentemente a meio de um pan (com updateWhenIdle o 1º carregamento
  // cai no moveend); o re-render síncrono media ~128 ms a 4× CPU. É uma
  // actualização não-urgente — startTransition deixa o React fatiá-la.
  const handleTileState = useCallback((state: BasemapLoadState) => {
    if (state === 'ok') {
      stopAutoRecover();
      startTransition(() => setTileState('ok'));
      return;
    }
    startTransition(() => setTileState(state));
  }, [stopAutoRecover]);


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
          sweepOverlaysBeforeMapRemove(created, (layer) => {
            const LActive = LRef.current;
            return !!LActive && layer instanceof LActive.Renderer;
          });
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
      stopAutoRecover();
      LRef.current = null;
      delete container.dataset.mapSettled;
      clearLeafletContainer(container);
      if (mountedRef.current) {
        setIsReady(false);
        setClusterReady(false);
      }
    };

    (async () => {
      const mobileInit = window.matchMedia('(max-width: 767px)').matches;

      try {
        const [leafletMod] = await Promise.all([
          import('leaflet'),
          import('leaflet/dist/leaflet.css'),
        ]);
        const Leaflet = leafletMod.default;
        if (cancelled || !containerRef.current) return;

        const hasBox = await waitForMapBox(container, () => cancelled);
        if (cancelled || !hasBox) return;

        clearLeafletContainer(container);
        LRef.current = Leaflet;
        guardLeafletCanvas(Leaflet);

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
        // Sinal «mapa parado» para e2e: reposto no moveend e retirado no
        // movestart, por isso cobre fits e flyTos animados — um clique num
        // marcador a meio de uma animação acerta na posição errada ou num
        // elemento já detached.
        created.on('movestart', () => delete container.dataset.mapSettled);
        created.on('moveend', () => {
          container.dataset.mapSettled = 'true';
        });
        container.dataset.mapSettled = 'true';
        created.invalidateSize({ animate: false });

        if (cancelled) return;
        // M7-F: init em pedaços — a criação + invalidateSize fecham um task;
        // a atribuição/fit/basemap correm no seguinte.
        await yieldToMain();
        if (cancelled) return;

        // O AttributionControl tem de existir ANTES de qualquer layer entrar
        // no mapa: o Leaflet só liga a remoção do crédito ao evento 'remove'
        // para layers que chegam por 'layeradd' com o controlo já presente.
        // Um layer anexado antes do controlo é contado no sweep inicial mas
        // fica sem o listener — ao ser removido o crédito fica pendurado
        // (era o «OpenStreetMap contributors»×2 depois do fallback
        // Carto→Esri ou da troca para satélite).
        Leaflet.control
          .attribution({ position: 'bottomleft', prefix: false })
          .addAttribution(OPEN_METEO_ATTRIBUTION)
          .addTo(created);

        // Nasce enquadrado: os bounds «Explorar» vêm das coords dos spots
        // (dados estáticos), por isso o fit corre antes de anexar o basemap
        // — os tiles pedidos são já os da vista final e não os do zoom
        // default que seriam abortados a seguir.
        // Ownership M5 (map-v3): enquadramento inicial / fit — ver
        // docs/design/MAP-ZONES.md.
        if (!isHeroEmbed && initialViewBounds) {
          applyExploreMapFit(
            Leaflet,
            created,
            initialViewBounds,
            mobileInit,
            resolveExploreChrome(
              exploreChrome?.enabled ?? false,
              mobileInit,
              exploreChrome?.panelCollapsed ?? false,
            ),
          );
        }

        attachBasemap(Leaflet, created, initialBasemap, initialDark, tileLayerRef, tileFallbackCleanupRef, handleTileState);
        tileSignatureRef.current = tileSignature(initialBasemap, initialDark);

        // Top-left, NOT bottom-right: the /mapa explore HUD (and the spots
        // page's bottom chrome) covers the bottom corners, which left the zoom
        // buttons rendered but unclickable under the HUD card. Top-left is
        // free on every host (layer toggle lives top-right).
        if (!isHeroEmbed) Leaflet.control.zoom({ position: 'topleft' }).addTo(created);

        if (mountedRef.current) setIsReady(true);
        created.invalidateSize({ animate: false });
        if (typeof window !== 'undefined' && (window as any).__RADAR_TEST__) {
          (window as any).__RADAR_MAP__ = created;
        }
        if (typeof window !== 'undefined') {
          try {
            if (localStorage.getItem('ventu.mapdebug') === '1') {
              (window as any).__VENTU_MAP__ = created;
            }
          } catch { /* noop */ }
        }

        // Ownership M4 (map-v3): criação e opções do markercluster — ver
        // docs/design/MAP-ZONES.md.
        markersGroupRef.current = Leaflet.layerGroup();
        // M7-F (TBT /pt/mapa/): no modo Explorar o markercluster NUNCA entra
        // no mapa — os marcadores vivem no LayerGroup e a colocação é o LOD
        // por colisão (useMapMarkers). O trace mostrava ~110 ms de eval do
        // chunk do plugin + construção do grupo num único task >50 ms no
        // arranque; aqui o módulo deixa de ser carregado e o ref fica com
        // um LayerGroup inerte que cumpre o contrato do caminho Explorar
        // (hasLayer/removeLayer/clearLayers/on/off — nunca addLayers nem
        // zoomToShowLayer, que só correm fora do Explorar).
        const exploreInit = !isHeroEmbed && (exploreChrome?.enabled ?? false);
        if (exploreInit) {
          clusterGroupRef.current =
            Leaflet.layerGroup() as unknown as L.MarkerClusterGroup;
          if (!cancelled && mountedRef.current) setClusterReady(true);
        } else {
          // Embeds/hero: o plugin continua a ser preciso, mas o eval +
          // construção vão para idle — não são precisos para o 1º frame.
          onIdle(() => {
            void (async () => {
              try {
                await Promise.all([
                  import('leaflet.markercluster/dist/MarkerCluster.css'),
                  import('leaflet.markercluster/dist/MarkerCluster.Default.css'),
                  import('leaflet.markercluster'),
                ]);
                if (cancelled || !created) return;

                const mcg = Leaflet.markerClusterGroup({
                  ...CLUSTER_CONFIG,
                  // UX v3 (M4): raio de agrupamento da maquete — 40 px
                  // desktop / 52 px mobile (o LOD por colisão do modo
                  // Explorar usa os mesmos valores abaixo de z8.5). Só se
                  // aplica a hero/embeds: no Explorar o markercluster
                  // nunca entra no mapa.
                  maxClusterRadius: mobileInit ? 52 : 40,
                  // Hero embed: o mapa não tem navegação (drag/zoom off) —
                  // um cluster que faz zoomToBounds prende o utilizador
                  // nessa vista sem saída. O clique é capturado pelo
                  // SpotMapInteractive e navega para /mapa/.
                  ...(isHeroEmbed ? { zoomToBoundsOnClick: false, spiderfyOnMaxZoom: false } : {}),
                  ...(mobileInit ? { chunkInterval: 200, chunkDelay: 80 } : {}),
                  iconCreateFunction: createClusterIconFunction(Leaflet, { simple: mobileInit, locale }),
                });
                clusterGroupRef.current = mcg;
                created.addLayer(mcg);
                if (!cancelled && mountedRef.current) setClusterReady(true);
              } catch {
                if (!cancelled) teardownMap();
              }
            })();
          });
        }
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

  // Basemap + theme + tile state on Leaflet container
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const el = mapInstanceRef.current.getContainer();
    el.dataset.basemap = basemapMode;
    el.dataset.mapTheme = isDark ? 'dark' : 'light';
    el.dataset.mapTiles = tileState;
  }, [basemapMode, isDark, tileState, isReady]);

  // Switch basemap tiles only when mode/theme actually changed
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current) return;
    const Leaflet = LRef.current;
    if (!Leaflet) return;
    const map = mapInstanceRef.current;
    const next = tileSignature(basemapMode, isDark);
    if (tileSignatureRef.current === next && tileLayerRef.current) return;

    stopAutoRecover();
    attachBasemap(Leaflet, map, basemapMode, isDark, tileLayerRef, tileFallbackCleanupRef, handleTileState);
    tileSignatureRef.current = next;
  }, [basemapMode, isDark, isReady, handleTileState, stopAutoRecover]);

  // Handle basemap toggle
  const handleBasemapChange = useCallback((mode: BasemapMode) => {
    setBasemapMode(mode);
    try {
      localStorage.setItem('ventu.map.basemap', mode);
    } catch {
      /* noop */
    }
  }, []);

  // Re-tenta o basemap actual depois de uma falha (botão «Atualizar» do UI).
  const retryBasemap = useCallback(() => {
    const Leaflet = LRef.current;
    const map = mapInstanceRef.current;
    if (!Leaflet || !map) return;
    stopAutoRecover();
    attachBasemap(Leaflet, map, basemapMode, isDark, tileLayerRef, tileFallbackCleanupRef, handleTileState);
    tileSignatureRef.current = tileSignature(basemapMode, isDark);
  }, [basemapMode, isDark, mapInstanceRef, LRef, tileLayerRef, tileFallbackCleanupRef, handleTileState, stopAutoRecover]);

  // Ownership M5 (map-v3): ponte de eventos das camadas — docs/design/MAP-ZONES.md.
  //
  // O menu Camadas (§8) e os chips de ilha (§10) vivem fora da árvore de props
  // deste hook (o menu é portal da MapControls; os chips são da M3). Para não
  // duplicarem estado disparam CustomEvents em `window` — o estado continua a
  // viver só aqui:
  //   - 'ventu:map-basemap'  → handleBasemapChange (modo + localStorage)
  //   - 'ventu:map-fit-area' → enquadra continente/Açores/Madeira com o padding
  //     da moldura activa (painel/sheet), o mesmo do fit inicial. flyToBounds
  //     de 600 ms (maquete: flyTo easeOutCubic) ou fitBounds instantâneo com
  //     prefers-reduced-motion.
  const fitAreaContextRef = useRef({ enabled: false, panelCollapsed: false, isMobile: false });
  useEffect(() => {
    fitAreaContextRef.current = {
      enabled: exploreChrome?.enabled ?? false,
      panelCollapsed: exploreChrome?.panelCollapsed ?? false,
      isMobile,
    };
  });

  useEffect(() => {
    const onBasemap = (e: Event) => {
      const mode = (e as CustomEvent<BasemapMode>).detail;
      if (mode === 'map' || mode === 'satellite') handleBasemapChange(mode);
    };

    const onFitArea = (e: Event) => {
      const key = (e as CustomEvent<unknown>).detail;
      if (!isMapAreaKey(key)) return;
      const b = MAP_AREA_BOUNDS[key];
      const Leaflet = LRef.current;
      const map = mapInstanceRef.current;
      if (!Leaflet || !map) return;

      const { enabled, panelCollapsed, isMobile: mobileNow } = fitAreaContextRef.current;
      const chrome = resolveExploreChrome(enabled, mobileNow, panelCollapsed);
      const pad = exploreFitPadding(chrome, mobileNow);
      const bounds = Leaflet.latLngBounds(
        [b.south, b.west],
        [b.north, b.east],
      );
      const options = {
        paddingTopLeft: Leaflet.point(...pad.topLeft),
        paddingBottomRight: Leaflet.point(...pad.bottomRight),
        maxZoom: mobileNow ? 9 : 11,
      };
      // Mesmo bias para oeste de applyExploreMapFit — mete a costa à direita
      // e abre o Atlântico à esquerda (é de lá que vem o swell).
      const shiftWest = () => {
        if (!pad.westShift || !mapInstanceRef.current) return;
        const degPerPx = 360 / (256 * 2 ** map.getZoom());
        const shiftPx = map.getZoom() >= 7 ? 140 : 70;
        const c = map.getCenter();
        map.setView([c.lat, c.lng - shiftPx * degPerPx], map.getZoom(), { animate: false });
      };

      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        map.fitBounds(bounds, { ...options, animate: false });
        shiftWest();
      } else {
        map.flyToBounds(bounds, { ...options, duration: 0.6 });
        map.once('moveend', shiftWest);
      }
    };

    window.addEventListener(MAP_BASEMAP_EVENT, onBasemap);
    window.addEventListener(MAP_FIT_AREA_EVENT, onFitArea);
    return () => {
      window.removeEventListener(MAP_BASEMAP_EVENT, onBasemap);
      window.removeEventListener(MAP_FIT_AREA_EVENT, onFitArea);
    };
  }, [handleBasemapChange]);

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
    tileState,
    retryBasemap,
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
