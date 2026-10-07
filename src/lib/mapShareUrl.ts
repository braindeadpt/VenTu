import type { GridSportFilter } from '@/lib/sportRatings';
import type { BasemapMode } from '@/components/spots/MapLayerToggle';
import { DEFAULT_REGION } from '@/lib/gridFilters';

/**
 * URL partilhável do /mapa — o contrato inverso de `readMapSearchParams`
 * (MapaFullscreenClient): centro a 3 casas, zoom, desporto, região,
 * basemap e camadas ligadas. Nunca inclui a posição do utilizador — só o
 * centro actual da vista.
 */
export interface MapShareLayers {
  radar?: boolean;
  hours?: boolean;
  buoys?: boolean;
  hs?: boolean;
  sst?: boolean;
  currents?: boolean;
  /** Camada «Ondulação» (grelha de modelo). */
  swell?: boolean;
  wind?: boolean;
  nauticalChart?: boolean;
  goesIr?: boolean;
  storms?: boolean;
  warnAreas?: boolean;
  coastalWarnings?: boolean;
}

export interface MapShareView {
  center: [number, number];
  zoom?: number;
  sport: GridSportFilter;
  region?: string;
  layers?: MapShareLayers;
  /** 'satellite' partilha o basemap de satélite; ausente = «mapa». */
  basemap?: BasemapMode;
}

export function buildMapShareSearch(view: MapShareView): string {
  const params = new URLSearchParams();
  params.set('lat', view.center[0].toFixed(3));
  params.set('lon', view.center[1].toFixed(3));
  if (view.zoom != null && Number.isFinite(view.zoom)) {
    params.set('z', String(Math.round(view.zoom * 10) / 10));
  }
  params.set('sport', view.sport);
  if (view.region && view.region !== DEFAULT_REGION) {
    params.set('region', view.region);
  }
  for (const key of [
    'radar', 'hours', 'buoys', 'hs', 'sst', 'currents', 'swell',
    'wind', 'nauticalChart', 'goesIr',
    'storms', 'warnAreas', 'coastalWarnings',
  ] as const) {
    if (view.layers?.[key]) params.set(key, '1');
  }
  if (view.basemap === 'satellite') params.set('basemap', 'sat');
  return `?${params.toString()}`;
}

/** `base` sem query — ex. `${origin}/pt/mapa/`. */
export function buildMapShareUrl(base: string, view: MapShareView): string {
  return `${base}${buildMapShareSearch(view)}`;
}

/**
 * Liga/desliga um param de camada (`key=1`) por cima da query EXISTENTE —
 * os outros params (sport, region, lat/lon/z, t, outras camadas) ficam.
 */
export function mergeMapLayerParam(currentSearch: string, key: string, on: boolean): string {
  const params = new URLSearchParams(currentSearch);
  if (on) params.set(key, '1');
  else params.delete(key);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** `replaceState` do param de camada no URL actual (sem nova entrada no histórico). */
export function setMapLayerUrlParam(key: string, on: boolean): void {
  if (typeof window === 'undefined') return;
  const search = mergeMapLayerParam(window.location.search, key, on);
  if (search === window.location.search || (search === '' && window.location.search === '')) return;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`);
}
