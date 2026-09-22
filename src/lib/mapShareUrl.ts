import type { GridSportFilter } from '@/lib/sportRatings';
import { DEFAULT_REGION } from '@/lib/gridFilters';

/**
 * URL partilhável do /mapa — o contrato inverso de `readMapSearchParams`
 * (MapaFullscreenClient): centro a 3 casas, zoom, desporto, região e
 * camadas ligadas. Nunca inclui a posição do utilizador — só o centro
 * actual da vista.
 */
export interface MapShareLayers {
  radar?: boolean;
  isobaths?: boolean;
  hours?: boolean;
  buoys?: boolean;
  hs?: boolean;
  sst?: boolean;
  currents?: boolean;
}

export interface MapShareView {
  center: [number, number];
  zoom?: number;
  sport: GridSportFilter;
  region?: string;
  layers?: MapShareLayers;
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
  for (const key of ['radar', 'isobaths', 'hours', 'buoys', 'hs', 'sst', 'currents'] as const) {
    if (view.layers?.[key]) params.set(key, '1');
  }
  return `?${params.toString()}`;
}

/** `base` sem query — ex. `${origin}/pt/mapa/`. */
export function buildMapShareUrl(base: string, view: MapShareView): string {
  return `${base}${buildMapShareSearch(view)}`;
}
