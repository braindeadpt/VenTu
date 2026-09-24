/** Barramento leve de camadas (map-v3 §8/§10).
 *
 *  O mapa tem um único dono de estado (useMapCore / hooks de camadas); para o
 *  menu Camadas da M5 e os chips de área da M3 conseguirem PEDIR mudanças sem
 *  duplicar estado nem depender de props através de zonas de outros owners,
 *  usamos CustomEvents em `window` como fronteira explícita:
 *
 *    - `ventu:map-basemap`  { detail: 'map' | 'satellite' } → useMapCore aplica
 *    - `ventu:map-fit-area` { detail: 'continent' | 'azores' | 'madeira' }
 *        → useMapCore enquadra com padding da moldura (§10)
 *    - `ventu:map-raster-off` { detail: { key } } → emitido pelo cap de raster;
 *        a MapLayersZone mostra o toast localizado (§8)
 *
 *  O estado nunca vive nos emissores: o leitor real (data-basemap no
 *  container Leaflet) é a fonte da verdade. */

import type { BasemapMode } from '@/components/spots/MapLayerToggle';

export const MAP_BASEMAP_EVENT = 'ventu:map-basemap';
export const MAP_FIT_AREA_EVENT = 'ventu:map-fit-area';
export const MAP_RASTER_OFF_EVENT = 'ventu:map-raster-off';

/* ---------- Enquadramento por área (§10) ---------- */

export type MapAreaKey = 'continent' | 'azores' | 'madeira';

export interface MapAreaBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Bounds das áreas — a maquete usa `cont {s:36.9,n:42.2,w:-9.6,e:-7.3}`;
 *  mantemos os mesmos limites (costa continental completa + folga marítima). */
export const MAP_AREA_BOUNDS: Record<MapAreaKey, MapAreaBounds> = {
  continent: { south: 36.9, west: -9.6, north: 42.2, east: -7.3 },
  azores: { south: 36.8, west: -31.4, north: 39.8, east: -24.9 },
  madeira: { south: 32.5, west: -17.4, north: 33.2, east: -16.2 },
};

export function isMapAreaKey(v: unknown): v is MapAreaKey {
  return v === 'continent' || v === 'azores' || v === 'madeira';
}

/* ---------- Emissores (chamados por qualquer superfície da app) ---------- */

export function requestBasemapChange(mode: BasemapMode) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<BasemapMode>(MAP_BASEMAP_EVENT, { detail: mode }),
  );
}

export function requestMapAreaFit(area: MapAreaKey) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<MapAreaKey>(MAP_FIT_AREA_EVENT, { detail: area }),
  );
}

/* ---------- Limite de raster pesadas (§8) ---------- */

/** Camadas raster pesadas (imagem/tiling de terceiros): máximo 2 activas —
 *  a 3.ª desliga a mais antiga. Hs/SST/correntes são canvas vectoriais e já
 *  têm exclusão mútua, por isso não entram aqui. */
export const MAP_HEAVY_RASTER_KEYS = ['radar', 'bathymetry', 'seamarks'] as const;
export type MapHeavyRasterKey = (typeof MAP_HEAVY_RASTER_KEYS)[number];
export const MAP_HEAVY_RASTER_MAX = 2;

/** Plano puro do cap: dado o estado actual e o pedido, devolve a lista de
 *  pesadas activas resultante e (se houver) a mais antiga a desligar.
 *  `order` = ordem de activação (mais antiga primeiro). */
export function planHeavyRasterEnable(
  order: MapHeavyRasterKey[],
  enabling: MapHeavyRasterKey,
): { order: MapHeavyRasterKey[]; evict?: MapHeavyRasterKey } {
  const active = order.filter((k) => k !== enabling);
  if (active.length < MAP_HEAVY_RASTER_MAX) {
    return { order: [...active, enabling] };
  }
  const evict = active[0];
  return { order: [...active.slice(1), enabling], evict };
}
