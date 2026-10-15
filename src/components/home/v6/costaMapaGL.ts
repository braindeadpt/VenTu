/**
 * Mapa 3D da costa (home v6, #183). Este módulo importa `maplibre-gl` e só é
 * carregado por import dinâmico quando o mapa se aproxima do viewport, depois
 * do LCP (nunca no bundle inicial). Exige WebGL2 (verificado antes).
 *
 * Estilo, câmara e relevo da maquete aprovada (`index.html`: `estilo`,
 * `pintaCena`, `camAjusta`): relevo AWS Terrain Tiles ×5 com o mar cortado a
 * 0 m, fundos, troços de mar por spot na cor da nota, terra, sombra, fronteira,
 * costa e os pontos dos spots. Atribuição na figura (OSM · AWS · MapLibre).
 */
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import { aplicarLuz, COR, corTroco, type CamaraCosta, type GeoCosta, type Luz } from '@/lib/home/costaCena';
import { V6_BANDAS } from '@/lib/v6Tokens';
import type { BandaK, Modalidade } from '@/lib/modalidades';

const TILES = 's3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const PROTO = 'ventuclamp';
let protocoloOk = false;
let workerOk = false;

function registar() {
  if (!workerOk) {
    workerOk = true;
    maplibregl.setWorkerUrl(`/vendor/maplibre-gl-worker-${maplibregl.getVersion()}.mjs`);
  }
  if (protocoloOk) return;
  protocoloOk = true;
  // terrarium com o mar a 0 m (elevação = R·256 + G + B/256 − 32768; R < 128 ⇒ abaixo de 0 m)
  maplibregl.addProtocol(PROTO, async (params, ctl) => {
    const r = await fetch(params.url.replace(`${PROTO}://`, 'https://'), { signal: ctl.signal });
    const blob = await r.blob();
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return { data: await blob.arrayBuffer() };
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    x.drawImage(bmp, 0, 0);
    const im = x.getImageData(0, 0, c.width, c.height);
    const p = im.data;
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

export interface PinturaCosta {
  d: Modalidade;
  L: Luz;
  /** banda de cada spot (id → banda), a do ranking do bloco */
  cor: Record<string, BandaK>;
  /** spots da modalidade, com o top 3 marcado */
  pontos: Array<{ id: string; ll: [number, number]; top: boolean }>;
}

export interface HandleCostaGL {
  map: MLMap;
  pinta(p: PinturaCosta): void;
  proj(ll: [number, number]): { x: number; y: number } | null;
  unproj(p: [number, number]): [number, number] | null;
  ajusta(pts: Array<[number, number]>, o: AjusteCamara): CamaraCosta;
  salta(c: CamaraCosta): void;
  anima(c: CamaraCosta): void;
  redimensiona(): void;
  destruir(): void;
}

export interface AjusteCamara {
  z0: number;
  tx: number;
  ty: number;
  v: number;
  h: number;
  pitch: number;
  bearing: number;
  zr: [number, number];
}

const skyDe = (L: Luz) => ({
  'sky-color': aplicarLuz('#061A2C', L),
  'horizon-color': aplicarLuz('#1C5378', L),
  'fog-color': aplicarLuz('#0B2B45', L),
  'sky-horizon-blend': 0.7,
  'horizon-fog-blend': 0.6,
  'fog-ground-blend': 0.45,
  'atmosphere-blend': 0,
});
const hillPaint = (L: Luz) => ({
  'hillshade-illumination-anchor': 'map' as const,
  'hillshade-illumination-direction': L.day > 0.05 ? L.az : 300,
  'hillshade-exaggeration': 0.7,
  'hillshade-shadow-color': '#01060C',
  'hillshade-highlight-color': L.gold > 0.2 ? '#F6C68A' : '#6F93AE',
  'hillshade-accent-color': '#0A1A28',
});
const pontosGeo = (p: PinturaCosta): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: p.pontos.map((s) => ({
    type: 'Feature',
    properties: { id: s.id, c: V6_BANDAS[p.cor[s.id] ?? 'noite'].c, top: s.top ? 1 : 0 },
    geometry: { type: 'Point', coordinates: s.ll },
  })),
});
function corExpr(p: PinturaCosta): ExpressionSpecification {
  const ex: unknown[] = ['match', ['concat', ['get', 's'], '|', ['to-string', ['get', 'r']]]];
  for (const s of p.pontos) for (const r of [0, 1, 2]) ex.push(`${s.id}|${r}`, corTroco(p.cor[s.id] ?? 'noite', r, p.L));
  ex.push('rgba(0,0,0,0)');
  return ex as ExpressionSpecification;
}

export function criarCostaGL(o: {
  container: HTMLElement;
  geo: GeoCosta;
  cam: CamaraCosta;
  pintura: PinturaCosta;
  onPronto: () => void;
  onMexe: (inicio: boolean) => void;
  onClique: (x: number, y: number) => void;
  onPerdido: () => void;
}): HandleCostaGL {
  registar();
  const L = o.pintura.L;
  const dem = { type: 'raster-dem' as const, tiles: [`${PROTO}://${TILES}`], encoding: 'terrarium' as const, tileSize: 256, maxzoom: 10 };
  const src = (d: GeoJSON.FeatureCollection) => ({ type: 'geojson' as const, data: d });
  const style: StyleSpecification = {
    version: 8,
    sources: {
      dem,
      dem2: { ...dem },
      land: src(o.geo.land),
      border: src(o.geo.border),
      kite: src(o.geo.strips.kite),
      surf: src(o.geo.strips.surf),
      spots: src(pontosGeo(o.pintura)),
      fundo: src(o.geo.deep),
    },
    terrain: { source: 'dem', exaggeration: 5 },
    sky: skyDe(L),
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': aplicarLuz(COR.mar, L) } },
      {
        id: 'fundo',
        type: 'fill',
        source: 'fundo',
        paint: { 'fill-color': COR.fundo, 'fill-opacity': ['match', ['get', 'd'], 100, 0.16, 200, 0.2, 600, 0.2, 1500, 0.18, 0.16], 'fill-antialias': false },
      },
      {
        id: 'kite',
        type: 'fill',
        source: 'kite',
        layout: { visibility: o.pintura.d === 'kite' ? 'visible' : 'none' },
        paint: { 'fill-color': o.pintura.d === 'kite' ? corExpr(o.pintura) : '#888', 'fill-antialias': false },
      },
      {
        id: 'surf',
        type: 'fill',
        source: 'surf',
        layout: { visibility: o.pintura.d === 'surf' ? 'visible' : 'none' },
        paint: { 'fill-color': o.pintura.d === 'surf' ? corExpr(o.pintura) : '#888', 'fill-antialias': false },
      },
      { id: 'terra', type: 'fill', source: 'land', paint: { 'fill-color': aplicarLuz(COR.terra, L) } },
      { id: 'sombra', type: 'hillshade', source: 'dem2', paint: hillPaint(L) },
      { id: 'fronteira', type: 'line', source: 'border', paint: { 'line-color': COR.fronteira, 'line-width': 1, 'line-opacity': 0.35, 'line-dasharray': [3, 2] } },
      { id: 'costa', type: 'line', source: 'land', paint: { 'line-color': COR.costa, 'line-width': 1.2, 'line-opacity': 0.55 } },
      {
        id: 'spots-anel',
        type: 'circle',
        source: 'spots',
        paint: { 'circle-radius': ['match', ['get', 'top'], 1, 7.5, 5], 'circle-color': '#030E18', 'circle-pitch-alignment': 'viewport' },
      },
      {
        id: 'spots',
        type: 'circle',
        source: 'spots',
        paint: { 'circle-radius': ['match', ['get', 'top'], 1, 5.5, 3.4], 'circle-color': ['get', 'c'], 'circle-pitch-alignment': 'viewport' },
      },
    ],
  } as StyleSpecification;

  const m: MLMap = new maplibregl.Map({
    container: o.container,
    style,
    ...o.cam,
    maxPitch: 60,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
  });
  let ok = false;
  let ajustando = false;
  let pendente: PinturaCosta | null = null;
  function pinta(p: PinturaCosta) {
    if (!ok) {
      pendente = p;
      return;
    }
    for (const d of ['kite', 'surf'] as const) {
      m.setLayoutProperty(d, 'visibility', d === p.d ? 'visible' : 'none');
      if (d === p.d) m.setPaintProperty(d, 'fill-color', corExpr(p));
    }
    m.setPaintProperty('bg', 'background-color', aplicarLuz(COR.mar, p.L));
    m.setPaintProperty('terra', 'fill-color', aplicarLuz(COR.terra, p.L));
    for (const [k, v] of Object.entries(hillPaint(p.L))) m.setPaintProperty('sombra', k as Parameters<MLMap['setPaintProperty']>[1], v);
    m.setSky(skyDe(p.L));
    (m.getSource('spots') as maplibregl.GeoJSONSource | undefined)?.setData(pontosGeo(p));
  }
  m.on('movestart', () => {
    if (!ajustando) o.onMexe(true);
  });
  m.on('moveend', () => {
    if (!ajustando) o.onMexe(false);
  });
  m.on('load', () => {
    ok = true;
    if (pendente) pinta(pendente);
    pendente = null;
    m.getCanvas().addEventListener('click', (e) => {
      const r = m.getCanvas().getBoundingClientRect();
      o.onClique(e.clientX - r.left, e.clientY - r.top);
    });
    m.once('idle', () => o.onPronto());
  });
  m.getCanvas().addEventListener('webglcontextlost', () => o.onPerdido());

  /* enquadramento calculado para o tamanho do mapa (iterativo, como na maquete) */
  function ajusta(pts: Array<[number, number]>, a: AjusteCamara): CamaraCosta {
    const W = o.container.clientWidth;
    const H = o.container.clientHeight;
    const c0 = m.getCenter();
    const antes = { center: [c0.lng, c0.lat] as [number, number], zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() };
    let c: [number, number] = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    let z = a.z0;
    const tx = W * a.tx;
    const ty = H * a.ty;
    const altV = H * a.v;
    const altH = W * a.h;
    ajustando = true;
    for (let k = 0; k < 7; k++) {
      m.jumpTo({ center: c, zoom: z, pitch: a.pitch, bearing: a.bearing });
      const P = pts.map((p) => m.project(p));
      const xs = P.map((p) => p.x);
      const ys = P.map((p) => p.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const f = Math.min(altV / Math.max(1, Math.max(...ys) - Math.min(...ys)), altH / Math.max(1, Math.max(...xs) - Math.min(...xs)));
      const nc = m.unproject([W / 2 + (cx - tx), H / 2 + (cy - ty)]);
      c = [nc.lng, nc.lat];
      z = Math.max(a.zr[0], Math.min(a.zr[1], z + Math.log2(f) * 0.8));
    }
    m.jumpTo(antes);
    ajustando = false;
    return { center: c, zoom: z, pitch: a.pitch, bearing: a.bearing };
  }

  return {
    map: m,
    pinta,
    proj: (ll) => {
      const p = m.project(ll);
      return p ? { x: p.x, y: p.y } : null;
    },
    unproj: (p) => {
      const l = m.unproject(p);
      return l ? [l.lng, l.lat] : null;
    },
    ajusta,
    salta: (c) => m.jumpTo(c),
    anima: (c) => m.easeTo({ ...c, duration: 900 }),
    redimensiona: () => m.resize(),
    destruir: () => m.remove(),
  };
}
