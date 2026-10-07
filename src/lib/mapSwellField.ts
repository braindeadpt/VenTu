/**
 * Linguagem visual das camadas «Vento» e «Ondulação» do /mapa — portada da
 * maquete aprovada (Canvas 2D, «espetacular»): escalas de cor em nós e em
 * metros, isolinhas de Hs a cada 0,5 m, cristas de ondulação em malha de
 * píxeis de ecrã, chevrons por período. Só funções puras: os hooks
 * (`useMapWindField`, `useMapSwellField`) desenham.
 */

export const MAP_SWELL_LS_KEY = 'ventu.map.swell';
/**
 * Por baixo do campo de vento (345) — como na maquete, as partículas passam
 * por cima da cor da ondulação — e acima dos tiles (200). Marcadores (600) e
 * toponímia ficam por cima; as isóbatas (340) ficam por baixo.
 */
export const MAP_SWELL_PANE = 'swellfield';
export const MAP_SWELL_PANE_Z = '342';

export type ColorStop = readonly [number, readonly [number, number, number]];

/** Vento — nós (maquete: azul calmo → verde → amarelo → laranja → magenta). */
export const WIND_KT_STOPS: readonly ColorStop[] = [
  [0, [74, 104, 150]],
  [5, [70, 160, 205]],
  [10, [80, 208, 170]],
  [15, [196, 226, 96]],
  [20, [244, 190, 70]],
  [25, [240, 120, 60]],
  [30, [222, 64, 104]],
  [40, [190, 90, 220]],
];
export const WIND_KT_MAX = 40;

/** Ondulação — Hs em metros (maquete: azul profundo → turquesa → âmbar → coral). */
export const HS_M_STOPS: readonly ColorStop[] = [
  [0, [10, 38, 66]],
  [0.5, [18, 72, 112]],
  [1, [24, 112, 146]],
  [1.5, [34, 152, 150]],
  [2, [120, 190, 104]],
  [2.5, [226, 186, 78]],
  [3, [232, 126, 76]],
  [3.5, [214, 70, 98]],
  [5, [190, 90, 220]],
];
export const HS_M_MAX = 5;

/** Isolinhas de Hs (m). */
export const SWELL_ISOLINE_STEP_M = 0.5;
/** Malha das cristas — espaçamento em píxeis de ecrã, constante em qualquer zoom. */
export const SWELL_CREST_SPACING_PX = 30;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Cor (r,g,b) do valor `x` numa escala de paragens. */
export function rampColor(stops: readonly ColorStop[], x: number): [number, number, number] {
  if (!(x > stops[0][0])) return [...stops[0][1]] as [number, number, number];
  for (let s = 0; s < stops.length - 1; s++) {
    const [x0, c0] = stops[s];
    const [x1, c1] = stops[s + 1];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return [
        Math.round(lerp(c0[0], c1[0], t)),
        Math.round(lerp(c0[1], c1[1], t)),
        Math.round(lerp(c0[2], c1[2], t)),
      ];
    }
  }
  return [...stops[stops.length - 1][1]] as [number, number, number];
}

/** LUT de 256 entradas (r,g,b) de 0 a `max`. */
export function rampLut(stops: readonly ColorStop[], max: number, n = 256): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) {
    const c = rampColor(stops, (i / (n - 1)) * max);
    lut[i * 3] = c[0];
    lut[i * 3 + 1] = c[1];
    lut[i * 3 + 2] = c[2];
  }
  return lut;
}

export function windKtColor(kt: number): string {
  const [r, g, b] = rampColor(WIND_KT_STOPS, kt);
  return `rgb(${r} ${g} ${b})`;
}

export function hsColor(m: number): string {
  const [r, g, b] = rampColor(HS_M_STOPS, m);
  return `rgb(${r} ${g} ${b})`;
}

/** `linear-gradient` da legenda, cortado em `top`. */
export function legendGradient(stops: readonly ColorStop[], top: number): string {
  const kept = stops.filter((s) => s[0] <= top);
  const parts = kept.map((s) => `rgb(${s[1].join(' ')}) ${((s[0] / top) * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/** Topo da legenda do vento: 30 kn, ou 40 quando há mais de 30 na grelha. */
export function windLegendTop(maxKt: number): 30 | 40 {
  return maxKt > 30 ? 40 : 30;
}

/** Topo da legenda da Hs: 2,5 / 3,5 / 5 m conforme o máximo da grelha. */
export function hsLegendTop(maxM: number): 2.5 | 3.5 | 5 {
  if (maxM > 3.5) return 5;
  if (maxM > 2.5) return 3.5;
  return 2.5;
}

/** Chevrons do símbolo de ondulação por período: <8 s · 8–11 · 11–14 · ≥14. */
export function swellChevrons(perS: number): 1 | 2 | 3 | 4 {
  if (!(perS >= 8)) return 1;
  if (perS < 11) return 2;
  if (perS < 14) return 3;
  return 4;
}

/** Comprimento da seta (px) ∝ Hs — constante em zoom, limitado para não tapar a costa. */
export function swellArrowLengthPx(hs: number): number {
  return Math.round(12 + Math.min(4, Math.max(0, hs)) * 15);
}

/** Níveis de isolinha entre `min` e `max` (passo 0,5 m). */
export function isolineLevels(min: number, max: number, step = SWELL_ISOLINE_STEP_M): number[] {
  const out: number[] = [];
  if (!(max > 0)) return out;
  const start = Math.max(step, Math.ceil((min + 1e-6) / step) * step);
  for (let lv = start; lv < max; lv += step) out.push(Math.round(lv * 100) / 100);
  return out;
}

export type Pt = readonly [number, number];
export type Seg = readonly [Pt, Pt];

/**
 * Marching squares sobre uma grelha `ni × nj` (row-major, j a crescer para
 * NORTE ou para baixo — o chamador decide). Devolve segmentos em unidades de
 * grelha (i, j). NaN em qualquer canto salta a célula (terra / sem dado).
 */
export function marchingSquares(g: ArrayLike<number>, ni: number, nj: number, level: number): Seg[] {
  const segs: Seg[] = [];
  for (let j = 0; j < nj - 1; j++) {
    for (let i = 0; i < ni - 1; i++) {
      const a = g[j * ni + i];
      const b = g[j * ni + i + 1];
      const c = g[(j + 1) * ni + i + 1];
      const d = g[(j + 1) * ni + i];
      if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) continue;
      const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const T: Pt = [i + (level - a) / (b - a), j];
      const R: Pt = [i + 1, j + (level - b) / (c - b)];
      const B: Pt = [i + (level - d) / (c - d), j + 1];
      const L: Pt = [i, j + (level - a) / (d - a)];
      switch (code) {
        case 1: case 14: segs.push([L, B]); break;
        case 2: case 13: segs.push([B, R]); break;
        case 3: case 12: segs.push([L, R]); break;
        case 4: case 11: segs.push([T, R]); break;
        case 6: case 9: segs.push([T, B]); break;
        case 7: case 8: segs.push([L, T]); break;
        case 5: segs.push([L, T], [B, R]); break;
        case 10: segs.push([L, B], [T, R]); break;
      }
    }
  }
  return segs;
}

export interface IsoLabel {
  x: number;
  y: number;
  /** ângulo do texto (rad), já virado para ler da esquerda para a direita */
  angle: number;
  level: number;
}

/**
 * Um rótulo por nível: o segmento visível (em píxeis) mais perto de um ponto
 * alvo — fica a oeste da costa, longe das margens do HUD. `segsPx` já vem
 * projectado.
 */
export function pickIsolineLabel(
  segsPx: ReadonlyArray<Seg>,
  level: number,
  box: { x0: number; y0: number; x1: number; y1: number },
  target: { x: number; y: number },
): IsoLabel | null {
  let best: IsoLabel | null = null;
  let bestScore = -Infinity;
  for (const [p, q] of segsPx) {
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    if (mx < box.x0 || mx > box.x1 || my < box.y0 || my > box.y1) continue;
    const score = -Math.abs(mx - target.x) - Math.abs(my - target.y) * 0.25;
    if (score <= bestScore) continue;
    bestScore = score;
    let a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    if (a > Math.PI / 2) a -= Math.PI;
    if (a < -Math.PI / 2) a += Math.PI;
    best = { x: mx, y: my, angle: a, level };
  }
  return best;
}

export interface CrestPoint {
  x: number;
  y: number;
  seed: number;
}

/**
 * Malha triangular de pontos das cristas, em píxeis de CONTAINER, ancorada à
 * origem de píxeis do mapa (`originX/Y` = posição de ecrã do píxel-mundo 0,0
 * módulo espaçamento) — um pan desloca a malha com o mapa (sem cintilação) e
 * o espaçamento fica igual em qualquer zoom. Rebuild a cada moveend/zoomend.
 */
export function buildCrestLattice(
  width: number,
  height: number,
  originX: number,
  originY: number,
  spacing = SWELL_CREST_SPACING_PX,
): CrestPoint[] {
  const out: CrestPoint[] = [];
  const rowH = spacing * 0.866;
  const r0 = Math.floor((-spacing - originY) / rowH);
  const r1 = Math.ceil((height + spacing - originY) / rowH);
  for (let r = r0; r <= r1; r++) {
    const cy = originY + r * rowH;
    const off = (((r % 2) + 2) % 2 ? spacing / 2 : 0) + spacing / 4;
    const c0 = Math.floor((-spacing - originX - off) / spacing);
    const c1 = Math.ceil((width + spacing - originX - off) / spacing);
    for (let c = c0; c <= c1; c++) {
      const cx = originX + off + c * spacing;
      let h = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
      h -= Math.floor(h);
      const x = cx + (h - 0.5) * 8;
      const y = cy + (((h * 7) % 1) - 0.5) * 8;
      if (x < -spacing || y < -spacing || x > width + spacing || y > height + spacing) continue;
      out.push({ x, y, seed: h });
    }
  }
  return out;
}

/**
 * Fase de uma crista (0–spacing) no instante `nowMs`: velocidade em px/s
 * cresce com o período (ondulação longa anda mais), sempre lenta.
 */
export function crestPhase(nowMs: number, perS: number, seed: number, spacing = SWELL_CREST_SPACING_PX): number {
  const spd = 4 + (Number.isFinite(perS) ? perS : 8) * 1.3;
  const ph = ((nowMs / 1000) * spd + seed * spacing) % spacing;
  return ph < 0 ? ph + spacing : ph;
}

const CARD16_W = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const CARD16_O = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

/** Rosa de 16 pontos — «O» (oeste) nas línguas latinas, «W» em en/de. */
export function compass16(deg: number, locale: string): string {
  const k = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return (locale === 'pt' || locale === 'es' || locale === 'fr' ? CARD16_O : CARD16_W)[k];
}

/** Número com 1 casa e vírgula decimal nas línguas que a usam. */
export function fmt1(x: number, locale: string): string {
  const s = x.toFixed(1);
  return locale === 'en' ? s : s.replace('.', ',');
}
