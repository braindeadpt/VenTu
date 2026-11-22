/**
 * Mapa 3D da praia (#184). Este módulo importa `maplibre-gl` e só é carregado
 * por import dinâmico quando a cena se aproxima do viewport (nunca no bundle
 * inicial). Exige WebGL2 (verificado antes de o importar).
 *
 * Terreno: AWS Terrain Tiles (terrarium). O relevo usa um protocolo que corta
 * o mar a 0 m (mar plano, como na maquete). Como na maquete, o mar é pintado
 * por faixas de profundidade vectoriais (isóbatas aproximadas de
 * `geoDaPraia`: a nota da hora junto à praia, azuis do Atlântico ao largo) e
 * a terra, a areia e a linha de costa saem da mesma geografia; um
 * `color-relief` por baixo cobre a terra para lá da área calculada.
 * Atribuição: © OpenStreetMap · AWS Terrain Tiles · MapLibre (na figura).
 */
import * as maplibregl from 'maplibre-gl';
import { type Map as MLMap, type StyleSpecification, type ExpressionSpecification } from 'maplibre-gl';
import { aplicarLuz, camara, corMar, COR, frentesOnda, luz, TERRA_COTAS, type Camara } from '@/lib/praiaCena';
import { frentesGeo, multiPoligono, type GeoPraia } from '@/lib/praiaGeo';
import { ISOBATH_DEPTH_STYLE } from '@/lib/isobaths';
import type { BandaK } from '@/lib/modalidades';
import { geoDaPraia } from './praiaRelevo';

const TILES = 's3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const PROTO = 'ventuclamp';
let protocoloOk = false;
interface EntradaClamp {
  p: Promise<ArrayBuffer>;
  ac: AbortController;
  refs: number;
  pronto: boolean;
}
const clampCache = new Map<string, EntradaClamp>();

function registarProtocolo() {
  if (protocoloOk) return;
  protocoloOk = true;
  maplibregl.addProtocol(PROTO, async (params, ctl) => {
    const url = params.url.replace(`${PROTO}://`, 'https://');
    let ent = clampCache.get(url);
    if (!ent) {
      const ac = new AbortController();
      const nova: EntradaClamp = { ac, refs: 0, pronto: false, p: Promise.resolve(new ArrayBuffer(0)) };
      nova.p = (async () => {
        const r = await fetch(url, { signal: ac.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
          nova.pronto = true;
          return blob.arrayBuffer();
        }
        const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const x = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
        x.drawImage(bmp, 0, 0);
        const im = x.getImageData(0, 0, c.width, c.height);
        const d = im.data;
        // terrarium: elevação = R·256 + G + B/256 − 32768; R < 128 ⇒ abaixo de 0 m → 0 m
        for (let k = 0; k < d.length; k += 4)
          if (d[k] < 128) {
            d[k] = 128;
            d[k + 1] = 0;
            d[k + 2] = 0;
          }
        x.putImageData(im, 0, 0);
        const out = await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer();
        nova.pronto = true;
        return out;
      })();
      if (clampCache.size >= 120) clampCache.clear();
      clampCache.set(url, nova);
      void nova.p.catch(() => {
        if (clampCache.get(url) === nova) clampCache.delete(url);
      });
      ent = nova;
    }
    ent.refs++;
    const onAbort = () => {
      ent.refs = Math.max(0, ent.refs - 1);
      // Só cancela o fetch partilhado se todos os consumidores (demT + demH) desistirem antes de concluir.
      if (ent.refs === 0 && !ent.pronto) {
        ent.ac.abort();
        if (clampCache.get(url) === ent) clampCache.delete(url);
      }
    };
    ctl.signal.addEventListener('abort', onAbort, { once: true });
    try {
      const buf = await ent.p;
      if (ctl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return { data: buf.slice(0) };
    } finally {
      ctl.signal.removeEventListener('abort', onAbort);
      if (!ctl.signal.aborted) ent.refs = Math.max(0, ent.refs - 1);
    }
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
  /** id do spot com geografia estática (spots curados) */
  idEstatico?: string;
  praiaVirada: number;
  /** ponto que fica no centro do enquadramento no telemóvel (rótulo editorial do spot); por omissão `ll` */
  foco?: [number, number];
  aguaInterior?: boolean;
  semOndas?: boolean;
  desktop: boolean;
  temRato: boolean;
  reduz: boolean;
  estado: EstadoCena;
  onPronto: () => void;
  onMexe: (inicio: boolean, porUtilizador: boolean) => void;
  onCamara?: (bearing: number, pitch: number) => void;
  onMoveFrame?: () => void;
  onPerdido: () => void;
}

export interface GrupoIsobata {
  depth: number;
  lines: number[][][];
}

export interface HandleMapa {
  pinta(e: EstadoCena): void;
  recentrar(): void;
  topo(ativo: boolean): void;
  setIsob(visivel: boolean, grupos?: readonly GrupoIsobata[]): void;
  bearing(): number;
  pitch(): number;
  proj(ll: [number, number]): { x: number; y: number } | null;
  unproj(p: [number, number]): [number, number] | null;
  frentes(t: number): void;
  destruir(): void;
}

/** Converte as isóbatas locais do IH num FeatureCollection GeoJSON pronto para MapLibre. */
export function isobatasParaGeoJSON(grupos: readonly GrupoIsobata[]) {
  return {
    type: 'FeatureCollection' as const,
    features: grupos.map((g) => ({
      type: 'Feature' as const,
      properties: { depth: g.depth },
      geometry: { type: 'MultiLineString' as const, coordinates: g.lines },
    })),
  };
}

/** Cor de cada faixa de profundidade (propriedade `i` do GeoJSON). */
function corFaixasExpr(b: BandaK, L: ReturnType<typeof luz>): ExpressionSpecification {
  const e: unknown[] = ['match', ['get', 'i']];
  for (let i = 0; i < 7; i++) e.push(i, corMar(b, i, L));
  e.push(corMar(b, 6, L));
  return e as ExpressionSpecification;
}
/** Terra por cota (as mesmas cores da vista plana). */
function corRelevoExpr(L: ReturnType<typeof luz>): ExpressionSpecification {
  const e: unknown[] = ['match', ['get', 'k']];
  TERRA_COTAS.slice(1).forEach((c, k) => e.push(k, aplicarLuz(c, L)));
  e.push(aplicarLuz(TERRA_COTAS[1], L));
  return e as ExpressionSpecification;
}
const VAZIO = { type: 'FeatureCollection' as const, features: [] };
/** espaçamento das frentes no 3D a 1440 (desktop): 0,8 deixava-as ~1,4× mais juntas do que na maquete */
const ESCALA_FRENTES_DESK = 1.12;
/** GeoJSON das camadas da praia a partir da geografia vectorial. */
export function geojsonDaPraia(g: GeoPraia) {
  const fc = (aneis: GeoPraia['terra'], props: Record<string, number> = {}) => ({
    type: 'Feature' as const,
    properties: props,
    geometry: { type: 'MultiPolygon' as const, coordinates: multiPoligono(aneis) },
  });
  return {
    // do fundo (i = 6, < 100 m) para a praia (i = 0, < 5 m): a ordem das features é a ordem de pintura
    faixas: { type: 'FeatureCollection' as const, features: g.faixas.map((f, i) => fc(f, { i })).reverse() },
    terra: { type: 'FeatureCollection' as const, features: [fc(g.terra)] },
    areia: { type: 'FeatureCollection' as const, features: [fc(g.areia)] },
    aguaInterior: { type: 'FeatureCollection' as const, features: g.aguaInterior?.length ? [fc(g.aguaInterior)] : [] },
    // com as camadas OSM (spots curados), como na maquete: sem as cotas
    relevo: { type: 'FeatureCollection' as const, features: g.pinhal ? [] : g.relevo.map((r, k) => fc(r, { k })) },
    pinhal: { type: 'FeatureCollection' as const, features: g.pinhal ? [fc(g.pinhal)] : [] },
    urbano: { type: 'FeatureCollection' as const, features: g.urbano ? [fc(g.urbano)] : [] },
    rocha: { type: 'FeatureCollection' as const, features: g.rocha ? [fc(g.rocha)] : [] },
    estradas: {
      type: 'FeatureCollection' as const,
      features: g.estradas?.length ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates: g.estradas } }] : [],
    },
    limites: {
      type: 'FeatureCollection' as const,
      features: g.limites?.length ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates: g.limites } }] : [],
    },
  };
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

/**
 * MapLibre 6 (ES module): o worker vem de `public/vendor/` (copiado de
 * node_modules no prebuild, `scripts/copy-maplibre-worker.mjs`), da mesma
 * origem: a CSP mantém `worker-src 'self' blob:`.
 */
let workerOk = false;
function configurarWorker() {
  if (workerOk) return;
  workerOk = true;
  maplibregl.setWorkerUrl(`/vendor/maplibre-gl-worker-${maplibregl.getVersion()}.mjs`);
}

export function criarMapa(o: OpcoesMapa): HandleMapa {
  configurarWorker();
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
      isobatasG: { type: 'geojson', data: VAZIO },
      faixas: { type: 'geojson', data: VAZIO },
      terraG: { type: 'geojson', data: VAZIO },
      areiaG: { type: 'geojson', data: VAZIO },
      aguaInteriorG: { type: 'geojson', data: VAZIO },
      relevoG: { type: 'geojson', data: VAZIO },
      pinhalG: { type: 'geojson', data: VAZIO },
      urbanoG: { type: 'geojson', data: VAZIO },
      rochaG: { type: 'geojson', data: VAZIO },
      estradasG: { type: 'geojson', data: VAZIO },
      limitesG: { type: 'geojson', data: VAZIO },
    },
    terrain: { source: 'demT', exaggeration: 1.5 },
    sky: skyDe(L0),
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': corMar(o.estado.banda, 7, L0) } },
      { id: 'mar', type: 'fill', source: 'faixas', paint: { 'fill-color': corFaixasExpr(o.estado.banda, L0), 'fill-antialias': false } },
      {
        id: 'isobatasG',
        type: 'line',
        source: 'isobatasG',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'depth'],
            8,
            ISOBATH_DEPTH_STYLE[8].color,
            16,
            ISOBATH_DEPTH_STYLE[16].color,
            30,
            ISOBATH_DEPTH_STYLE[30].color,
            '#A9C2D4',
          ],
          'line-width': 1.7,
          'line-opacity': 0.88,
          'line-dasharray': [4, 3],
        },
      },
      {
        id: 'frentes',
        type: 'line',
        source: 'frentes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#F3F8FB', 'line-width': 1.6, 'line-opacity': 0.7 },
      },
      { id: 'terra', type: 'color-relief', source: 'demR', paint: { 'color-relief-color': corTerraExpr(L0) } },
      { id: 'terraG', type: 'fill', source: 'terraG', paint: { 'fill-color': aplicarLuz(COR.terra, L0) } },
      { id: 'relevoG', type: 'fill', source: 'relevoG', paint: { 'fill-color': corRelevoExpr(L0), 'fill-opacity': 0.85 } },
      { id: 'urbanoG', type: 'fill', source: 'urbanoG', paint: { 'fill-color': aplicarLuz(COR.urb, L0), 'fill-opacity': 0.8 } },
      { id: 'pinhalG', type: 'fill', source: 'pinhalG', paint: { 'fill-color': aplicarLuz(COR.pinhal, L0), 'fill-opacity': 0.8 } },
      { id: 'rochaG', type: 'fill', source: 'rochaG', paint: { 'fill-color': aplicarLuz(COR.rocha, L0), 'fill-opacity': 0.9 } },
      { id: 'areiaG', type: 'fill', source: 'areiaG', paint: { 'fill-color': aplicarLuz(COR.areia, L0) } },
      { id: 'aguaInteriorG', type: 'fill', source: 'aguaInteriorG', paint: { 'fill-color': corMar(o.estado.banda, 0, L0), 'fill-antialias': true } },
      { id: 'aguaInteriorBorda', type: 'line', source: 'aguaInteriorG', paint: { 'line-color': '#F3F8FB', 'line-width': 1.2, 'line-opacity': 0.55 } },
      { id: 'sombra', type: 'hillshade', source: 'demH', paint: hillPaint(o.estado, L0) },
      {
        id: 'estradasG',
        type: 'line',
        source: 'estradasG',
        paint: { 'line-color': aplicarLuz(COR.estrada, L0), 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 1.6], 'line-opacity': 0.6 },
      },
      // tracejado em terra (a maquete tem um, que lá é o contorno da caixa da terra): aqui, dados reais,
      // os limites administrativos do OSM (concelho e acima)
      {
        id: 'limitesG',
        type: 'line',
        source: 'limitesG',
        paint: { 'line-color': '#F3F8FB', 'line-width': 1.2, 'line-opacity': 0.7, 'line-dasharray': [2, 2] },
      },
      { id: 'costa', type: 'line', source: 'terraG', paint: { 'line-color': '#F3F8FB', 'line-width': 1.4, 'line-opacity': 0.7 } },
    ],
  } as StyleSpecification;

  const cam = (): Camara => camara(o.ll, o.praiaVirada, o.desktop, o.foco, !!o.aguaInterior);
  const c0 = cam();
  const m: MLMap = new maplibregl.Map({
    container: o.container,
    style,
    ...c0,
    maxPitch: 62,
    minZoom: c0.zoom - 0.8,
    maxZoom: 15,
    // Rato fino (hover+pointer fine): arrasto livre em qualquer largura de janela.
    // Ecrã táctil: dragPan=false preserva o scroll vertical com 1 dedo; 2 dedos fazem zoom/rotação/pitch.
    dragPan: o.temRato,
    scrollZoom: false,
    boxZoom: false,
    doubleClickZoom: false,
    keyboard: false,
    touchPitch: true,
    pitchWithRotate: true,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { contextType: 'webgl2' },
    maxBounds: [
      [o.ll[0] - 0.1, o.ll[1] - 0.08],
      [o.ll[0] + 0.1, o.ll[1] + 0.08],
    ],
  } as maplibregl.MapOptions);
  let estado = o.estado;
  let ok = false;
  m.on('move', () => {
    o.onCamara?.(m.getBearing(), m.getPitch());
    o.onMoveFrame?.();
  });
  m.on('movestart', (e) => o.onMexe(true, !!(e as { originalEvent?: unknown }).originalEvent));
  m.on('moveend', (e) => {
    o.onCamara?.(m.getBearing(), m.getPitch());
    o.onMexe(false, !!(e as { originalEvent?: unknown }).originalEvent);
  });
  m.on('webglcontextlost', () => o.onPerdido());
  m.on('error', (e) => {
    // tiles em falta (offline) não partem a cena; só se regista
    if (process.env.NODE_ENV !== 'production') console.warn('praiaMapa', e.error?.message ?? e);
  });
  // Cache circular de 24 fases para o par (rumo, período, altura): após 1 ciclo,
  // cada frame da animação reutiliza o GeoJSON pronto sem recalcular marching squares nem encadeia.
  const FRENTES_N = 24;
  type GeoFrente = { type: 'Feature'; properties: Record<string, never>; geometry: { type: 'MultiLineString'; coordinates: Array<Array<[number, number]>> } };
  let cicloChave = '';
  let cicloSlots: Array<GeoFrente | null> = [];
  let ultimoSlot = -1;
  let isobPend: { visivel: boolean; grupos?: readonly GrupoIsobata[] } | null = null;
  const frentes = (t: number) => {
    if (!ok) return;
    const src = m.getSource('frentes') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (o.semOndas || !(estado.hs > 0.15) || !(estado.tp > 0)) {
      if (cicloChave !== 'vazio') {
        cicloChave = 'vazio';
        ultimoSlot = -1;
        src.setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } });
      }
      return;
    }
    const escala = o.desktop ? ESCALA_FRENTES_DESK : 0.7;
    const rumoChave = geoOk ? Math.round(estado.sd / 10) * 10 : Math.round(estado.sd);
    const chave = `${rumoChave}:${Math.round(estado.tp)}:${Math.round(estado.hs * 10)}:${geoOk ? 1 : 0}`;
    if (chave !== cicloChave) {
      cicloChave = chave;
      cicloSlots = new Array<GeoFrente | null>(FRENTES_N).fill(null);
      ultimoSlot = -1;
    }
    const periodoT = geoOk
      ? (estado.tp * (o.desktop ? 2 : 3) * escala) / 8
      : Math.max(0.25, Math.min(1.1, estado.tp * 0.055)) / 0.08;
    const frac = (((t % periodoT) + periodoT) % periodoT) / periodoT;
    const idx = Math.floor(frac * FRENTES_N) % FRENTES_N;
    if (idx === ultimoSlot) return;
    let feat = cicloSlots[idx];
    if (!feat) {
      const tSlot = (idx / FRENTES_N) * periodoT;
      const segs = geoOk
        ? frentesGeo(geoOk.ondas, estado.sd, estado.tp, estado.hs, tSlot, o.desktop, 3200, escala, 10)
        : frentesOnda(o.ll, o.praiaVirada, rumoChave, estado.tp, estado.hs, tSlot);
      feat = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: segs } };
      cicloSlots[idx] = feat;
    }
    ultimoSlot = idx;
    src.setData(feat);
  };
  const setIsob = (visivel: boolean, grupos?: readonly GrupoIsobata[]) => {
    if (!ok) {
      isobPend = { visivel, grupos };
      return;
    }
    if (grupos) {
      (m.getSource('isobatasG') as maplibregl.GeoJSONSource | undefined)?.setData(isobatasParaGeoJSON(grupos));
    }
    m.setLayoutProperty('isobatasG', 'visibility', visivel ? 'visible' : 'none');
  };
  const pinta = (e: EstadoCena) => {
    estado = e;
    if (!ok) return;
    const L = luz(e.sunEl, e.cloud);
    m.setPaintProperty('bg', 'background-color', corMar(e.banda, 7, L));
    m.setPaintProperty('mar', 'fill-color', corFaixasExpr(e.banda, L));
    m.setPaintProperty('terra', 'color-relief-color', corTerraExpr(L));
    m.setPaintProperty('terraG', 'fill-color', aplicarLuz(COR.terra, L));
    m.setPaintProperty('areiaG', 'fill-color', aplicarLuz(COR.areia, L));
    m.setPaintProperty('aguaInteriorG', 'fill-color', corMar(e.banda, 0, L));
    m.setPaintProperty('relevoG', 'fill-color', corRelevoExpr(L));
    m.setPaintProperty('urbanoG', 'fill-color', aplicarLuz(COR.urb, L));
    m.setPaintProperty('pinhalG', 'fill-color', aplicarLuz(COR.pinhal, L));
    m.setPaintProperty('rochaG', 'fill-color', aplicarLuz(COR.rocha, L));
    m.setPaintProperty('estradasG', 'line-color', aplicarLuz(COR.estrada, L));
    (Object.entries(hillPaint(e, L)) as Array<[keyof maplibregl.AllPaintProperties, never]>).forEach(([k, v]) => m.setPaintProperty('sombra', k, v));
    m.setSky(skyDe(L));
    m.setPaintProperty('frentes', 'line-width', 1 + e.hs * 0.6);
    m.setPaintProperty('frentes', 'line-opacity', Math.max(0.4, Math.min(0.75, 0.35 + e.hs * 0.12)));
    if (o.reduz) frentes(0);
  };
  // a geografia (costa, faixas, areia) carrega em paralelo com o estilo
  const geo = geoDaPraia(o.ll, o.idEstatico);
  let geoOk: GeoPraia | null = null;
  let vivo = true;
  m.on('load', () => {
    ok = true;
    pinta(estado);
    frentes(0);
    if (isobPend) {
      setIsob(isobPend.visivel, isobPend.grupos);
      isobPend = null;
    }
    void geo.then((g) => {
      if (!vivo) return;
      if (g) {
        const gj = geojsonDaPraia(g);
        (m.getSource('faixas') as maplibregl.GeoJSONSource | undefined)?.setData(gj.faixas);
        (m.getSource('terraG') as maplibregl.GeoJSONSource | undefined)?.setData(gj.terra);
        (m.getSource('areiaG') as maplibregl.GeoJSONSource | undefined)?.setData(gj.areia);
        (m.getSource('aguaInteriorG') as maplibregl.GeoJSONSource | undefined)?.setData(gj.aguaInterior);
        (m.getSource('relevoG') as maplibregl.GeoJSONSource | undefined)?.setData(gj.relevo);
        (m.getSource('pinhalG') as maplibregl.GeoJSONSource | undefined)?.setData(gj.pinhal);
        (m.getSource('urbanoG') as maplibregl.GeoJSONSource | undefined)?.setData(gj.urbano);
        (m.getSource('rochaG') as maplibregl.GeoJSONSource | undefined)?.setData(gj.rocha);
        (m.getSource('estradasG') as maplibregl.GeoJSONSource | undefined)?.setData(gj.estradas);
        (m.getSource('limitesG') as maplibregl.GeoJSONSource | undefined)?.setData(gj.limites);
        geoOk = g;
        frentes(0);
      }
      m.once('idle', () => vivo && o.onPronto());
      m.triggerRepaint();
    });
  });
  return {
    pinta,
    frentes,
    setIsob,
    recentrar() {
      m.easeTo({ ...cam(), duration: o.reduz ? 0 : 800 });
    },
    topo(ativo) {
      if (ativo) {
        m.easeTo({
          center: o.foco ?? o.ll,
          zoom: o.desktop ? 12.6 : 12.0,
          pitch: 0,
          bearing: 0,
          duration: o.reduz ? 0 : 700,
        });
      } else {
        m.easeTo({ ...cam(), duration: o.reduz ? 0 : 700 });
      }
    },
    bearing() {
      return m.getBearing();
    },
    pitch() {
      return m.getPitch();
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
      vivo = false;
      m.remove();
    },
  };
}
