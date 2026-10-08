import { getAssetPath } from '@/lib/paths';

/**
 * Recorte VECTORIAL da terra para os campos «Vento» e «Ondulação» do /mapa.
 *
 * O campo é desenhado no canvas e a terra é depois apagada com polígonos
 * projectados para o ecrã (Canvas2D com anti-aliasing, `destination-out`,
 * regra even-odd) — a linha de costa fica nítida a qualquer zoom, em vez da
 * escada de píxeis da máscara raster (`landMask.ts`).
 *
 * Polígonos: `public/geo/land-clip/` (scripts/bake-land-clip.py) — GADM 4.1
 * PT+ES à resolução total + Natural Earth 10m para o resto, com águas
 * interiores (rias, lagoas, estuários) fechadas como terra. Quatro níveis de
 * simplificação por zoom, em mosaicos: só se pedem os mosaicos do nível do
 * zoom actual que tocam a vista (~10–60 KB gzip por vista).
 *
 * Coordenadas: píxeis-mundo Web Mercator ao zoom de quantização `z` do nível
 * — a convenção do Leaflet (EPSG:3857, 256·2^z). Um Path2D por conjunto de
 * mosaicos é construído uma vez nessas coordenadas e desenhado com uma
 * transformação (escala 2^(zoom−z) + origem do canvas): pan e zoom não
 * re-projectam vértice nenhum.
 */

export const LAND_CLIP_DIR = '/geo/land-clip';

export interface LandClipTier {
  minZoom: number;
  maxZoom: number;
  /** zoom de quantização das coordenadas */
  z: number;
  tileDeg: number;
  tiles: Set<string>;
  full: Set<string>;
}

export interface LandClipIndex {
  tiers: LandClipTier[];
  /** extensão dos polígonos (fora dela: mar) */
  domain: { west: number; south: number; east: number; north: number };
}

export interface LatLonView {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Anel em coordenadas absolutas [x0,y0,x1,y1,…] (píxeis-mundo ao zoom `z`). */
export type LandRing = Float64Array;

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function parseLandClipIndex(raw: unknown): LandClipIndex | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !Array.isArray(r.tiers) || !r.tiers.length) return null;
  const tiers: LandClipTier[] = [];
  for (const t of r.tiers as Array<Record<string, unknown>>) {
    if (!t || !fin(t.minZoom) || !fin(t.maxZoom) || !fin(t.z) || !fin(t.tileDeg) || !Array.isArray(t.tiles)) return null;
    tiers.push({
      minZoom: t.minZoom,
      maxZoom: t.maxZoom,
      z: t.z,
      tileDeg: t.tileDeg,
      tiles: new Set((t.tiles as unknown[]).map(String)),
      full: new Set(Array.isArray(t.full) ? (t.full as unknown[]).map(String) : []),
    });
  }
  tiers.sort((a, b) => a.minZoom - b.minZoom);
  const d = (r.domain ?? {}) as Record<string, unknown>;
  const domain =
    fin(d.west) && fin(d.south) && fin(d.east) && fin(d.north)
      ? { west: d.west, south: d.south, east: d.east, north: d.north }
      : { west: -180, south: -85, east: 180, north: 85 };
  return { tiers, domain };
}

/** Anel codificado (x0, y0, dx1, dy1, …) → absoluto. null quando inválido. */
export function decodeRing(enc: unknown): LandRing | null {
  if (!Array.isArray(enc) || enc.length < 6 || enc.length % 2) return null;
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

export function parseLandClipTile(raw: unknown): { z: number; rings: LandRing[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !fin(r.z) || !Array.isArray(r.rings)) return null;
  const rings: LandRing[] = [];
  for (const e of r.rings) {
    const ring = decodeRing(e);
    if (ring) rings.push(ring);
  }
  return { z: r.z, rings };
}

/** Nível para um zoom (fraccionário). */
export function tierForZoom(index: LandClipIndex, zoom: number): LandClipTier {
  const z = Math.round(zoom);
  for (const t of index.tiers) if (z >= t.minZoom && z <= t.maxZoom) return t;
  return z < index.tiers[0].minZoom ? index.tiers[0] : index.tiers[index.tiers.length - 1];
}

/** Chaves «sul_oeste» dos mosaicos do nível que tocam a vista (só os que existem). */
export function tileKeysForView(tier: LandClipTier, view: LatLonView): string[] {
  const d = tier.tileDeg;
  const out: string[] = [];
  const s0 = Math.floor(Math.max(-90, view.south) / d) * d;
  const w0 = Math.floor(Math.max(-180, view.west) / d) * d;
  for (let s = s0; s < Math.min(90, view.north); s += d) {
    for (let w = w0; w < Math.min(180, view.east); w += d) {
      const k = `${s}_${w}`;
      if (tier.tiles.has(k)) out.push(k);
    }
  }
  return out;
}

/** Píxel-mundo ao zoom `z` (EPSG:3857, 256·2^z) — a convenção do Leaflet. */
export function lonLatToWorld(lon: number, lat: number, z: number): { x: number; y: number } {
  const s = 256 * 2 ** z;
  const la = Math.max(-85.0511, Math.min(85.0511, lat)) * (Math.PI / 180);
  return {
    x: ((lon + 180) / 360) * s,
    y: (0.5 - Math.log(Math.tan(Math.PI / 4 + la / 2)) / (2 * Math.PI)) * s,
  };
}

/**
 * Transformação dos anéis (zoom de quantização `zq`) para o ecrã: escala
 * 2^(zoom−zq) e translação −origem (píxel-mundo, ao zoom actual, do canto
 * superior esquerdo do canvas).
 */
export function clipTransform(zq: number, zoom: number, origin: { x: number; y: number }): { s: number; tx: number; ty: number } {
  return { s: 2 ** (zoom - zq), tx: -origin.x, ty: -origin.y };
}

/** Projecta um anel para píxeis de ecrã (testes / referência). */
export function projectRing(ring: LandRing, zq: number, zoom: number, origin: { x: number; y: number }): Float64Array {
  const { s, tx, ty } = clipTransform(zq, zoom, origin);
  const out = new Float64Array(ring.length);
  for (let i = 0; i < ring.length; i += 2) {
    out[i] = ring[i] * s + tx;
    out[i + 1] = ring[i + 1] * s + ty;
  }
  return out;
}

interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/** Traça os anéis num path/contexto (coordenadas de quantização). */
export function traceRings(sink: PathSink, rings: ReadonlyArray<LandRing>): void {
  for (const r of rings) {
    sink.moveTo(r[0], r[1]);
    for (let i = 2; i < r.length; i += 2) sink.lineTo(r[i], r[i + 1]);
    sink.closePath();
  }
}

/** Even-odd sobre anéis (mesmo espaço do ponto) — referência da máscara. */
export function pointInRings(rings: ReadonlyArray<Float64Array>, x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    const n = r.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = r[i];
      const yi = r[i + 1];
      const xj = r[j];
      const yj = r[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// ── Carregamento (browser) ──────────────────────────────────────────────────

let indexPromise: Promise<LandClipIndex | null> | null = null;
let indexValue: LandClipIndex | null = null;
let indexFailedAt = 0;
const tileCache = new Map<string, LandRing[]>();
const tileInflight = new Map<string, Promise<LandRing[] | null>>();

export function loadLandClipIndex(): Promise<LandClipIndex | null> {
  if (indexValue) return Promise.resolve(indexValue);
  if (indexPromise) return indexPromise;
  if (indexFailedAt && Date.now() - indexFailedAt < 5 * 60_000) return Promise.resolve(null);
  indexPromise = fetch(getAssetPath(`${LAND_CLIP_DIR}/index.json`))
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => parseLandClipIndex(raw))
    .catch(() => null)
    .then((ix) => {
      indexPromise = null;
      if (ix) indexValue = ix;
      else indexFailedAt = Date.now();
      return ix;
    });
  return indexPromise;
}

const tierNo = (index: LandClipIndex, tier: LandClipTier) => index.tiers.indexOf(tier);

function loadTile(index: LandClipIndex, tier: LandClipTier, key: string): Promise<LandRing[] | null> {
  const id = `${tierNo(index, tier)}/${key}`;
  const hit = tileCache.get(id);
  if (hit) return Promise.resolve(hit);
  const fl = tileInflight.get(id);
  if (fl) return fl;
  const p = fetch(getAssetPath(`${LAND_CLIP_DIR}/${id}.json`))
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => parseLandClipTile(raw))
    .catch(() => null)
    .then((t) => {
      tileInflight.delete(id);
      if (!t) return null;
      tileCache.set(id, t.rings);
      return t.rings;
    });
  tileInflight.set(id, p);
  return p;
}

/** Recorte pronto para uma vista: anéis de todos os mosaicos + Path2D (browser). */
export interface LandClipView {
  key: string;
  zq: number;
  rings: LandRing[];
  path: Path2D | null;
}

const viewCache = new Map<string, LandClipView>();

function viewFrom(index: LandClipIndex, tier: LandClipTier, keys: string[]): LandClipView | null {
  const t = tierNo(index, tier);
  const key = `${t}|${keys.join(',')}`;
  const hit = viewCache.get(key);
  if (hit) return hit;
  const rings: LandRing[] = [];
  for (const k of keys) {
    const r = tileCache.get(`${t}/${k}`);
    if (!r) return null;
    for (const x of r) rings.push(x);
  }
  let path: Path2D | null = null;
  if (typeof Path2D !== 'undefined') {
    path = new Path2D();
    traceRings(path, rings);
  }
  const v: LandClipView = { key, zq: tier.z, rings, path };
  // Poucas vistas vivas (2 camadas × zoom actual) — cache curta.
  if (viewCache.size > 8) viewCache.delete(viewCache.keys().next().value as string);
  viewCache.set(key, v);
  return v;
}

/** Vista já carregada (síncrono) — null quando falta algum mosaico ou o índice. */
export function landClipViewSync(view: LatLonView, zoom: number): LandClipView | null {
  if (!indexValue) return null;
  const tier = tierForZoom(indexValue, zoom);
  return viewFrom(indexValue, tier, tileKeysForView(tier, view));
}

/** Carrega o que falta para a vista. null quando o índice não existe (sem recorte possível). */
/**
 * Espera máxima pelo recorte vectorial antes de os campos desenharem com a
 * máscara raster (`landMask.ts`): rede lenta ou mosaico pendurado não deixam
 * o mapa sem vento/ondulação. Quando os mosaicos chegam, repinta com o corte
 * vectorial.
 */
export const LAND_CLIP_WAIT_MS = 1500;

export async function prepareLandClip(view: LatLonView, zoom: number): Promise<LandClipView | null> {
  const index = await loadLandClipIndex();
  if (!index) return null;
  const tier = tierForZoom(index, zoom);
  const keys = tileKeysForView(tier, view);
  await Promise.all(keys.map((k) => loadTile(index, tier, k)));
  return viewFrom(index, tier, keys);
}

/**
 * Apaga a terra do canvas (`destination-out`, even-odd, anti-aliased).
 * `origin` = píxel-mundo do canto superior esquerdo do canvas ao zoom actual;
 * `dpr` = escala do backing store.
 */
export function cutLand(ctx: CanvasRenderingContext2D, lv: LandClipView, zoom: number, origin: { x: number; y: number }, dpr = 1): void {
  if (!lv.rings.length) return;
  const { s, tx, ty } = clipTransform(lv.zq, zoom, origin);
  ctx.save();
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  if (lv.path) ctx.fill(lv.path, 'evenodd');
  else {
    // Sem Path2D (render offline): traça os anéis no próprio contexto.
    ctx.beginPath();
    traceRings(ctx, lv.rings);
    ctx.fill('evenodd');
  }
  ctx.restore();
}

/** Máscara de terra no ecrã (1 = terra), à resolução do canvas / `scale`. */
export interface ScreenLandMask {
  key: string;
  w: number;
  h: number;
  scale: number;
  data: Uint8Array;
}

export function screenMaskAt(m: ScreenLandMask, x: number, y: number): boolean {
  const i = Math.floor(x / m.scale);
  const j = Math.floor(y / m.scale);
  if (i < 0 || j < 0 || i >= m.w || j >= m.h) return false;
  return m.data[j * m.w + i] === 1;
}

const maskCache: ScreenLandMask[] = [];

/** Canvas para a máscara — injectável (render offline usa node-canvas). */
type CanvasFactory = (w: number, h: number) => { getContext(id: '2d', o?: unknown): CanvasRenderingContext2D | null } | null;
const domCanvas: CanvasFactory = (w, h) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/**
 * Máscara de ecrã da vista (rasterizada do mesmo path — bate com o corte ao
 * píxel). Partilhada pelo vento (partículas) e pela ondulação (cristas,
 * rótulos, tooltip); refeita só quando a vista (zoom, origem, tamanho,
 * mosaicos) muda. null fora do browser.
 */
export function buildScreenLandMask(
  lv: LandClipView,
  zoom: number,
  origin: { x: number; y: number },
  W: number,
  H: number,
  scale = 2,
  makeCanvas: CanvasFactory = domCanvas,
): ScreenLandMask | null {
  const key = `${lv.key}|${zoom}|${Math.round(origin.x)},${Math.round(origin.y)}|${W}x${H}|${scale}`;
  const hit = maskCache.find((m) => m.key === key);
  if (hit) return hit;
  const w = Math.max(1, Math.ceil(W / scale));
  const h = Math.max(1, Math.ceil(H / scale));
  const c = makeCanvas(w, h);
  const ctx = c?.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { s, tx, ty } = clipTransform(lv.zq, zoom, origin);
  ctx.setTransform(s / scale, 0, 0, s / scale, tx / scale, ty / scale);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  traceRings(ctx, lv.rings);
  ctx.fill('evenodd');
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0, p = 3; i < data.length; i++, p += 4) data[i] = px[p] >= 128 ? 1 : 0;
  const m = { key, w, h, scale, data };
  maskCache.unshift(m);
  if (maskCache.length > 3) maskCache.pop();
  return m;
}

/** Test hook. */
export function clearLandClipCache(): void {
  indexPromise = null;
  indexValue = null;
  indexFailedAt = 0;
  tileCache.clear();
  tileInflight.clear();
  viewCache.clear();
  maskCache.length = 0;
}

/** Test hook / render offline — instala índice e mosaicos («<nível>/<chave>») já descodificados. */
export function installLandClip(index: LandClipIndex, tiles: Record<string, LandRing[]>): void {
  indexValue = index;
  for (const [k, v] of Object.entries(tiles)) tileCache.set(k, v);
}
