/**
 * Mapa 3D da praia (#184). Este módulo importa `maplibre-gl` e só é carregado
 * por import dinâmico quando a cena se aproxima do viewport (nunca no bundle
 * inicial). Exige WebGL2 (verificado antes de o importar).
 *
 * Terreno: AWS Terrain Tiles (terrarium). O relevo usa um protocolo que corta
 * o mar a 0 m (mar plano, como na maquete); a cor do mar e da terra vem de
 * duas camadas `color-relief` sobre o mesmo DEM sem corte (a batimetria dá as
 * faixas de profundidade; a terra fica por cima das frentes de onda).
 * Atribuição: © OpenStreetMap · AWS Terrain Tiles · MapLibre (na figura).
 */
import maplibregl, { type Map as MLMap, type StyleSpecification, type ExpressionSpecification } from 'maplibre-gl';
import { aplicarLuz, camara, corMar, COR, frentesOnda, luz, PROF_FAIXAS, type Camara } from '@/lib/praiaCena';
import type { BandaK } from '@/lib/modalidades';

const TILES = 's3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const PROTO = 'ventuclamp';
let protocoloOk = false;

function registarProtocolo() {
  if (protocoloOk) return;
  protocoloOk = true;
  maplibregl.addProtocol(PROTO, async (params, ctl) => {
    const r = await fetch(params.url.replace(`${PROTO}://`, 'https://'), { signal: ctl.signal });
    const blob = await r.blob();
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined')
      return { data: await blob.arrayBuffer() };
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    x.drawImage(bmp, 0, 0);
    const im = x.getImageData(0, 0, c.width, c.height);
    const p = im.data;
    // terrarium: elevação = R·256 + G + B/256 − 32768; R < 128 ⇒ abaixo de 0 m → 0 m
    for (let k = 0; k < p.length; k += 4)
      if (p[k] < 128) {
        p[k] = 128;
        p[k + 1] = 0;
        p[k + 2] = 0;
      }
    x.putImageData(im, 0, 0);
    return { data: await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer() };
  });
}

export interface EstadoCena {
  banda: BandaK;
  sunEl: number;
  sunAz: number;
  cloud: number | null;
  sd: number;
  tp: number;
  hs: number;
}

export interface OpcoesMapa {
  container: HTMLElement;
  ll: [number, number];
  praiaVirada: number;
  desktop: boolean;
  reduz: boolean;
  captura: boolean;
  estado: EstadoCena;
  onPronto: () => void;
  onMexe: (inicio: boolean, porUtilizador: boolean) => void;
  onPerdido: () => void;
}

export interface HandleMapa {
  pinta(e: EstadoCena): void;
  recentrar(): void;
  proj(ll: [number, number]): { x: number; y: number } | null;
  unproj(p: [number, number]): [number, number] | null;
  frentes(t: number): void;
  destruir(): void;
}

function corMarExpr(b: BandaK, L: ReturnType<typeof luz>): ExpressionSpecification {
  // degraus emulados com paragens muito próximas (color-relief só interpola)
  const e: unknown[] = ['interpolate', ['linear'], ['elevation'], -6000, corMar(b, 7, L)];
  for (let i = PROF_FAIXAS.length - 1; i >= 0; i--) {
    const d = PROF_FAIXAS[i];
    e.push(-d - 0.01, corMar(b, i + 1, L), -d + 0.01, corMar(b, i, L));
  }
  e.push(0, corMar(b, 0, L), 9000, corMar(b, 0, L));
  return e as ExpressionSpecification;
}
function corTerraExpr(L: ReturnType<typeof luz>): ExpressionSpecification {
  const t = aplicarLuz(COR.terra, L);
  const a = aplicarLuz(COR.areia, L);
  return ['interpolate', ['linear'], ['elevation'], 0, 'rgba(0,0,0,0)', 0.4, a, 3, a, 9, t, 9000, t] as unknown as ExpressionSpecification;
}
const skyDe = (L: ReturnType<typeof luz>) => ({
  'sky-color': aplicarLuz('#0A2740', L),
  'horizon-color': aplicarLuz('#2E6E96', L),
  'fog-color': aplicarLuz('#123A58', L),
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.7,
  'fog-ground-blend': 0.4,
  'atmosphere-blend': 0,
});
const hillPaint = (e: EstadoCena, L: ReturnType<typeof luz>) => ({
  'hillshade-illumination-anchor': 'map' as const,
  'hillshade-illumination-direction': L.day > 0.05 ? e.sunAz : 300,
  'hillshade-exaggeration': 0.85,
  'hillshade-shadow-color': '#01070D',
  'hillshade-highlight-color': L.gold > 0.2 ? '#FFD7A0' : '#9CC3DD',
  'hillshade-accent-color': '#0B1D2A',
});

export function criarMapa(o: OpcoesMapa): HandleMapa {
  registarProtocolo();
  const L0 = luz(o.estado.sunEl, o.estado.cloud);
  const demClamp = { type: 'raster-dem' as const, tiles: [`${PROTO}://${TILES}`], encoding: 'terrarium' as const, tileSize: 256, maxzoom: 14 };
  const style: StyleSpecification = {
    version: 8,
    sources: {
      demT: demClamp,
      demH: { ...demClamp },
      demR: { type: 'raster-dem', tiles: [`https://${TILES}`], encoding: 'terrarium', tileSize: 256, maxzoom: 13 },
      frentes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    terrain: { source: 'demT', exaggeration: 1.5 },
    sky: skyDe(L0),
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': corMar(o.estado.banda, 6, L0) } },
      { id: 'mar', type: 'color-relief', source: 'demR', paint: { 'color-relief-color': corMarExpr(o.estado.banda, L0) } },
      {
        id: 'frentes',
        type: 'line',
        source: 'frentes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#F3F8FB', 'line-width': 1.6, 'line-opacity': 0.7 },
      },
      { id: 'terra', type: 'color-relief', source: 'demR', paint: { 'color-relief-color': corTerraExpr(L0) } },
      { id: 'sombra', type: 'hillshade', source: 'demH', paint: hillPaint(o.estado, L0) },
    ],
  } as StyleSpecification;

  const cam = (): Camara => camara(o.ll, o.praiaVirada, o.desktop);
  const c0 = cam();
  const m: MLMap = new maplibregl.Map({
    container: o.container,
    style,
    ...c0,
    maxPitch: 60,
    minZoom: c0.zoom - 0.6,
    maxZoom: 15,
    dragPan: false,
    scrollZoom: false,
    boxZoom: false,
    doubleClickZoom: false,
    keyboard: false,
    touchPitch: false,
    pitchWithRotate: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: o.captura, contextType: 'webgl2' },
    maxBounds: [
      [o.ll[0] - 0.16, o.ll[1] - 0.12],
      [o.ll[0] + 0.16, o.ll[1] + 0.12],
    ],
  } as maplibregl.MapOptions);
  m.touchZoomRotate.disableRotation();
  let estado = o.estado;
  let ok = false;
  const dif = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
  m.on('rotate', () => {
    const b0 = cam().bearing;
    const b = m.getBearing();
    if (Math.abs(dif(b, b0)) > 30) m.setBearing(b0 + Math.sign(dif(b, b0)) * 30);
  });
  m.on('movestart', (e) => o.onMexe(true, !!(e as { originalEvent?: unknown }).originalEvent));
  m.on('moveend', (e) => o.onMexe(false, !!(e as { originalEvent?: unknown }).originalEvent));
  m.on('webglcontextlost', () => o.onPerdido());
  m.on('error', (e) => {
    // tiles em falta (offline) não partem a cena; só se regista
    if (process.env.NODE_ENV !== 'production') console.warn('praiaMapa', e.error?.message ?? e);
  });
  const frentes = (t: number) => {
    if (!ok) return;
    const segs = frentesOnda(o.ll, o.praiaVirada, estado.sd, estado.tp, estado.hs, t);
    const src = m.getSource('frentes') as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: segs } });
  };
  const pinta = (e: EstadoCena) => {
    estado = e;
    if (!ok) return;
    const L = luz(e.sunEl, e.cloud);
    m.setPaintProperty('bg', 'background-color', corMar(e.banda, 6, L));
    m.setPaintProperty('mar', 'color-relief-color', corMarExpr(e.banda, L));
    m.setPaintProperty('terra', 'color-relief-color', corTerraExpr(L));
    Object.entries(hillPaint(e, L)).forEach(([k, v]) => m.setPaintProperty('sombra', k, v));
    m.setSky(skyDe(L));
    m.setPaintProperty('frentes', 'line-width', 1 + e.hs * 0.6);
    m.setPaintProperty('frentes', 'line-opacity', Math.max(0.4, Math.min(0.75, 0.35 + e.hs * 0.12)));
    if (o.reduz) frentes(0);
  };
  m.on('load', () => {
    ok = true;
    pinta(estado);
    frentes(o.captura ? 3.2 : 0);
    m.once('idle', () => o.onPronto());
  });
  return {
    pinta,
    frentes,
    recentrar() {
      m.easeTo({ ...cam(), duration: o.reduz ? 0 : 900 });
    },
    proj(ll) {
      const p = m.project(ll);
      return p ? { x: p.x, y: p.y } : null;
    },
    unproj(p) {
      const l = m.unproject(p);
      return l ? [l.lng, l.lat] : null;
    },
    destruir() {
      m.remove();
    },
  };
}
