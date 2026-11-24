/**
 * Pele v6 do /mapa, PR B7 — o vento em traços (maquete `mapa.html`, função
 * `Vento`), por cima da MESMA simulação de hoje (grelha em fatias da #278,
 * advecção, recorte da terra, pausa por inactividade, fade no gesto).
 *
 * O que muda é só o desenho:
 *  - cada partícula guarda as últimas posições no ecrã (a cauda) e o canvas é
 *    limpo a cada frame, em vez do rasto por `destination-in`;
 *  - a cauda é desenhada em três troços de alfa (0,12 → 0,38 → 1), da cauda
 *    para a cabeça — a aproximação barata do degradê da maquete;
 *  - a cor vai do gelo (#7FE7FF) à espuma (#F3F8FB) entre 6 e 20 nós, e o alfa
 *    e a espessura sobem com a força (`corV`, `alfa`, `largura` da maquete);
 *  - os traços agrupam-se por cor e troço: no máximo 3 × WIND_V6_BINS strokes
 *    por frame, seja qual for o número de partículas.
 * Com `prefers-reduced-motion`: uma grelha estática de traços com cabeça
 * (`estatico()` da maquete), sem loop.
 *
 * Puro (sem Leaflet nem DOM), para testar sem browser.
 */

/** Pontos de cauda por partícula a ~30 fps (≈ 0,6 s / 0,47 s). */
export const WIND_V6_TAIL = 18;
export const WIND_V6_TAIL_MOBILE = 14;
/** Degraus de cor entre o gelo e a espuma. */
export const WIND_V6_BINS = 8;
/** Alfa de cada troço da cauda (cauda → meio → cabeça). */
export const WIND_V6_STAGE_ALPHA = [0.12, 0.38, 1] as const;
/** Alfa global da maquete (`alfa: .72`). */
export const WIND_V6_ALPHA = 0.72;
/** Nós em que o traço atinge o alfa e a espessura máximos (`vref` 44 px/s ÷ 2,1). */
export const WIND_V6_KT_REF = 21;

const GELO = [127, 231, 255] as const;
const ESPUMA = [243, 248, 251] as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Cor do traço em «r g b» (6 nós ou menos = gelo, 20 ou mais = espuma). */
export function windV6Rgb(kt: number): string {
  const k = clamp01((kt - 6) / 14);
  return GELO.map((c, i) => Math.round(c + (ESPUMA[i] - c) * k)).join(' ');
}

export function windV6Bin(kt: number): number {
  const k = clamp01((kt - 6) / 14);
  return Math.min(WIND_V6_BINS - 1, Math.floor(k * WIND_V6_BINS));
}

/** Nó representativo de um degrau (centro do intervalo). */
export function windV6BinKt(bin: number): number {
  return 6 + ((bin + 0.5) / WIND_V6_BINS) * 14;
}

/** Alfa da cabeça do traço: vento fraco ténue, nortada quase branca. */
export function windV6Alpha(kt: number): number {
  return WIND_V6_ALPHA * Math.min(1, 0.28 + (0.72 * kt) / WIND_V6_KT_REF);
}

export function windV6Width(kt: number, mobile: boolean): number {
  return (mobile ? 1.3 : 1.5) * (0.8 + 0.5 * clamp01(kt / WIND_V6_KT_REF));
}

export interface WindV6Particle {
  lat: number;
  lon: number;
  kt: number;
  /** Posições no ecrã [x0, y0, x1, y1, …], da mais antiga para a cabeça. */
  tail?: number[];
}

/** Acrescenta a cabeça e corta a cauda ao comprimento máximo. */
export function pushWindV6Tail(p: WindV6Particle, x: number, y: number, max: number): number[] {
  const t = p.tail ?? (p.tail = []);
  const n = t.length;
  // Um salto grande (renascimento sem limpar a cauda) não vira um risco no ecrã.
  if (n >= 2 && Math.abs(t[n - 2] - x) + Math.abs(t[n - 1] - y) > 60) t.length = 0;
  t.push(x, y);
  const over = t.length - max * 2;
  if (over > 0) {
    // copyWithin + trim: o splice realocava a cauda em cada frame de cada
    // partícula — pressão de GC que, com CPU estrangulada (runner 4×),
    // empurrava o frame para lá dos 50 ms de long task (#464).
    t.copyWithin(0, over);
    t.length = max * 2;
  }
  return t;
}

/** Troço (0, 1, 2) do segmento i de uma cauda com `segs` segmentos. */
export function windV6Stage(i: number, segs: number): number {
  return Math.min(2, Math.floor((i * 3) / Math.max(1, segs)));
}

export interface WindV6Buckets {
  /** buckets[bin * 3 + stage] = [x0, y0, x1, y1, …] */
  segs: number[][];
  /** espessura de cada degrau */
  widths: number[];
}

/**
 * Projecta cada partícula, avança a cauda e agrupa os segmentos por degrau de
 * cor e troço. Segmentos fora do ecrã (com 8 px de folga) ficam de fora.
 */
export function bucketWindV6(
  particles: WindV6Particle[],
  project: (lat: number, lon: number) => { x: number; y: number },
  view: { width: number; height: number },
  maxTail: number,
  mobile: boolean,
  out?: WindV6Buckets,
): WindV6Buckets {
  // `out` reutilizável: o chamador do loop de animação passa a mesma estrutura
  // em todos os frames — sem as 24 alocações frescas por frame (#464).
  const segs: number[][] = out?.segs ?? [];
  for (let i = 0; i < WIND_V6_BINS * 3; i++) (segs[i] ??= []).length = 0;
  const widths = out?.widths ?? new Array<number>(WIND_V6_BINS);
  for (let b = 0; b < WIND_V6_BINS; b++) widths[b] = windV6Width(windV6BinKt(b), mobile);
  const maxX = view.width + 8;
  const maxY = view.height + 8;
  for (const p of particles) {
    const pt = project(p.lat, p.lon);
    const t = pushWindV6Tail(p, pt.x, pt.y, maxTail);
    const n = t.length / 2;
    if (n < 2) continue;
    const bin = windV6Bin(p.kt);
    const nSeg = n - 1;
    for (let i = 0; i < nSeg; i++) {
      const x0 = t[i * 2];
      const y0 = t[i * 2 + 1];
      const x1 = t[i * 2 + 2];
      const y1 = t[i * 2 + 3];
      if ((x1 < -8 && x0 < -8) || (y1 < -8 && y0 < -8) || (x1 > maxX && x0 > maxX) || (y1 > maxY && y0 > maxY)) continue;
      segs[bin * 3 + windV6Stage(i, nSeg)].push(x0, y0, x1, y1);
    }
  }
  return { segs, widths };
}

/** Um frame animado: limpa e desenha os traços agrupados. */
export function drawWindV6(
  ctx: CanvasRenderingContext2D,
  particles: WindV6Particle[],
  project: (lat: number, lon: number) => { x: number; y: number },
  view: { width: number; height: number },
  maxTail: number,
  mobile: boolean,
  out?: WindV6Buckets,
): number {
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const { segs, widths } = bucketWindV6(particles, project, view, maxTail, mobile, out);
  let strokes = 0;
  for (let b = 0; b < WIND_V6_BINS; b++) {
    const kt = windV6BinKt(b);
    const rgb = windV6Rgb(kt);
    const head = windV6Alpha(kt);
    ctx.lineWidth = widths[b];
    for (let s = 0; s < 3; s++) {
      const arr = segs[b * 3 + s];
      if (!arr.length) continue;
      ctx.strokeStyle = `rgb(${rgb} / ${(head * WIND_V6_STAGE_ALPHA[s]).toFixed(3)})`;
      ctx.beginPath();
      for (let q = 0; q < arr.length; q += 4) {
        ctx.moveTo(arr[q], arr[q + 1]);
        ctx.lineTo(arr[q + 2], arr[q + 3]);
      }
      ctx.stroke();
      strokes++;
    }
  }
  return strokes;
}

/** Vento num ponto do ecrã: u para leste, v para norte (m/s) e força em nós. */
export interface WindV6Sample {
  u: number;
  v: number;
  kt: number;
}

export interface WindV6Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kt: number;
}

/**
 * Grelha estática (reduced-motion): um traço por célula em quincôncio, na
 * direcção para onde o vento sopra, comprimento e alfa pela força.
 */
export function windV6StaticArrows(
  width: number,
  height: number,
  sampleAt: (x: number, y: number) => WindV6Sample | null,
  mobile: boolean,
): WindV6Arrow[] {
  const s = mobile ? 38 : 48;
  const out: WindV6Arrow[] = [];
  let row = 0;
  for (let y = s / 2; y < height; y += s, row++) {
    for (let x = s / 2 + (row % 2) * (s / 2); x < width; x += s) {
      const w = sampleAt(x, y);
      if (!w) continue;
      const m = Math.hypot(w.u, w.v);
      if (m < 0.05) continue;
      // ecrã: y cresce para sul
      const ux = w.u / m;
      const uy = -w.v / m;
      const L = Math.min(s * 0.85, 8 + w.kt * 0.95);
      out.push({ x1: x - (ux * L) / 2, y1: y - (uy * L) / 2, x2: x + (ux * L) / 2, y2: y + (uy * L) / 2, kt: w.kt });
    }
  }
  return out;
}

export function drawWindV6Static(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sampleAt: (x: number, y: number) => WindV6Sample | null,
  mobile: boolean,
): number {
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const arrows = windV6StaticArrows(width, height, sampleAt, mobile);
  for (const a of arrows) {
    const alpha = WIND_V6_ALPHA * Math.min(0.85, 0.35 + (0.5 * a.kt) / WIND_V6_KT_REF);
    ctx.strokeStyle = `rgb(${windV6Rgb(a.kt)} / ${alpha.toFixed(2)})`;
    ctx.lineWidth = (mobile ? 1.3 : 1.5) * 1.1;
    const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
    const k = 4.5;
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    ctx.lineTo(a.x2, a.y2);
    ctx.moveTo(a.x2 - k * Math.cos(ang - 0.55), a.y2 - k * Math.sin(ang - 0.55));
    ctx.lineTo(a.x2, a.y2);
    ctx.lineTo(a.x2 - k * Math.cos(ang + 0.55), a.y2 - k * Math.sin(ang + 0.55));
    ctx.stroke();
  }
  return arrows.length;
}

/**
 * #458 · rampa da legenda «Vento» na pele v6: a cor e o alfa do traço (`windV6Rgb`,
 * `windV6Alpha`) compostos sobre o abismo do cartão (#030E18), nos mesmos nós da escala
 * antiga. Vento fraco lê-se gelo ténue e a nortada quase espuma, como no mapa, em vez
 * do arco-íris que as partículas v6 já não usam.
 */
export function windV6LegendStops(top: number): ReadonlyArray<readonly [number, readonly [number, number, number]]> {
  const abismo = [3, 14, 24];
  const kts = [0, 5, 10, 15, 20, 25, 30, 40].filter((k) => k <= top);
  return kts.map((kt) => {
    const rgb = windV6Rgb(kt).split(' ').map(Number);
    const a = windV6Alpha(kt);
    const c = rgb.map((v, i) => Math.round(abismo[i] + (v - abismo[i]) * a)) as [number, number, number];
    return [kt, c] as const;
  });
}
