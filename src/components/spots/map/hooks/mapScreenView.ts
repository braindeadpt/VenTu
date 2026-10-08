import type L from 'leaflet';
import type { ScreenView } from '@/lib/seaFieldPaint';

/**
 * Vista do mapa como `ScreenView` (Web Mercator puro): zoom + píxel-mundo do
 * canto superior esquerdo do contentor. É a mesma projecção que o Leaflet usa
 * (EPSG:3857, 256·2^z), por isso o raster, as isolinhas e o recorte vectorial
 * da terra (landClip.ts) caem exactamente onde os tiles desenham a costa.
 */
export function mapScreenView(map: L.Map): ScreenView {
  const size = map.getSize();
  const o = map.containerPointToLayerPoint([0, 0]).add(map.getPixelOrigin());
  return { W: size.x, H: size.y, zoom: map.getZoom(), origin: { x: o.x, y: o.y } };
}

/** Vista em lat/lon com margem (fracção do tamanho) — os mosaicos do recorte a pedir. */
export function mapClipBounds(map: L.Map, pad = 0.1): { south: number; west: number; north: number; east: number } {
  const b = map.getBounds();
  const dl = (b.getNorth() - b.getSouth()) * pad;
  const dw = (b.getEast() - b.getWest()) * pad;
  return { south: b.getSouth() - dl, west: b.getWest() - dw, north: b.getNorth() + dl, east: b.getEast() + dw };
}
