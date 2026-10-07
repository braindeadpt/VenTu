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
  offset: number;
}

export interface SeaGridRaw {
  v: number;
  generatedAt: string;
  source?: string;
  step: number;
  t0: number;
  stepHours: number;
  nt: number;
  boxes: SeaGridBox[];
  n: number;
  scale: { u: number; v: number; hs: number; dir: number; per: number };
  nodata: number;
  fields: { u: string; v: string; hs: string; dir: string; per: string };
}

/** Grelha descodificada: arrays [t·n + nó], NaN = sem dado. */
export interface SeaGrid {
  generatedAt: string;
  step: number;
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
  /** 1 no interior; desce a 0 na última célula até à borda da caixa (sem corte recto) */
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
 * quem desenha corta terra com a máscara GADM (`pointOnLand`).
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

/** Valida e descodifica o JSON publicado. null quando a forma não bate. */
export function parseSeaGrid(raw: unknown): SeaGrid | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SeaGridRaw>;
  if (r.v !== 1 || !isNum(r.n) || !isNum(r.nt) || !isNum(r.t0) || !isNum(r.step) || r.step <= 0) return null;
  if (!Array.isArray(r.boxes) || !r.boxes.length || !r.fields || !r.scale) return null;
  const n = r.n;
  const nt = r.nt;
  let total = 0;
  for (const b of r.boxes) {
    if (!b || !isNum(b.nx) || !isNum(b.ny) || !isNum(b.west) || !isNum(b.south) || b.offset !== total) return null;
    total += b.nx * b.ny;
  }
  if (total !== n || nt < 2) return null;
  const nodata = isNum(r.nodata) ? r.nodata : 255;
  const f = r.fields;
  const bytes = { u: f.u, v: f.v, hs: f.hs, dir: f.dir, per: f.per };
  const dec: Record<string, Uint8Array> = {};
  for (const [k, s] of Object.entries(bytes)) {
    if (typeof s !== 'string') return null;
    const a = decodeB64(s);
    if (a.length !== n * nt) return null;
    dec[k] = a;
  }
  const sc = r.scale;
  const len = n * nt;
  const u = new Float32Array(len);
  const v = new Float32Array(len);
  const hs = new Float32Array(len);
  const per = new Float32Array(len);
  const pe = new Float32Array(len);
  const pn = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const bu = dec.u[i];
    const bv = dec.v[i];
    u[i] = bu === nodata ? NaN : (bu - 128) * sc.u;
    v[i] = bv === nodata ? NaN : (bv - 128) * sc.v;
    const bh = dec.hs[i];
    const bd = dec.dir[i];
    const bp = dec.per[i];
    if (bh === nodata || bd === nodata || bp === nodata) {
      hs[i] = NaN;
      per[i] = NaN;
      pe[i] = NaN;
      pn[i] = NaN;
      continue;
    }
    hs[i] = bh * sc.hs;
    per[i] = bp * sc.per;
    // de onde VEM → propaga para dir+180
    const from = bd * sc.dir * RAD;
    pe[i] = -Math.sin(from);
    pn[i] = -Math.cos(from);
  }
  for (let t = 0; t < nt; t++) {
    for (const b of r.boxes) dilateSwell(b, t * n, hs, per, pe, pn, 1);
  }
  return {
    generatedAt: String(r.generatedAt ?? ''),
    step: r.step,
    t0: r.t0,
    stepHours: isNum(r.stepHours) && r.stepHours > 0 ? r.stepHours : 1,
    nt,
    n,
    boxes: r.boxes.map((b) => ({ ...b })),
    u,
    v,
    hs,
    per,
    pe,
    pn,
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

/** Caixa que contém (lat, lon) — o domínio vai meia célula para lá dos nós. */
export function seaGridBoxAt(grid: Pick<SeaGrid, 'boxes' | 'step'>, lat: number, lon: number): SeaGridBox | null {
  const h = grid.step / 2;
  for (const b of grid.boxes) {
    const e = b.west + (b.nx - 1) * grid.step;
    const nth = b.south + (b.ny - 1) * grid.step;
    if (lon >= b.west - h && lon <= e + h && lat >= b.south - h && lat <= nth + h) return b;
  }
  return null;
}

/**
 * Amostragem bilinear. Vento e ondulação ignoram nós sem dado (pesos
 * renormalizados); `w` diz quanta da célula era mar válido — quem desenha usa
 * isso para esbater a borda. null fora de todas as caixas.
 */
export function sampleSeaGrid(
  grid: Pick<SeaGrid, 'boxes' | 'step'>,
  frame: SeaGridFrame,
  lat: number,
  lon: number,
  out?: SeaSample,
): SeaSample | null {
  const b = seaGridBoxAt(grid, lat, lon);
  if (!b) return null;
  const half = grid.step / 2;
  const dx = Math.min(lon - (b.west - half), b.west + (b.nx - 1) * grid.step + half - lon);
  const dy = Math.min(lat - (b.south - half), b.south + (b.ny - 1) * grid.step + half - lat);
  const edge = Math.max(0, Math.min(1, Math.min(dx, dy) / grid.step));
  const gi = Math.max(0, Math.min(b.nx - 1.000001, (lon - b.west) / grid.step));
  const gj = Math.max(0, Math.min(b.ny - 1.000001, (lat - b.south) / grid.step));
  const i = Math.floor(gi);
  const j = Math.floor(gj);
  const fx = gi - i;
  const fy = gj - j;
  const k00 = b.offset + j * b.nx + i;
  const ks = [k00, k00 + 1, k00 + b.nx, k00 + b.nx + 1];
  const ws = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  let wu = 0;
  let su = 0;
  let sv = 0;
  let wh = 0;
  let sh = 0;
  let sp = 0;
  let se = 0;
  let sn = 0;
  for (let q = 0; q < 4; q++) {
    const k = ks[q];
    const w = ws[q];
    if (w <= 0) continue;
    const u = frame.u[k];
    const v = frame.v[k];
    if (!Number.isNaN(u) && !Number.isNaN(v)) {
      wu += w;
      su += u * w;
      sv += v * w;
    }
    const h = frame.hs[k];
    if (!Number.isNaN(h)) {
      wh += w;
      sh += h * w;
      sp += frame.per[k] * w;
      se += frame.pe[k] * w;
      sn += frame.pn[k] * w;
    }
  }
  const o: SeaSample = out ?? {
    u: 0, v: 0, kt: 0, windFrom: 0, hs: NaN, per: NaN, swellFrom: 0, pe: 0, pn: 0, w: 0, edge: 1,
  };
  o.edge = edge;
  if (wu > 1e-6) {
    o.u = su / wu;
    o.v = sv / wu;
  } else {
    o.u = NaN;
    o.v = NaN;
  }
  o.kt = Math.hypot(o.u, o.v) * MS_TO_KT;
  o.windFrom = ((Math.atan2(-o.u, -o.v) / RAD) + 360) % 360;
  o.w = wh;
  if (wh > 1e-6) {
    o.hs = sh / wh;
    o.per = sp / wh;
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
