import type { SportType } from './sportRatings';
import { getScoreCssVar, getScoreRgb, SCORE_THRESHOLD_STEPS } from '@/lib/scoreThresholds';

export const TILE_URLS = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
} as const;

export const TILE_ATTRIBUTIONS = {
  carto:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  esri:
    '&copy; <a href="https://www.esri.com/">Esri</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const;

export type RasterBasemap = {
  url: string;
  attribution: string;
  subdomains?: string;
};

/** Carto raster tiles require `?key=` (watermark otherwise). Free key: carto.com/basemaps/apikey */
export function cartoBasemapKey(): string {
  return (process.env.NEXT_PUBLIC_CARTO_API_KEY ?? '').trim();
}

export function getEsriRasterBasemap(isDark: boolean): RasterBasemap {
  return {
    url: isDark
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: TILE_ATTRIBUTIONS.esri,
  };
}

/**
 * Light/dark raster basemap for Leaflet.
 * With NEXT_PUBLIC_CARTO_API_KEY → original Carto dark/light tiles.
 * Without it → Esri World Canvas (already allowed by CSP; no watermark).
 *
 * Carto `{r}` (`@2x`) is omitted: retina suffixes 404/fail with the free key
 * and leave Leaflet on the grey empty canvas.
 */
export function getMapRasterBasemap(isDark: boolean): RasterBasemap {
  const key = cartoBasemapKey();
  if (key) {
    const style = isDark ? 'dark_all' : 'light_all';
    return {
      url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
      attribution: TILE_ATTRIBUTIONS.carto,
      subdomains: 'abcd',
    };
  }
  return getEsriRasterBasemap(isDark);
}

/** Watchdog do Carto primário: só troca para Esri quando nada carregou E nada
 *  respondeu durante CARTO_TILE_HANG_MS. Uma ligação lenta mas viva (primeiro
 *  tile depois de 3.5s) NÃO deve ser rasgada a meio do carregamento. */
export const CARTO_TILE_FALLBACK_MS = 3500;
export const CARTO_TILE_HANG_MS = 8000;

export type BasemapLoadState = 'loading' | 'ok' | 'failed';

/**
 * Watch a tile layer and report its load state:
 *  - 'ok'     after the FIRST tileload — one painted tile makes the layer
 *             usable, so later per-tile errors are ignored (healthy layer);
 *  - 'failed' when no tile ever painted: the first tileerror with zero
 *             loaded tiles, or the hang timer firing with zero loaded (all
 *             requests stalled — throttled/CDN down, nothing in flight).
 * Returns a dispose that unsubscribes and silences the timer.
 */
export function watchTileLayer(
  layer: {
    on: (type: string, fn: () => void) => void;
    off?: (type: string, fn: () => void) => void;
  },
  onState: (state: BasemapLoadState) => void,
  hangMs = CARTO_TILE_FALLBACK_MS,
): () => void {
  let loaded = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const emit = (state: BasemapLoadState) => {
    if (settled) return;
    settled = true;
    if (timer != null) clearTimeout(timer);
    timer = null;
    onState(state);
  };
  const onTileLoad = () => {
    if (loaded) return;
    loaded = true;
    emit('ok');
  };
  const onTileError = () => {
    if (loaded) return;
    emit('failed');
  };
  layer.on('tileload', onTileLoad);
  layer.on('tileerror', onTileError);
  timer = setTimeout(() => {
    timer = null;
    if (!loaded) emit('failed');
  }, hangMs);
  return () => {
    settled = true;
    if (timer != null) clearTimeout(timer);
    layer.off?.('tileload', onTileLoad);
    layer.off?.('tileerror', onTileError);
  };
}

/** Primeiro tileerror Carto (ou stall total) → troca para Esri: o mapa nunca fica em branco. */
export function bindRasterTileFallback(
  layer: {
    on: (type: string, fn: () => void) => void;
    off?: (type: string, fn: () => void) => void;
  },
  swapToEsri: () => void,
): () => void {
  if (!cartoBasemapKey()) return () => {};
  return watchTileLayer(layer, (state) => {
    if (state === 'failed') swapToEsri();
  });
}

// Cadeia de atribuição obrigatória do Open-Meteo (CC BY 4.0) — fonte única em
// openMeteoAttribution.ts, re-exportada aqui para o controlo de atribuição do
// Leaflet (string HTML) não duplicar as URLs/texto do About/fontes/radar.
export { OPEN_METEO_ATTRIBUTION_HTML as OPEN_METEO_ATTRIBUTION } from './openMeteoAttribution';

export const DEFAULT_CENTER: [number, number] = [39.5, -8.0];
export const DEFAULT_ZOOM = 6;
/** Zoom da «região do spot» nos deep links de imersão (?radar=1&lat=&lon=):
 *  mostra a costa local à volta do spot de origem (o DEFAULT_ZOOM=6 é o país
 *  inteiro; 10 é a região — o mesmo teto do fitBounds dos avisos costeiros). */
export const SPOT_REGION_ZOOM = 10;
export const MAX_ZOOM = 19;

export function rasterTileLayerOptions(isDark: boolean): RasterBasemap & { maxZoom: number } {
  const basemap = getMapRasterBasemap(isDark);
  return { ...basemap, maxZoom: MAX_ZOOM };
}

export const MAP_CLUSTER_LS_KEY = 'ventu.map.cluster';
export const MAP_WIND_LS_KEY = 'ventu.map.wind';
export const MAP_ONLY_ON_LS_KEY = 'ventu.map.onlyOn';
export const MAP_ISOBATHS_LS_KEY = 'ventu.map.isobaths';
export const MAP_COASTAL_LS_KEY = 'ventu.map.coastalWarnings';
export const MAP_BUOYS_LS_KEY = 'ventu.map.buoys';
export const MAP_HS_LS_KEY = 'ventu.map.hs';
export const MAP_CURRENTS_LS_KEY = 'ventu.map.currents';

export const CLUSTER_CONFIG = {
  chunkedLoading: true,
  chunkInterval: 100,
  chunkDelay: 50,
  maxClusterRadius: 60,
  spiderfyOnMaxZoom: true,
  zoomToBoundsOnClick: true,
  showCoverageOnHover: false,
} as const;

/** @deprecated Use SCORE_THRESHOLD_STEPS from scoreThresholds */
export const SCORE_THRESHOLDS = SCORE_THRESHOLD_STEPS;

export function getScoreThreshold(score: number): { min: number; cssVar: string } {
  for (const t of SCORE_THRESHOLD_STEPS) {
    if (score >= t.min) return t;
  }
  return SCORE_THRESHOLD_STEPS[SCORE_THRESHOLD_STEPS.length - 1];
}

export { getScoreRgb, getScoreCssVar };

export const SPORT_CSS_VARS: Record<SportType, string> = {
  surf: '--sport-surf',
  bodyboard: '--sport-bodyboard',
  kitesurf: '--sport-kitesurf',
  windsurf: '--sport-windsurf',
  foil: '--sport-foil',
  sup: '--sport-sup',
  wakeboard: '--sport-wakeboard',
};

export function getSportRgb(sport: SportType): string {
  return `rgb(var(${SPORT_CSS_VARS[sport]}))`;
}

const LEGEND_SCALE_PT = [
  { label: 'Fechado', color: 'rgb(var(--score-closed))' },
  { label: 'Fraco', color: 'rgb(var(--score-poor))' },
  { label: 'Razoável', color: 'rgb(var(--score-fair))' },
  { label: 'Bom', color: 'rgb(var(--score-good))' },
  { label: 'Épico', color: 'rgb(var(--score-epic))' },
];

const LEGEND_SCALE_EN = [
  { label: 'Closed', color: 'rgb(var(--score-closed))' },
  { label: 'Poor', color: 'rgb(var(--score-poor))' },
  { label: 'Fair', color: 'rgb(var(--score-fair))' },
  { label: 'Good', color: 'rgb(var(--score-good))' },
  { label: 'Epic', color: 'rgb(var(--score-epic))' },
];

export function getLegendLabels(locale: string): { label: string; color: string }[] {
  return locale === 'pt' ? LEGEND_SCALE_PT : LEGEND_SCALE_EN;
}
