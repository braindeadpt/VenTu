import { getAssetPath } from '@/lib/paths';

/**
 * Grelha regular de vento + ondulação (`public/data/sea-grid.json`, gerada por
 * `scripts/build-sea-grid.js`; formato documentado em `scripts/lib/seaGrid.js`).
 *
 * Alimenta o campo de vento e a camada «Ondulação» do /mapa com dados de
 * modelo em grelha — os campos ambientais deixam de depender dos spots (e dos
 * filtros). Sem ficheiro, ou fora da janela horária, os consumidores caem no
 * caminho antigo (IDW entre spots) ou escondem a camada.
 */

export const SEA_GRID_PATH = '/data/sea-grid.json';
const MS_TO_KT = 1.943844;
const RAD = Math.PI / 180;

export interface SeaGridBox {
  id: string;
  west: number;
  south: number;
  nx: number;
  ny: number;
  /** índice do primeiro nó da caixa nos arrays descodificados (layout completo nx·ny) */
  offset: number;
  /** passo da caixa (°). v1: o `step` global. */
  step?: number;
}

/** Caixa como vem no ficheiro v2 (`offset`/`count` sobre os nós guardados). */
export interface SeaGridRawBox extends SeaGridBox {
  count?: number;
  /** base64 — bit k (LSB primeiro) = nó k da caixa guardado */
  mask?: string;
}

export interface SeaGridRaw {
  v: number;
  /** v3: esbatido (°) da borda exterior do domínio */
  fade?: number;
  generatedAt: string;
  source?: string;
  step: number;
  t0: number;
  stepHours: number;
  nt: number;
  boxes: SeaGridRawBox[];
  n: number;
  scale: { u: number; v: number; hs: number; dir: number; per: number };
  nodata: number;
  fields: { u: string; v: string; hs: string; dir: string; per: string };
}

/** Grelha descodificada: arrays [t·n + nó], NaN = sem dado. */
export interface SeaGrid {
  generatedAt: string;
  /** passo mais fino (°) */
  step: number;
  /** v1: caixas sem sobreposição, borda esbatida numa célula (comportamento antigo) */
  legacy?: boolean;
  /** formato do ficheiro (1, 2 ou 3) */
  version?: number;
  /**
   * v3: esbatido (°) da borda exterior do domínio. Terra e nós em falta
   * vêm preenchidos com o mar mais próximo (`fillFromSea`): o bilinear lê
   * valores de mar até à linha de costa e o recorte vectorial faz a costa.
   */
  fade?: number;
  /** unix s da primeira hora */
  t0: number;
  stepHours: number;
  nt: number;
  n: number;
  boxes: SeaGridBox[];
  /** vector do vento (para onde sopra), m/s */
  u: Float32Array;
  v: Float32Array;
  /** Hs (m) */
  hs: Float32Array;
  /** período (s) */
  per: Float32Array;
  /** vector unitário de PROPAGAÇÃO da ondulação (este, norte) */
  pe: Float32Array;
  pn: Float32Array;
  /**
   * v3: cobertura da ondulação por nó (0–1, sem tempo): 1 no mar do modelo e
   * até SEA_GRID_SWELL_FILL_DEG da costa; desce a 0 nos anéis seguintes —
   * onde o WW3 não tem mar (Mediterrâneo, Báltico) a cor esbate-se pela
   * distância, sem corte recto.
   */
  cov?: Float32Array;
}

/** Valores de um instante (já interpolados no tempo), por nó. */
export interface SeaGridFrame {
  tf: number;
  u: Float32Array;
  v: Float32Array;
  hs: Float32Array;
  per: Float32Array;
  pe: Float32Array;
  pn: Float32Array;
  /** extremos no mar (para legenda e escala) */
  windMinKt: number;
  windMaxKt: number;
  hsMin: number;
  hsMax: number;
}

export interface SeaSample {
  /** m/s */
  u: number;
  v: number;
  /** nós */
  kt: number;
  /** direcção DE ONDE sopra (°) */
  windFrom: number;
  /** NaN sem ondulação (terra / fora da grelha) */
  hs: number;
  per: number;
  /** direcção DE ONDE vem a ondulação (°) */
  swellFrom: number;
  pe: number;
  pn: number;
  /** peso de nós de mar válidos (0–1) — < ~0,35 é borda de costa */
  w: number;
  /** 1 no interior; desce a 0 junto à borda exterior do domínio (sem corte recto) */
  edge: number;
}

function decodeB64(s: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /* c8 ignore next — Node antigo sem atob */
  return new Uint8Array(Buffer.from(s, 'base64'));
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Prolonga Hs/período/direcção um anel de nós para dentro de terra/costa
 * (média dos vizinhos de mar). A grelha de 0,5° deixava uma faixa vazia de
 * 20–40 km junto à costa; com o anel extra o bilinear chega à linha de costa e
 * quem desenha corta terra com a máscara de terra (`pointOnLand`).
 */
export function dilateSwell(
  box: SeaGridBox,
  base: number,
  hs: Float32Array,
  per: Float32Array,
  pe: Float32Array,
  pn: Float32Array,
  rings = 1,
): void {
  const { nx, ny, offset } = box;
  for (let r = 0; r < rings; r++) {
    const fills: Array<[number, number, number, number, number]> = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = base + offset + j * nx + i;
        if (!Number.isNaN(hs[k])) continue;
        let c = 0;
        let sh = 0;
        let sp = 0;
        let se = 0;
        let sn = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
            const q = base + offset + jj * nx + ii;
            if (Number.isNaN(hs[q])) continue;
            c++;
            sh += hs[q];
            sp += per[q];
            se += pe[q];
            sn += pn[q];
          }
        }
        if (c) {
          const L = Math.hypot(se, sn) || 1;
          fills.push([k, sh / c, sp / c, se / L, sn / L]);
        }
      }
    }
    for (const [k, h, p, e, n] of fills) {
      hs[k] = h;
      per[k] = p;
      pe[k] = e;
      pn[k] = n;
    }
  }
}

/**
 * Plano de preenchimento «mar mais próximo» de uma caixa: anéis BFS
 * (8-vizinhos) a partir dos nós válidos; cada nó do anel r recebe a média dos
 * vizinhos já preenchidos (anéis < r). Calculado uma vez por caixa (a terra
 * não muda com o tempo) e aplicado a cada instante/campo.
 * `order[k]` = nó a preencher; `nbr[start[k]..start[k+1]]` = os seus dadores.
 */
export interface FillPlan {
  order: Int32Array;
  start: Int32Array;
  nbr: Int32Array;
}

export function buildFillPlan(
  nx: number,
  ny: number,
  valid: ArrayLike<number | boolean>,
  maxRings = Infinity,
  ringsOut?: Int32Array,
): FillPlan {
  const n = nx * ny;
  const ring = new Int32Array(n).fill(-1);
  let frontier: number[] = [];
  for (let q = 0; q < n; q++) {
    if (valid[q]) {
      ring[q] = 0;
      frontier.push(q);
    }
  }
  const order: number[] = [];
  const start: number[] = [0];
  const nbr: number[] = [];
  let r = 0;
  while (frontier.length && r < maxRings) {
    r++;
    const next: number[] = [];
    for (const q of frontier) {
      const i = q % nx;
      const j = (q - i) / nx;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const p = jj * nx + ii;
          if (ring[p] !== -1) continue;
          ring[p] = r;
          next.push(p);
        }
      }
    }
    for (const p of next) {
      const i = p % nx;
      const j = (p - i) / nx;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const d = jj * nx + ii;
          if (ring[d] >= 0 && ring[d] < r) nbr.push(d);
        }
      }
      order.push(p);
      start.push(nbr.length);
    }
    frontier = next;
  }
  if (ringsOut) ringsOut.set(ring);
  return { order: Int32Array.from(order), start: Int32Array.from(start), nbr: Int32Array.from(nbr) };
}

/** Aplica o plano a um campo (in place) a partir de `base`. */
export function applyFillPlan(plan: FillPlan, arr: Float32Array, base: number): void {
  const { order, start, nbr } = plan;
  for (let k = 0; k < order.length; k++) {
    let s = 0;
    let c = 0;
    for (let q = start[k]; q < start[k + 1]; q++) {
      const x = arr[base + nbr[q]];
      if (Number.isNaN(x)) continue;
      s += x;
      c++;
    }
    arr[base + order[k]] = c ? s / c : NaN;
  }
}

/**
 * Alcance (°) do preenchimento da ondulação: chega para cobrir a faixa
 * costeira que o WW3 a 0,5° deixa vazia (a célula «terra» do modelo junto à
 * costa) sem inventar ondulação em mares que o modelo não tem (Mediterrâneo,
 * Báltico). O vento enche a caixa toda — terra é cortada por vector.
 */
export const SEA_GRID_SWELL_FILL_DEG = 1.5;
/** …e esbate a cobertura nos ~1,5° seguintes. */
export const SEA_GRID_SWELL_FADE_DEG = 1.5;

/**
 * v3: preenche terra e nós em falta de todas as caixas com o mar mais
 * próximo (vento: a caixa toda; ondulação: até SEA_GRID_SWELL_FILL_DEG). A
 * direcção de propagação é renormalizada.
 */
export function fillFromSea(grid: Pick<SeaGrid, 'boxes' | 'n' | 'nt' | 'u' | 'v' | 'hs' | 'per' | 'pe' | 'pn'>): Float32Array {
  const cov = new Float32Array(grid.n);
  for (const b of grid.boxes) {
    const total = b.nx * b.ny;
    const valid = new Uint8Array(total);
    for (let q = 0; q < total; q++) valid[q] = Number.isNaN(grid.hs[b.offset + q]) ? 0 : 1;
    const wvalid = new Uint8Array(total);
    for (let q = 0; q < total; q++) wvalid[q] = Number.isNaN(grid.u[b.offset + q]) ? 0 : 1;
    const st = b.step ?? 0.5;
    const full = Math.max(1, Math.ceil(SEA_GRID_SWELL_FILL_DEG / st - 1e-9));
    const fade = Math.max(1, Math.ceil(SEA_GRID_SWELL_FADE_DEG / st - 1e-9));
    const rings = new Int32Array(total);
    const plan = buildFillPlan(b.nx, b.ny, valid, full + fade, rings);
    for (let q = 0; q < total; q++) {
      const r = rings[q];
      cov[b.offset + q] = r < 0 ? 0 : r <= full ? 1 : Math.max(0, 1 - (r - full) / (fade + 1));
    }
    const wplan = buildFillPlan(b.nx, b.ny, wvalid);
    for (let t = 0; t < grid.nt; t++) {
      const base = t * grid.n + b.offset;
      applyFillPlan(wplan, grid.u, base);
      applyFillPlan(wplan, grid.v, base);
      applyFillPlan(plan, grid.hs, base);
      applyFillPlan(plan, grid.per, base);
      applyFillPlan(plan, grid.pe, base);
      applyFillPlan(plan, grid.pn, base);
      for (let k = 0; k < plan.order.length; k++) {
        const o = base + plan.order[k];
        const L = Math.hypot(grid.pe[o], grid.pn[o]);
        if (L > 1e-6) {
          grid.pe[o] /= L;
          grid.pn[o] /= L;
        }
      }
    }
  }
  return cov;
}

const MAX_BOX_NODES = 200_000;

/**
 * Valida e descodifica o JSON publicado (v1 ou v2). null quando a forma não
 * bate. Os nós não guardados (máscara v2) ficam NaN — o amostrador cai na
 * caixa mais grossa.
 */
export function parseSeaGrid(raw: unknown): SeaGrid | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SeaGridRaw>;
  if ((r.v !== 1 && r.v !== 2 && r.v !== 3) || !isNum(r.n) || !isNum(r.nt) || !isNum(r.t0) || !isNum(r.step) || r.step <= 0) return null;
  if (!Array.isArray(r.boxes) || !r.boxes.length || !r.fields || !r.scale) return null;
  const v2 = r.v === 2 || r.v === 3;
  const v3 = r.v === 3;
  const packedN = r.n;
  const nt = r.nt;
  // Índice completo de cada nó guardado (k empacotado → índice no layout nx·ny).
  const boxes: SeaGridBox[] = [];
  const fullIndex: number[] = [];
  let packed = 0;
  let full = 0;
  for (const b of r.boxes) {
    if (!b || !isNum(b.nx) || !isNum(b.ny) || !isNum(b.west) || !isNum(b.south) || b.offset !== packed) return null;
    const total = b.nx * b.ny;
    if (b.nx < 2 || b.ny < 2 || total > MAX_BOX_NODES) return null;
    const step = v2 && isNum(b.step) && b.step > 0 ? b.step : r.step;
    if (v2 && typeof b.mask === 'string') {
      const bits = decodeB64(b.mask);
      if (bits.length < Math.ceil(total / 8)) return null;
      let c = 0;
      for (let q = 0; q < total; q++) {
        if (bits[q >> 3] & (1 << (q & 7))) {
          fullIndex.push(full + q);
          c++;
        }
      }
      if (isNum(b.count) && b.count !== c) return null;
      packed += c;
    } else {
      if (v2 && isNum(b.count) && b.count !== total) return null;
      for (let q = 0; q < total; q++) fullIndex.push(full + q);
      packed += total;
    }
    boxes.push({ id: String(b.id), west: b.west, south: b.south, nx: b.nx, ny: b.ny, offset: full, step });
    full += total;
  }
  if (packed !== packedN || nt < 2) return null;
  const nodata = isNum(r.nodata) ? r.nodata : 255;
  const f = r.fields;
  const bytes = { u: f.u, v: f.v, hs: f.hs, dir: f.dir, per: f.per };
  const dec: Record<string, Uint8Array> = {};
  for (const [k, s] of Object.entries(bytes)) {
    if (typeof s !== 'string') return null;
    const a = decodeB64(s);
    if (a.length !== packedN * nt) return null;
    dec[k] = a;
  }
  const sc = r.scale;
  const n = full;
  const len = n * nt;
  const u = new Float32Array(len).fill(NaN);
  const v = new Float32Array(len).fill(NaN);
  const hs = new Float32Array(len).fill(NaN);
  const per = new Float32Array(len).fill(NaN);
  const pe = new Float32Array(len).fill(NaN);
  const pn = new Float32Array(len).fill(NaN);
  for (let t = 0; t < nt; t++) {
    const P = t * packedN;
    const F = t * n;
    for (let k = 0; k < packedN; k++) {
      const i = P + k;
      const o = F + fullIndex[k];
      const bu = dec.u[i];
      const bv = dec.v[i];
      if (bu !== nodata && bv !== nodata) {
        u[o] = (bu - 128) * sc.u;
        v[o] = (bv - 128) * sc.v;
      }
      const bh = dec.hs[i];
      const bd = dec.dir[i];
      const bp = dec.per[i];
      if (bh === nodata || bd === nodata || bp === nodata) continue;
      hs[o] = bh * sc.hs;
      per[o] = bp * sc.per;
      // de onde VEM → propaga para dir+180
      const from = bd * sc.dir * RAD;
      pe[o] = -Math.sin(from);
      pn[o] = -Math.cos(from);
    }
  }
  let cov: Float32Array | undefined;
  if (v3) {
    cov = fillFromSea({ boxes, n, nt, u, v, hs, per, pe, pn });
  } else {
    for (let t = 0; t < nt; t++) {
      for (const b of boxes) dilateSwell(b, t * n, hs, per, pe, pn, 1);
    }
  }
  return {
    generatedAt: String(r.generatedAt ?? ''),
    step: Math.min(...boxes.map((b) => b.step ?? r.step!)),
    legacy: !v2,
    version: r.v,
    ...(v3 ? { fade: isNum(r.fade) && r.fade > 0 ? r.fade : SEA_GRID_V3_FADE_DEG } : {}),
    t0: r.t0,
    stepHours: isNum(r.stepHours) && r.stepHours > 0 ? r.stepHours : 1,
    nt,
    n,
    boxes,
    u,
    v,
    hs,
    per,
    pe,
    pn,
    ...(cov ? { cov } : {}),
  };
}

/**
 * Hora local de Lisboa «YYYY-MM-DDTHH:MM» (formato do map-hours.json) →
 * epoch ms. Resolve o desvio WET/WEST pelo próprio Intl.
 */
export function lisbonLocalToEpochMs(local: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offsetAt = (ms: number): number => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Lisbon',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .formatToParts(new Date(ms))
        .map((x) => [x.type, x.value]),
    );
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return wall - ms;
  };
  let guess = asUtc - offsetAt(asUtc);
  guess = asUtc - offsetAt(guess);
  return guess;
}

/**
 * Índice temporal fraccionário da grelha para `epochMs`; null fora da janela
 * (tolerância de meia hora nas pontas — «Agora» às 14:20 com t0 às 14:00).
 */
export function seaGridTimeIndex(grid: Pick<SeaGrid, 't0' | 'stepHours' | 'nt'>, epochMs: number): number | null {
  const tf = (epochMs / 1000 - grid.t0) / (grid.stepHours * 3600);
  if (!Number.isFinite(tf) || tf < -0.5 || tf > grid.nt - 0.5) return null;
  return Math.max(0, Math.min(grid.nt - 1, tf));
}

/** Interpola no tempo e devolve o instante `tf` (reutiliza `out` quando dado). */
export function seaGridFrame(grid: SeaGrid, tf: number, out?: SeaGridFrame): SeaGridFrame {
  const { n } = grid;
  const fr: SeaGridFrame =
    out && out.u.length === n
      ? out
      : {
          tf: -1,
          u: new Float32Array(n),
          v: new Float32Array(n),
          hs: new Float32Array(n),
          per: new Float32Array(n),
          pe: new Float32Array(n),
          pn: new Float32Array(n),
          windMinKt: 0,
          windMaxKt: 0,
          hsMin: 0,
          hsMax: 0,
        };
  const t = Math.max(0, Math.min(grid.nt - 1, tf));
  const a = Math.floor(t);
  const b = Math.min(a + 1, grid.nt - 1);
  const w = t - a;
  const w0 = 1 - w;
  const A = a * n;
  const B = b * n;
  let wMin = Infinity;
  let wMax = 0;
  let hMin = Infinity;
  let hMax = 0;
  for (let k = 0; k < n; k++) {
    const u = grid.u[A + k] * w0 + grid.u[B + k] * w;
    const v = grid.v[A + k] * w0 + grid.v[B + k] * w;
    fr.u[k] = u;
    fr.v[k] = v;
    const ha = grid.hs[A + k];
    const hb = grid.hs[B + k];
    if (Number.isNaN(ha) || Number.isNaN(hb)) {
      const only = Number.isNaN(ha) ? B + k : A + k;
      fr.hs[k] = grid.hs[only];
      fr.per[k] = grid.per[only];
      fr.pe[k] = grid.pe[only];
      fr.pn[k] = grid.pn[only];
    } else {
      fr.hs[k] = ha * w0 + hb * w;
      fr.per[k] = grid.per[A + k] * w0 + grid.per[B + k] * w;
      const e = grid.pe[A + k] * w0 + grid.pe[B + k] * w;
      const nn = grid.pn[A + k] * w0 + grid.pn[B + k] * w;
      const L = Math.hypot(e, nn) || 1;
      fr.pe[k] = e / L;
      fr.pn[k] = nn / L;
    }
    const kt = Math.hypot(u, v) * MS_TO_KT;
    if (Number.isFinite(kt)) {
      if (kt < wMin) wMin = kt;
      if (kt > wMax) wMax = kt;
    }
    const h = fr.hs[k];
    if (!Number.isNaN(h)) {
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }
  fr.tf = t;
  fr.windMinKt = Number.isFinite(wMin) ? wMin : 0;
  fr.windMaxKt = wMax;
  fr.hsMin = Number.isFinite(hMin) ? hMin : 0;
  fr.hsMax = hMax;
  return fr;
}

type GridGeom = Pick<SeaGrid, 'boxes' | 'step'> & { legacy?: boolean; fade?: number; cov?: Float32Array };

/**
 * Domínio da grelha v3 (scripts/lib/seaGrid.js TIERS, caixa «ocean»): o
 * Atlântico Norte inteiro + Mediterrâneo + mar do Norte, esbatido 4° na borda.
 * O /mapa fullscreen limita pan/zoom-out ao INTERIOR do esbatido
 * (`SEA_DOMAIN_VIEW_BOUNDS`) — a borda do campo nunca chega ao ecrã.
 */
export const SEA_GRID_V3_FADE_DEG = 4;
export const SEA_DOMAIN = Object.freeze({ south: 0, north: 72, west: -100, east: 44 });
/** Zoom-out mínimo absoluto do /mapa fullscreen (o real é o do encaixe da vista). */
export const SEA_DOMAIN_MIN_ZOOM = 3;
export const SEA_DOMAIN_VIEW_BOUNDS = Object.freeze({
  south: SEA_DOMAIN.south + SEA_GRID_V3_FADE_DEG,
  north: SEA_DOMAIN.north - SEA_GRID_V3_FADE_DEG,
  west: SEA_DOMAIN.west + SEA_GRID_V3_FADE_DEG,
  east: SEA_DOMAIN.east - SEA_GRID_V3_FADE_DEG,
});

const boxStep = (grid: GridGeom, b: SeaGridBox): number => b.step ?? grid.step;

/** Feather da borda exterior do domínio (v2): ~1° até à cor cheia (v3: `fade`, 4°). */
export const SEA_GRID_OUTER_FEATHER_DEG = 1;
/** Fusão fina → grossa: 2 células finas para dentro da borda da caixa fina. */
export const SEA_GRID_BLEND_CELLS = 2;

/**
 * Extensão da caixa: v2 = envelope dos nós (o feather/fusão começa no último
 * nó); v1 = meia célula para lá dos nós (comportamento antigo).
 */
function boxHull(grid: GridGeom, b: SeaGridBox): { w: number; s: number; e: number; n: number } {
  const st = boxStep(grid, b);
  const pad = grid.legacy ? st / 2 : 0;
  return {
    w: b.west - pad,
    s: b.south - pad,
    e: b.west + (b.nx - 1) * st + pad,
    n: b.south + (b.ny - 1) * st + pad,
  };
}

/** Envelope de todas as caixas — o domínio que os campos varrem. */
export function seaGridExtent(grid: GridGeom): { west: number; south: number; east: number; north: number } {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const b of grid.boxes) {
    const h = boxHull(grid, b);
    west = Math.min(west, h.w);
    south = Math.min(south, h.s);
    east = Math.max(east, h.e);
    north = Math.max(north, h.n);
  }
  return { west, south, east, north };
}

interface BoxGeom {
  b: SeaGridBox;
  st: number;
  w: number;
  s: number;
  e: number;
  n: number;
}

/** Caixas ordenadas da mais fina para a mais grossa, com o envelope — por grelha. */
const geomCache = new WeakMap<SeaGridBox[], { legacy: boolean; step: number; list: BoxGeom[] }>();


function sortedGeom(grid: GridGeom): BoxGeom[] {
  const legacy = !!grid.legacy;
  const hit = geomCache.get(grid.boxes);
  if (hit && hit.legacy === legacy && hit.step === grid.step) return hit.list;
  const list = grid.boxes
    .map((b) => {
      const h = boxHull(grid, b);
      return { b, st: boxStep(grid, b), w: h.w, s: h.s, e: h.e, n: h.n };
    })
    .sort((a, c) => a.st - c.st);
  geomCache.set(grid.boxes, { legacy, step: grid.step, list });
  return list;
}

/** Caixas que contêm (lat, lon), da mais fina para a mais grossa. */
function boxesAt(grid: GridGeom, lat: number, lon: number, out: BoxGeom[]): BoxGeom[] {
  out.length = 0;
  for (const g of sortedGeom(grid)) {
    if (lon >= g.w && lon <= g.e && lat >= g.s && lat <= g.n) out.push(g);
  }
  return out;
}

/** Caixa mais fina que contém (lat, lon). */
export function seaGridBoxAt(grid: GridGeom, lat: number, lon: number): SeaGridBox | null {
  return boxesAt(grid, lat, lon, [])[0]?.b ?? null;
}

const smooth = (x: number): number => {
  const t = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

interface Bilinear {
  wu: number;
  su: number;
  sv: number;
  wh: number;
  sh: number;
  sp: number;
  se: number;
  sn: number;
}

function bilinear(grid: GridGeom, b: SeaGridBox, frame: SeaGridFrame, lat: number, lon: number, o: Bilinear): Bilinear {
  const cov = grid.cov;
  const st = boxStep(grid, b);
  const gi = Math.max(0, Math.min(b.nx - 1.000001, (lon - b.west) / st));
  const gj = Math.max(0, Math.min(b.ny - 1.000001, (lat - b.south) / st));
  const i = Math.floor(gi);
  const j = Math.floor(gj);
  const fx = gi - i;
  const fy = gj - j;
  const k00 = b.offset + j * b.nx + i;
  o.wu = o.su = o.sv = o.wh = o.sh = o.sp = o.se = o.sn = 0;
  for (let q = 0; q < 4; q++) {
    const k = q === 0 ? k00 : q === 1 ? k00 + 1 : q === 2 ? k00 + b.nx : k00 + b.nx + 1;
    const w = q === 0 ? (1 - fx) * (1 - fy) : q === 1 ? fx * (1 - fy) : q === 2 ? (1 - fx) * fy : fx * fy;
    if (w <= 0) continue;
    const u = frame.u[k];
    const v = frame.v[k];
    if (!Number.isNaN(u) && !Number.isNaN(v)) {
      o.wu += w;
      o.su += u * w;
      o.sv += v * w;
    }
    const h = frame.hs[k];
    if (!Number.isNaN(h)) {
      // v3: o peso do nó escala com a cobertura (esbatido longe do mar do modelo).
      const wc = cov ? w * cov[k] : w;
      o.wh += wc;
      o.sh += h * wc;
      o.sp += frame.per[k] * wc;
      o.se += frame.pe[k] * wc;
      o.sn += frame.pn[k] * wc;
    }
  }
  return o;
}

const scratchBoxes: BoxGeom[] = [];
const scratchBil: Bilinear = { wu: 0, su: 0, sv: 0, wh: 0, sh: 0, sp: 0, se: 0, sn: 0 };

/**
 * Amostragem bilinear multi-caixa. Prefere a caixa mais fina e funde-a na
 * mais grossa ao longo das últimas `SEA_GRID_BLEND_CELLS` células finas (e
 * onde a fina não tem nós — mar aberto longe da costa, terra), por isso não
 * há costuras. Vento e ondulação ignoram nós sem dado (pesos renormalizados);
 * `w` diz quanto do ponto era mar válido — quem desenha usa isso para esbater
 * a costa. `edge` esbate a borda exterior do domínio (~1°; v1: uma célula).
 * null fora de todas as caixas.
 */
export function sampleSeaGrid(
  grid: GridGeom,
  frame: SeaGridFrame,
  lat: number,
  lon: number,
  out?: SeaSample,
): SeaSample | null {
  const list = boxesAt(grid, lat, lon, scratchBoxes);
  if (!list.length) return null;
  let remW = 1;
  let aw = 0;
  let su = 0;
  let sv = 0;
  let remS = 1;
  let as = 0;
  let sh = 0;
  let sp = 0;
  let se = 0;
  let sn = 0;
  let edge = 1;
  for (let q = 0; q < list.length; q++) {
    const h = list[q];
    const b = h.b;
    const last = q === list.length - 1;
    const st = h.st;
    const d = Math.min(lon - h.w, h.e - lon, lat - h.s, h.n - lat);
    const f = last ? 1 : smooth(d / (SEA_GRID_BLEND_CELLS * st));
    if (last) {
      const feather = grid.legacy ? st : Math.max(st, grid.fade ?? SEA_GRID_OUTER_FEATHER_DEG);
      edge = Math.max(0, Math.min(1, d / feather));
    }
    if (f <= 0) continue;
    const r = bilinear(grid, b, frame, lat, lon, scratchBil);
    if (r.wu > 1e-6 && remW > 1e-6) {
      const a = remW * f * (last ? 1 : Math.min(1, r.wu));
      su += (r.su / r.wu) * a;
      sv += (r.sv / r.wu) * a;
      aw += a;
      remW -= a;
    }
    if (r.wh > 1e-6 && remS > 1e-6) {
      const a = remS * f * Math.min(1, r.wh);
      sh += (r.sh / r.wh) * a;
      sp += (r.sp / r.wh) * a;
      se += (r.se / r.wh) * a;
      sn += (r.sn / r.wh) * a;
      as += a;
      remS -= a;
    }
  }
  const o: SeaSample = out ?? {
    u: 0, v: 0, kt: 0, windFrom: 0, hs: NaN, per: NaN, swellFrom: 0, pe: 0, pn: 0, w: 0, edge: 1,
  };
  o.edge = edge;
  if (aw > 1e-6) {
    o.u = su / aw;
    o.v = sv / aw;
  } else {
    o.u = NaN;
    o.v = NaN;
  }
  o.kt = Math.hypot(o.u, o.v) * MS_TO_KT;
  o.windFrom = ((Math.atan2(-o.u, -o.v) / RAD) + 360) % 360;
  o.w = as;
  if (as > 1e-6) {
    o.hs = sh / as;
    o.per = sp / as;
    const L = Math.hypot(se, sn) || 1;
    o.pe = se / L;
    o.pn = sn / L;
    o.swellFrom = ((Math.atan2(-o.pe, -o.pn) / RAD) + 360) % 360;
  } else {
    o.hs = NaN;
    o.per = NaN;
    o.pe = 0;
    o.pn = 0;
    o.swellFrom = 0;
  }
  return o;
}

/** Idade máxima aceitável: a janela publicada é de 54 h; 30 h de atraso ainda cobre as 24 h seguintes. */
export const SEA_GRID_MAX_AGE_MS = 30 * 3600_000;
/** Falhas (404/rede) voltam a tentar ao fim de 10 min — nunca ficam presas. */
const FAIL_TTL_MS = 10 * 60_000;
const OK_TTL_MS = 30 * 60_000;

let cache: { at: number; grid: SeaGrid | null } | null = null;
let inflight: Promise<SeaGrid | null> | null = null;

export async function fetchSeaGrid(now: number = Date.now()): Promise<SeaGrid | null> {
  if (cache && now - cache.at < (cache.grid ? OK_TTL_MS : FAIL_TTL_MS)) return cache.grid;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(getAssetPath(SEA_GRID_PATH));
      if (!res.ok) return null;
      const grid = parseSeaGrid(await res.json());
      if (!grid) return null;
      const age = now - Date.parse(grid.generatedAt);
      if (Number.isFinite(age) && age > SEA_GRID_MAX_AGE_MS) return null;
      return grid;
    } catch {
      return null;
    }
  })()
    .then((g) => {
      cache = { at: Date.now(), grid: g };
      return g;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test hook. */
export function clearSeaGridCache(): void {
  cache = null;
  inflight = null;
}
