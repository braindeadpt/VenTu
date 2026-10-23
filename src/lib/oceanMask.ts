import { getAssetPath } from '@/lib/paths';

/**
 * Máscara VECTORIAL do oceano sobre o satélite Esri do /mapa (Leaflet).
 *
 * Os tiles World Imagery mostram no mar uma «escada» de blocos (mosaicos de
 * datas/fontes diferentes). Por cima deles, num canvas próprio (pane entre os
 * tiles e as camadas de dados), pinta-se a água do OSM numa cor sólida:
 *   1. água (mar aberto + rias/lagoas) a `mar` #0C2A42, opacidade 1;
 *   2. pena junto à costa: a linha de costa é «apagada» (`destination-out`)
 *      com um traço desfocado — transparente na costa → sólido a ~330 m
 *      (rias: ~60 m). Mais estreita em píxeis abaixo de z13, para os blocos
 *      Esri não reaparecerem dentro da pena (ex.: Culatra a z12);
 *   3. «fundo» #071B2C a partir de 1,8–3,2 km da costa: mesmo truque, num
 *      canvas a ¼ da resolução, ampliado com suavização (gradiente contínuo,
 *      sem bandas de anéis);
 *   4. linhas de carta #1E4361 a 1,2 km (contínua) e 3,5 km (tracejada),
 *      pré-calculadas e alisadas no bake.
 *
 * Dados: public/geo/ocean-mask/ (scripts/bake-ocean-mask.mjs, OSM ODbL via
 * OpenFreeMap) — um ficheiro grosseiro para z < `regionMinZoom` e regiões
 * por latitude para o detalhe; só se pedem as regiões que tocam a vista,
 * depois do 1.º paint (o hook carrega este módulo em idle).
 */

export const OCEAN_MASK_DIR = '/geo/ocean-mask';

/** Paleta aprovada (maquete «Atlântico», 23/10). */
export const OCEAN_MASK_COLORS = {
  mar: '#0C2A42',
  fundo: '#071B2C',
  linha: '#1E4361',
} as const;

/** Parâmetros aprovados — distâncias em metros. */
export const OCEAN_MASK_PARAMS = {
  /** pena do mar aberto: transparente na costa → sólido a esta distância (z ≥ 13) */
  featherM: 330,
  /** pena das rias/lagoas */
  innerFeatherM: 60,
  /** «fundo»: centro e meia-largura da transição (1,8–3,2 km) */
  depthCenterM: 2500,
  depthHalfM: 700,
  /** linhas de carta só a partir deste zoom */
  isoMinZoom: 10,
  /** máscara só a partir deste zoom (rampa de opacidade até +1) */
  minZoom: 8,
} as const;

export type MaskPath = Float64Array;

export interface OceanMaskRegion {
  id: string;
  file: string;
  /** [oeste, sul, leste, norte] */
  bbox: [number, number, number, number];
}

export interface OceanMaskIndex {
  frame: [number, number, number, number];
  coarse: { file: string; z: number };
  regionMinZoom: number;
  regionZ: number;
  regions: OceanMaskRegion[];
}

export interface OceanMaskSet {
  z: number;
  fill: MaskPath[];
  sea: MaskPath[];
  inner: MaskPath[];
  iso1: MaskPath[];
  iso2: MaskPath[];
}

export interface LatLonView {
  south: number;
  west: number;
  north: number;
  east: number;
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function bbox(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(fin)) return null;
  const [w, s, e, n] = raw as number[];
  return w < e && s < n ? [w, s, e, n] : null;
}

export function parseOceanMaskIndex(raw: unknown): OceanMaskIndex | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  const frame = bbox(r.frame);
  const coarse = r.coarse as Record<string, unknown> | undefined;
  if (!frame || !coarse || typeof coarse.file !== 'string' || !fin(coarse.z)) return null;
  if (!fin(r.regionMinZoom) || !fin(r.regionZ) || !Array.isArray(r.regions)) return null;
  const regions: OceanMaskRegion[] = [];
  for (const g of r.regions as Array<Record<string, unknown>>) {
    const b = bbox(g?.bbox);
    if (!b || typeof g.id !== 'string' || typeof g.file !== 'string') return null;
    regions.push({ id: g.id, file: g.file, bbox: b });
  }
  return { frame, coarse: { file: coarse.file, z: coarse.z }, regionMinZoom: r.regionMinZoom, regionZ: r.regionZ, regions };
}

/** Caminho codificado (x0, y0, dx1, dy1, …) → absoluto. null quando inválido. */
export function decodeMaskPath(enc: unknown, minPts: number): MaskPath | null {
  if (!Array.isArray(enc) || enc.length < minPts * 2 || enc.length % 2) return null;
  const out = new Float64Array(enc.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i < enc.length; i += 2) {
    const dx = enc[i];
    const dy = enc[i + 1];
    if (!fin(dx) || !fin(dy)) return null;
    x = i === 0 ? dx : x + dx;
    y = i === 0 ? dy : y + dy;
    out[i] = x;
    out[i + 1] = y;
  }
  return out;
}

export function parseOceanMaskSet(raw: unknown): OceanMaskSet | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !fin(r.z) || !Array.isArray(r.fill)) return null;
  const list = (k: string, minPts: number): MaskPath[] => {
    const a = r[k];
    if (!Array.isArray(a)) return [];
    const out: MaskPath[] = [];
    for (const e of a) {
      const p = decodeMaskPath(e, minPts);
      if (p) out.push(p);
    }
    return out;
  };
  return {
    z: r.z,
    fill: list('fill', 3),
    sea: list('sea', 2),
    inner: list('inner', 2),
    iso1: list('iso1', 2),
    iso2: list('iso2', 2),
  };
}

const intersects = (b: [number, number, number, number], v: LatLonView) =>
  b[0] < v.east && b[2] > v.west && b[1] < v.north && b[3] > v.south;

/**
 * Ficheiros necessários para uma vista: o grosseiro abaixo de
 * `regionMinZoom`, as regiões que tocam a vista (alargada `marginDeg` — a
 * pena e o «fundo» precisam da costa logo fora do ecrã) a partir dele.
 * Vazio fora da moldura.
 */
export function filesForView(index: OceanMaskIndex, view: LatLonView, zoom: number, marginDeg = 0.05): string[] {
  const v = {
    south: view.south - marginDeg,
    north: view.north + marginDeg,
    west: view.west - marginDeg,
    east: view.east + marginDeg,
  };
  if (!intersects(index.frame, v)) return [];
  if (zoom < index.regionMinZoom) return [index.coarse.file];
  return index.regions.filter((g) => intersects(g.bbox, v)).map((g) => g.file);
}

/** Metros por píxel CSS (Web Mercator) ao zoom/latitude. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

/**
 * Largura da pena em píxeis CSS. ≥ z13: os 330 m aprovados. Abaixo, uma
 * largura fixa em píxeis (5,5 px a z12 → 2,5 px a z9) — 330 m a z12 eram
 * ~11 px e deixavam ver os blocos Esri dentro da pena. Rias: 60 m, ≥ 1,5 px.
 */
export function featherPx(zoom: number, lat: number): { sea: number; inner: number } {
  const mpp = metersPerPixel(zoom, lat);
  let sea: number;
  if (zoom >= 13) sea = OCEAN_MASK_PARAMS.featherM / mpp;
  else if (zoom >= 12) {
    const m12 = 5.5 * metersPerPixel(12, lat);
    sea = lerp(m12, OCEAN_MASK_PARAMS.featherM, zoom - 12) / mpp;
  } else if (zoom >= 11) sea = lerp(4, 5.5, zoom - 11);
  else if (zoom >= 10) sea = lerp(3, 4, zoom - 10);
  else sea = lerp(2.5, 3, zoom - 9);
  const inner = Math.max(1.5, OCEAN_MASK_PARAMS.innerFeatherM / mpp);
  return { sea, inner };
}

/** Opacidade da máscara: 0 abaixo de minZoom, rampa linear até 1 a minZoom+1. */
export function maskOpacity(zoom: number): number {
  return Math.max(0, Math.min(1, zoom - OCEAN_MASK_PARAMS.minZoom));
}

// ── Preparação (Path2D) ─────────────────────────────────────────────────────

interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/**
 * Traça caminhos relativos a uma origem (ox, oy): as coordenadas absolutas
 * a z16 passam dos 8 M — acima da precisão float32 dos paths do canvas.
 * Relativas à moldura ficam < 1 M (erro < 0,07 px a z16).
 */
export function tracePaths(sink: PathSink, paths: ReadonlyArray<MaskPath>, ox: number, oy: number, closed: boolean): void {
  for (const p of paths) {
    sink.moveTo(p[0] - ox, p[1] - oy);
    for (let i = 2; i < p.length; i += 2) sink.lineTo(p[i] - ox, p[i + 1] - oy);
    if (closed) sink.closePath();
  }
}

/** Conjunto pronto a desenhar (um ou vários ficheiros com o mesmo z). */
export interface PreparedMask {
  key: string;
  z: number;
  ox: number;
  oy: number;
  fill: Path2D;
  sea: Path2D;
  inner: Path2D;
  coast: Path2D;
  iso1: Path2D;
  iso2: Path2D;
  empty: boolean;
}

/** Origem da moldura em píxeis-mundo ao zoom z. */
export function frameOrigin(index: OceanMaskIndex, z: number): { ox: number; oy: number } {
  const s = 256 * 2 ** z;
  const [west, , , north] = index.frame;
  const la = (north * Math.PI) / 180;
  return {
    ox: Math.floor(((west + 180) / 360) * s),
    oy: Math.floor((0.5 - Math.log(Math.tan(Math.PI / 4 + la / 2)) / (2 * Math.PI)) * s),
  };
}

export function prepareMask(index: OceanMaskIndex, key: string, sets: OceanMaskSet[]): PreparedMask | null {
  if (!sets.length || typeof Path2D === 'undefined') return null;
  const z = sets[0].z;
  if (sets.some((s) => s.z !== z)) return null;
  const { ox, oy } = frameOrigin(index, z);
  const mk = (k: 'fill' | 'sea' | 'inner' | 'iso1' | 'iso2', closed: boolean) => {
    const p = new Path2D();
    for (const s of sets) tracePaths(p, s[k], ox, oy, closed);
    return p;
  };
  const sea = mk('sea', false);
  const inner = mk('inner', false);
  const coast = new Path2D();
  coast.addPath(sea);
  coast.addPath(inner);
  return {
    key,
    z,
    ox,
    oy,
    fill: mk('fill', true),
    sea,
    inner,
    coast,
    iso1: mk('iso1', false),
    iso2: mk('iso2', false),
    empty: sets.every((s) => !s.fill.length),
  };
}

// ── Desenho ─────────────────────────────────────────────────────────────────

export interface MaskView {
  zoom: number;
  /** píxel-mundo (ao zoom actual) do canto superior esquerdo do canvas */
  origin: { x: number; y: number };
  /** tamanho do canvas em píxeis CSS */
  width: number;
  height: number;
  dpr: number;
  /** latitude do centro (escala Mercator das distâncias em metros) */
  lat: number;
}

type Ctx = CanvasRenderingContext2D;
type ScratchFactory = (w: number, h: number) => { canvas: CanvasImageSource; ctx: Ctx } | null;

/** Desloca o traço para fora do canvas e devolve só a sombra (desfocada) no sítio. */
const SHADOW_OFF = 100_000;

function strokeSoft(ctx: Ctx, path: Path2D, a: number, e: number, f: number, widthUser: number, sigmaDevice: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = widthUser;
  ctx.strokeStyle = '#000';
  if (sigmaDevice >= 0.6) {
    // shadowBlur = 2σ (spec) e não é afectado pela transformação — o traço
    // vai para fora do canvas e só a sombra desfocada cai no sítio.
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 2 * sigmaDevice;
    ctx.shadowOffsetX = SHADOW_OFF;
    ctx.setTransform(a, 0, 0, a, e - SHADOW_OFF, f);
  } else {
    ctx.setTransform(a, 0, 0, a, e, f);
  }
  ctx.stroke(path);
  ctx.restore();
}

let noiseTile: HTMLCanvasElement | null | undefined;
/** Ruído determinístico 64×64 (LCG): branco a alfa 2/255 em metade dos píxeis — +0/+2 níveis. */
function noisePattern(ctx: Ctx): CanvasPattern | null {
  if (noiseTile === undefined) {
    noiseTile = null;
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d');
      if (g) {
        const img = g.createImageData(64, 64);
        let seed = 0x9e3779b9;
        for (let i = 0; i < img.data.length; i += 4) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
          img.data[i + 3] = seed >>> 31 ? 2 : 0;
        }
        g.putImageData(img, 0, 0);
        noiseTile = c;
      }
    }
  }
  return noiseTile ? ctx.createPattern(noiseTile, 'repeat') : null;
}

/**
 * Desenha a máscara no contexto (canvas do tamanho view.width×view.height
 * × dpr). `scratch` dá o canvas auxiliar do «fundo» (¼ da resolução).
 */
export function drawOceanMask(ctx: Ctx, mask: PreparedMask, view: MaskView, scratch: ScratchFactory): void {
  const { dpr } = view;
  const Wd = Math.round(view.width * dpr);
  const Hd = Math.round(view.height * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, Wd, Hd);
  if (mask.empty) return;

  const s = 2 ** (view.zoom - mask.z); // unidade do ficheiro → px CSS
  const a = dpr * s;
  const e = dpr * (mask.ox * s - view.origin.x);
  const f = dpr * (mask.oy * s - view.origin.y);
  const mpp = metersPerPixel(view.zoom, view.lat);

  // 1. água
  ctx.setTransform(a, 0, 0, a, e, f);
  ctx.fillStyle = OCEAN_MASK_COLORS.mar;
  ctx.fill(mask.fill, 'evenodd');

  // 2. pena (transparente na costa → sólido à distância F): traço de largura F
  //    desfocado com σ = F/4 — apaga ~98 % na costa e ~2 % a F.
  const F = featherPx(view.zoom, view.lat);
  ctx.globalCompositeOperation = 'destination-out';
  strokeSoft(ctx, mask.sea, a, e, f, F.sea / s, (F.sea / 4) * dpr);
  strokeSoft(ctx, mask.inner, a, e, f, F.inner / s, (F.inner / 4) * dpr);

  // 3. «fundo» — canvas a ¼, ampliado (gradiente suave, sem anéis)
  const k = 0.25;
  const w4 = Math.max(1, Math.ceil(Wd * k));
  const h4 = Math.max(1, Math.ceil(Hd * k));
  const sc = scratch(w4, h4);
  if (sc) {
    const c2 = sc.ctx;
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.globalCompositeOperation = 'source-over';
    c2.clearRect(0, 0, w4, h4);
    c2.setTransform(a * k, 0, 0, a * k, e * k, f * k);
    c2.fillStyle = OCEAN_MASK_COLORS.fundo;
    c2.fill(mask.fill, 'evenodd');
    c2.globalCompositeOperation = 'destination-out';
    const depthW = (2 * OCEAN_MASK_PARAMS.depthCenterM) / mpp; // px CSS
    const sigma = (OCEAN_MASK_PARAMS.depthHalfM / 2 / mpp) * dpr * k;
    strokeSoft(c2, mask.coast, a * k, e * k, f * k, depthW / s, sigma);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sc.canvas, 0, 0, w4, h4, 0, 0, w4 / k, h4 / k);
  }

  // 3b. dither ±1 nível: o «fundo» e o «mar» diferem só ~20 níveis de 8 bits
  //     em 1,4 km — sem ruído, o gradiente mostra degraus (bandas) verticais.
  const noise = noisePattern(ctx);
  if (noise) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = noise;
    ctx.fillRect(0, 0, Wd, Hd);
  }

  // 4. linhas de carta
  ctx.globalCompositeOperation = 'source-over';
  if (view.zoom >= OCEAN_MASK_PARAMS.isoMinZoom) {
    ctx.setTransform(a, 0, 0, a, e, f);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = OCEAN_MASK_COLORS.linha;
    ctx.lineWidth = 1.2 / s;
    ctx.globalAlpha = 0.9;
    ctx.stroke(mask.iso1);
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([4 / s, 4 / s]);
    ctx.stroke(mask.iso2);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ── Carregamento (browser) ──────────────────────────────────────────────────

let indexPromise: Promise<OceanMaskIndex | null> | null = null;
let indexValue: OceanMaskIndex | null = null;
let indexFailedAt = 0;
const setCache = new Map<string, OceanMaskSet>();
const setInflight = new Map<string, Promise<OceanMaskSet | null>>();
const preparedCache = new Map<string, PreparedMask>();

export function loadOceanMaskIndex(): Promise<OceanMaskIndex | null> {
  if (indexValue) return Promise.resolve(indexValue);
  if (indexPromise) return indexPromise;
  if (indexFailedAt && Date.now() - indexFailedAt < 5 * 60_000) return Promise.resolve(null);
  indexPromise = fetch(getAssetPath(`${OCEAN_MASK_DIR}/index.json`))
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => parseOceanMaskIndex(raw))
    .catch(() => null)
    .then((ix) => {
      indexPromise = null;
      if (ix) indexValue = ix;
      else indexFailedAt = Date.now();
      return ix;
    });
  return indexPromise;
}

export function oceanMaskIndexSync(): OceanMaskIndex | null {
  return indexValue;
}

export function loadOceanMaskSet(file: string): Promise<OceanMaskSet | null> {
  const hit = setCache.get(file);
  if (hit) return Promise.resolve(hit);
  const fl = setInflight.get(file);
  if (fl) return fl;
  const p = fetch(getAssetPath(`${OCEAN_MASK_DIR}/${file}`))
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => parseOceanMaskSet(raw))
    .catch(() => null)
    .then((set) => {
      setInflight.delete(file);
      if (set) setCache.set(file, set);
      return set;
    });
  setInflight.set(file, p);
  return p;
}

/** Máscara pronta para os ficheiros (síncrono) — null quando falta algum. */
export function preparedMaskSync(index: OceanMaskIndex, files: string[]): PreparedMask | null {
  if (!files.length) return null;
  const key = files.join(',');
  const hit = preparedCache.get(key);
  if (hit) return hit;
  const sets: OceanMaskSet[] = [];
  for (const f of files) {
    const s = setCache.get(f);
    if (!s) return null;
    sets.push(s);
  }
  const m = prepareMask(index, key, sets);
  if (!m) return null;
  if (preparedCache.size > 6) preparedCache.delete(preparedCache.keys().next().value as string);
  preparedCache.set(key, m);
  return m;
}

/** Test hook. */
export function clearOceanMaskCache(): void {
  indexPromise = null;
  indexValue = null;
  indexFailedAt = 0;
  setCache.clear();
  setInflight.clear();
  preparedCache.clear();
}

/** Test hook — instala índice e conjuntos já descodificados. */
export function installOceanMask(index: OceanMaskIndex, sets: Record<string, OceanMaskSet>): void {
  indexValue = index;
  for (const [k, v] of Object.entries(sets)) setCache.set(k, v);
}
