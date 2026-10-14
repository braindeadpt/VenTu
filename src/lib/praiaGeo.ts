/**
 * Geografia vectorial da cena da praia (#184), calculada no browser a partir
 * do relevo AWS Terrain Tiles (terrarium), sem dependências novas.
 *
 * Como na maquete v6 (`maquete-v2/_build/geo/build_geo.py`):
 * - a linha de costa sai do relevo fino (z12, ~30 m): terra = elevação > 0,3 m;
 * - nos zooms altos o terrarium tem o mar a 0 m (SRTM), por isso a
 *   profundidade junta a batimetria grosseira do z10 (~150 m) com uma rampa a
 *   partir da costa: `prof = max(dist·0,011; batimetria·rampa(dist/1800 m))`.
 *   As isóbatas são aproximadas (declarado na legenda da figura);
 * - os conjuntos {prof < 5, 10, 20, 30, 50, 75, 100 m}, a terra, a areia
 *   (terra baixa junto à costa) e as cotas do relevo saem como anéis
 *   vectoriais (marching squares, simplificados e suavizados), em [lon, lat].
 *
 * O mesmo resultado pinta o mapa 3D (camadas `fill` GeoJSON) e a vista plana
 * sem WebGL (canvas vectorial com devicePixelRatio).
 */
import { PROF_FAIXAS } from '@/lib/praiaCena';

/** Elevação (m) numa posição, ou null fora dos tiles carregados. */
export type Amostrador = (lon: number, lat: number) => number | null;
export type Anel = Array<[number, number]>;

/** Cotas do relevo (m) usadas para dar textura à terra na vista plana. */
export const RELEVO_NIVEIS = [60, 150, 300] as const;
export const TERRA_MIN = 0.3;
const AREIA_MAX = 4;
const AREIA_DIST = 450;

export interface GeoPraia {
  bbox: [number, number, number, number];
  /** faixas[i] = anéis de {profundidade < PROF_FAIXAS[i]} (inclui a terra; pinta-se do fundo para a praia). */
  faixas: Anel[][];
  terra: Anel[];
  areia: Anel[];
  relevo: Anel[][];
  /** profundidade numa grelha grossa (para as frentes de onda), ver `frentesGeo` */
  ondas: GrelhaOndas;
  /** camadas OSM básicas (só nos spots com geografia estática, `public/geo/praia/<id>.json`) */
  pinhal?: Anel[];
  urbano?: Anel[];
  rocha?: Anel[];
  estradas?: Anel[];
  lugares?: Array<{ n: string; ll: [number, number] }>;
  picos?: Array<{ n: string; ll: [number, number]; ele: number }>;
}

/** Formato do ficheiro estático `public/geo/praia/<id>.json` (scripts/gen-praia-geo.mjs). */
export interface GeoEstatico {
  v: 1;
  bbox: [number, number, number, number];
  faixas: Anel[][];
  terra: Anel[];
  relevo: Anel[][];
  areia: Anel[];
  pinhal: Anel[];
  urbano: Anel[];
  rocha: Anel[];
  estradas: Anel[];
  lugares: Array<{ n: string; ll: [number, number] }>;
  picos: Array<{ n: string; ll: [number, number]; ele: number }>;
  ondas: { nx: number; ny: number; w: number; n: number; dlon: number; dlat: number; res: number; prof: string; dist: string };
}

const b64 = (s: string): Uint8Array => {
  if (typeof atob === 'function') {
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
};
/** Lê a geografia estática pré-gerada (OSM + relevo) para o formato usado pela cena. */
export function geoDeEstatico(j: GeoEstatico): GeoPraia | null {
  if (!j || j.v !== 1 || !Array.isArray(j.faixas)) return null;
  const o = j.ondas;
  const p8 = b64(o.prof);
  const d8 = b64(o.dist);
  const prof = new Float32Array(o.nx * o.ny);
  const dist = new Float32Array(o.nx * o.ny);
  for (let k = 0; k < prof.length; k++) {
    prof[k] = p8[k] === 255 ? NaN : p8[k];
    dist[k] = d8[k] * 20;
  }
  return {
    bbox: j.bbox,
    faixas: j.faixas,
    terra: j.terra,
    areia: j.areia,
    relevo: j.relevo,
    pinhal: j.pinhal,
    urbano: j.urbano,
    rocha: j.rocha,
    estradas: j.estradas,
    lugares: j.lugares,
    picos: j.picos,
    ondas: { nx: o.nx, ny: o.ny, w: o.w, n: o.n, dlon: o.dlon, dlat: o.dlat, res: o.res, prof, dist, campos: new Map() },
  };
}

export interface GrelhaOndas {
  nx: number;
  ny: number;
  w: number;
  n: number;
  dlon: number;
  dlat: number;
  res: number;
  /** profundidade (m) no mar; NaN em terra */
  prof: Float32Array;
  /** distância à costa (m) */
  dist: Float32Array;
  /** cache dos campos de chegada por rumo da ondulação */
  campos: Map<number, Float32Array>;
}

export interface OpcoesGeo {
  /** meia largura (graus de longitude) e meia altura (graus de latitude) da área */
  meiaLon: number;
  meiaLat: number;
  /** lado da célula em metros */
  res: number;
  /** simplificação (células) e iterações de Chaikin dos anéis (por omissão 0,35 e 2) */
  tol?: number;
  iter?: number;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Distância (m) de cada célula fora de `alvo` à célula de `alvo` mais próxima (chamfer 3×3). */
export function distancia(alvo: Uint8Array, nx: number, ny: number, res: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(nx * ny);
  for (let k = 0; k < d.length; k++) d[k] = alvo[k] ? 0 : INF;
  const a = res;
  const b = res * Math.SQRT2;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let v = d[k];
      if (v === 0) continue;
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[k - nx] + a);
        if (i > 0) v = Math.min(v, d[k - nx - 1] + b);
        if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + b);
      }
      d[k] = v;
    }
  for (let j = ny - 1; j >= 0; j--)
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      let v = d[k];
      if (v === 0) continue;
      if (i < nx - 1) v = Math.min(v, d[k + 1] + a);
      if (j < ny - 1) {
        v = Math.min(v, d[k + nx] + a);
        if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + b);
        if (i > 0) v = Math.min(v, d[k + nx - 1] + b);
      }
      d[k] = v;
    }
  return d;
}

/** Desfocagem de caixa separável (raio r), aplicada `passes` vezes (≈ gaussiana). */
export function desfoca(v: Float32Array, nx: number, ny: number, r: number, passes = 2): Float32Array {
  let a: Float32Array = v;
  const t = new Float32Array(v.length);
  for (let p = 0; p < passes; p++) {
    const o = new Float32Array(v.length);
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        let s = 0;
        let n = 0;
        for (let q = Math.max(0, i - r); q <= Math.min(nx - 1, i + r); q++) {
          s += a[row + q];
          n++;
        }
        t[row + i] = s / n;
      }
    }
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        let s = 0;
        let n = 0;
        for (let q = Math.max(0, j - r); q <= Math.min(ny - 1, j + r); q++) {
          s += t[q * nx + i];
          n++;
        }
        o[j * nx + i] = s / n;
      }
    a = o;
  }
  return a;
}

/**
 * Anéis fechados da fronteira de {campo > 0} (marching squares), em
 * coordenadas da grelha (x para a direita, y para baixo). Fora da grelha conta
 * como «fora», por isso todos os anéis fecham. Orientação consistente: os
 * contornos exteriores têm área com sinal oposto ao dos buracos.
 */
export function aneisGrelha(campo: Float32Array, nx: number, ny: number): Array<Array<[number, number]>> {
  const P = nx + 2;
  const s = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return -1;
    const v = campo[j * nx + i];
    return v > 0 ? v : Number.isNaN(v) ? -1 : Math.min(v, -1e-6);
  };
  const kH = (i: number, j: number) => ((j + 1) * P + (i + 1)) * 2;
  const kV = (i: number, j: number) => ((j + 1) * P + (i + 1)) * 2 + 1;
  const pts = new Map<number, [number, number]>();
  const seg = new Map<number, number>();
  type C = { k: number; saida: boolean };
  const cx: C[] = [];
  for (let j = -1; j < ny; j++)
    for (let i = -1; i < nx; i++) {
      const tl = s(i, j);
      const tr = s(i + 1, j);
      const br = s(i + 1, j + 1);
      const bl = s(i, j + 1);
      const m = (tl > 0 ? 8 : 0) | (tr > 0 ? 4 : 0) | (br > 0 ? 2 : 0) | (bl > 0 ? 1 : 0);
      if (m === 0 || m === 15) continue;
      cx.length = 0;
      // arestas no sentido dos ponteiros do relógio (ecrã): topo, direita, baixo, esquerda
      const aresta = (k: number, va: number, vb: number, ax: number, ay: number, bx: number, by: number) => {
        if (va > 0 === vb > 0) return;
        if (!pts.has(k)) {
          const t = va / (va - vb);
          pts.set(k, [ax + (bx - ax) * t, ay + (by - ay) * t]);
        }
        cx.push({ k, saida: va > 0 });
      };
      aresta(kH(i, j), tl, tr, i, j, i + 1, j);
      aresta(kV(i + 1, j), tr, br, i + 1, j, i + 1, j + 1);
      aresta(kH(i, j + 1), br, bl, i + 1, j + 1, i, j + 1);
      aresta(kV(i, j), bl, tl, i, j + 1, i, j);
      if (cx.length === 2) {
        const sa = cx[0].saida ? cx[0] : cx[1];
        const en = cx[0].saida ? cx[1] : cx[0];
        seg.set(sa.k, en.k);
      } else if (cx.length === 4) {
        const ligado = (tl + tr + br + bl) / 4 > 0;
        for (let q = 0; q < 4; q++)
          if (cx[q].saida) seg.set(cx[q].k, cx[ligado ? (q + 1) % 4 : (q + 3) % 4].k);
      }
    }
  const out: Array<Array<[number, number]>> = [];
  for (const k0 of seg.keys()) {
    if (!seg.has(k0)) continue;
    const anel: Array<[number, number]> = [];
    let k: number | undefined = k0;
    let guarda = 0;
    while (k !== undefined && guarda++ < 1e7) {
      const nk: number | undefined = seg.get(k);
      seg.delete(k);
      anel.push(pts.get(k) as [number, number]);
      if (nk === undefined || nk === k0) break;
      k = nk;
    }
    if (anel.length >= 3) out.push(anel);
  }
  return out;
}

export function areaAnel(a: ReadonlyArray<readonly [number, number]>): number {
  let s = 0;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) s += (a[j][0] - a[i][0]) * (a[j][1] + a[i][1]);
  return s / 2;
}

function dp(p: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (p.length < 4) return p;
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const pilha: Array<[number, number]> = [[0, p.length - 1]];
  const t2 = tol * tol;
  while (pilha.length) {
    const [a, b] = pilha.pop() as [number, number];
    const [ax, ay] = p[a];
    const [bx, by] = p[b];
    const dx = bx - ax;
    const dy = by - ay;
    const L = dx * dx + dy * dy || 1e-12;
    let mx = -1;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const t = clamp(((p[i][0] - ax) * dx + (p[i][1] - ay) * dy) / L, 0, 1);
      const ex = ax + t * dx - p[i][0];
      const ey = ay + t * dy - p[i][1];
      const d = ex * ex + ey * ey;
      if (d > mx) {
        mx = d;
        mi = i;
      }
    }
    if (mx > t2 && mi > 0) {
      keep[mi] = 1;
      pilha.push([a, mi], [mi, b]);
    }
  }
  return p.filter((_, i) => keep[i]);
}

/** Simplifica (Douglas–Peucker) e suaviza (Chaikin) um anel fechado. */
export function alisa(anel: Array<[number, number]>, tol: number, iter = 2): Array<[number, number]> {
  let p = dp([...anel, anel[0]], tol);
  p.pop();
  if (p.length < 3) return p;
  for (let k = 0; k < iter; k++) {
    const q: Array<[number, number]> = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

/** Constrói a geografia da praia à volta de `ll` a partir do relevo fino (`fino`, z12) e da batimetria grosseira (`largo`, z10). */
export function construirGeo(ll: [number, number], o: OpcoesGeo, fino: Amostrador, largo: Amostrador | null): GeoPraia {
  const mx = 111320 * Math.cos((ll[1] * Math.PI) / 180);
  const my = 110540;
  const dlon = o.res / mx;
  const dlat = o.res / my;
  const W = ll[0] - o.meiaLon;
  const N = ll[1] + o.meiaLat;
  const nx = Math.ceil((2 * o.meiaLon) / dlon) + 1;
  const ny = Math.ceil((2 * o.meiaLat) / dlat) + 1;
  const n = nx * ny;
  const elev = new Float32Array(n);
  const ehTerra = new Uint8Array(n);
  const ehMar = new Uint8Array(n);
  const bat = new Float32Array(n);
  let algumaTerra = false;
  for (let j = 0; j < ny; j++) {
    const lat = N - j * dlat;
    for (let i = 0; i < nx; i++) {
      const lon = W + i * dlon;
      const k = j * nx + i;
      const e = fino(lon, lat) ?? 0;
      elev[k] = e;
      if (e > TERRA_MIN) {
        ehTerra[k] = 1;
        algumaTerra = true;
      } else ehMar[k] = 1;
      const b = largo ? largo(lon, lat) : null;
      bat[k] = b === null ? 0 : Math.max(0, -b);
    }
  }
  const dMar = algumaTerra ? distancia(ehTerra, nx, ny, o.res) : new Float32Array(n).fill(1e6);
  const dTerra = distancia(ehMar, nx, ny, o.res);
  const batS = desfoca(bat, nx, ny, Math.max(1, Math.round(120 / o.res)));
  let prof: Float32Array = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (ehTerra[k]) continue;
    const d = dMar[k];
    const r = clamp(d / 1800, 0, 1);
    const rampa = r * r * (3 - 2 * r);
    prof[k] = Math.max(d * 0.011, batS[k] * rampa);
  }
  prof = desfoca(prof, nx, ny, 1);
  for (let k = 0; k < n; k++) if (ehTerra[k]) prof[k] = 0;

  const tol = o.tol ?? 0.35;
  const iter = o.iter ?? 2;
  const minA = 3;
  const paraLL = (a: Array<[number, number]>): Anel => a.map(([x, y]) => [+(W + x * dlon).toFixed(6), +(N - y * dlat).toFixed(6)]);
  const aneis = (campo: Float32Array): Anel[] =>
    aneisGrelha(campo, nx, ny)
      .filter((a) => Math.abs(areaAnel(a)) >= minA)
      .map((a) => alisa(a, tol, iter))
      .filter((a) => a.length >= 3)
      .map(paraLL);

  const campo = new Float32Array(n);
  const faixas = PROF_FAIXAS.map((d) => {
    for (let k = 0; k < n; k++) campo[k] = d - prof[k];
    return aneis(campo);
  });
  for (let k = 0; k < n; k++) campo[k] = elev[k] - TERRA_MIN;
  const terra = aneis(campo);
  for (let k = 0; k < n; k++)
    campo[k] = Math.min(elev[k] - TERRA_MIN, AREIA_MAX - elev[k], (AREIA_DIST - dTerra[k]) / 100);
  const areia = aneis(campo);
  const relevo = RELEVO_NIVEIS.map((lv) => {
    for (let k = 0; k < n; k++) campo[k] = elev[k] - lv;
    return aneis(campo);
  });
  // grelha grossa (3 células) para o campo de chegada da ondulação
  const st = 3;
  const gx = Math.ceil(nx / st);
  const gy = Math.ceil(ny / st);
  const gp = new Float32Array(gx * gy);
  const gd = new Float32Array(gx * gy);
  for (let j = 0; j < gy; j++)
    for (let i = 0; i < gx; i++) {
      const k = j * st * nx + i * st;
      gp[j * gx + i] = ehTerra[k] ? NaN : prof[k];
      gd[j * gx + i] = dMar[k];
    }
  const ondas: GrelhaOndas = { nx: gx, ny: gy, w: W, n: N, dlon: dlon * st, dlat: dlat * st, res: o.res * st, prof: gp, dist: gd, campos: new Map() };
  return { bbox: [W, N - (ny - 1) * dlat, W + (nx - 1) * dlon, N], faixas, terra, areia, relevo, ondas };
}

/**
 * Tempo de chegada (s) da ondulação vinda de `sd` (graus) a cada célula do
 * mar: refracção simples (Dijkstra com c = c0·√tanh(k·h), Tp de referência
 * 11 s), como o campo pré-calculado da maquete; parte das células fundas
 * como uma frente plana.
 */
export function campoChegada(g: GrelhaOndas, sd: number): Float32Array {
  const chave = Math.round(sd / 5) * 5;
  const c = g.campos.get(chave);
  if (c) return c;
  const { nx, ny, prof, res } = g;
  const th = (chave * Math.PI) / 180;
  const ux = -Math.sin(th);
  const uy = -Math.cos(th); // propagação (este, norte)
  const Tp = 11;
  const L0 = (9.81 * Tp * Tp) / (2 * Math.PI);
  const c0 = (9.81 * Tp) / (2 * Math.PI);
  const vel = (h: number) => c0 * Math.sqrt(Math.tanh(((2 * Math.PI) / L0) * Math.max(h, 0.6) * 2.2));
  const T = new Float32Array(nx * ny).fill(Infinity);
  let maxP = 0;
  for (let k = 0; k < prof.length; k++) if (prof[k] > maxP) maxP = prof[k];
  const fundo = Math.min(60, maxP * 0.8);
  // heap binário (t, k)
  const hk: number[] = [];
  const ht: number[] = [];
  const push = (t: number, k: number) => {
    let i = ht.length;
    ht.push(t);
    hk.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (ht[p] <= t) break;
      ht[i] = ht[p];
      hk[i] = hk[p];
      i = p;
    }
    ht[i] = t;
    hk[i] = k;
  };
  const pop = (): [number, number] => {
    const t0 = ht[0];
    const k0 = hk[0];
    const t = ht.pop() as number;
    const k = hk.pop() as number;
    if (ht.length) {
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        const b = a + 1;
        let m = i;
        let mt = t;
        if (a < ht.length && ht[a] < mt) {
          m = a;
          mt = ht[a];
        }
        if (b < ht.length && ht[b] < mt) m = b;
        if (m === i) break;
        ht[i] = ht[m];
        hk[i] = hk[m];
        i = m;
      }
      ht[i] = t;
      hk[i] = k;
    }
    return [t0, k0];
  };
  const v200 = vel(200);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!(prof[k] >= fundo)) continue;
      const t0 = (i * res * ux - j * res * uy) / v200;
      T[k] = t0;
      push(t0, k);
    }
  const nb = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2],
  ];
  while (ht.length) {
    const [t, k] = pop();
    if (t > T[k]) continue;
    const i = k % nx;
    const j = (k - i) / nx;
    for (const [di, dj] of nb) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii;
      if (Number.isNaN(prof[kk])) continue;
      const nt = t + (Math.hypot(di, dj) * res) / (0.5 * (vel(prof[k]) + vel(prof[kk])));
      if (nt < T[kk]) {
        T[kk] = nt;
        push(nt, kk);
      }
    }
  }
  let mn = Infinity;
  for (let k = 0; k < T.length; k++) if (T[k] < mn) mn = T[k];
  for (let k = 0; k < T.length; k++) T[k] = Number.isFinite(T[k]) ? T[k] - mn : NaN;
  g.campos.set(chave, T);
  return T;
}

/**
 * Frentes de onda (segmentos [lon, lat]) junto à costa: isócronas do campo de
 * chegada espaçadas de 2 (desktop) ou 3 (telemóvel) períodos e animadas pela
 * fase `t` (s), como na maquete. Só até `maxDist` m da costa.
 */
export function frentesGeo(g: GrelhaOndas, sd: number, tp: number, hs: number, t: number, desktop: boolean, maxDist = 3200): Array<Array<[number, number]>> {
  if (!(hs > 0.15) || !(tp > 0)) return [];
  const T = campoChegada(g, sd);
  const { nx, ny } = g;
  const Lam = tp * (desktop ? 2 : 3);
  const ph = (((t * 8) % Lam) + Lam) % Lam;
  const segs: Array<Array<[number, number]>> = [];
  const ll = (x: number, y: number): [number, number] => [g.w + x * g.dlon, g.n - y * g.dlat];
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      if (g.dist[k] > maxDist) continue;
      const a = T[k];
      const b = T[k + 1];
      const c = T[k + nx + 1];
      const d = T[k + nx];
      if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) continue;
      const lo = Math.min(a, b, c, d);
      const hi = Math.max(a, b, c, d);
      for (let lev = Math.ceil((lo - ph) / Lam) * Lam + ph; lev <= hi; lev += Lam) {
        const pts: Array<[number, number]> = [];
        const ed = (v1: number, v2: number, x1: number, y1: number, x2: number, y2: number) => {
          if ((v1 - lev) * (v2 - lev) < 0) {
            const f = (lev - v1) / (v2 - v1);
            pts.push(ll(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f));
          }
        };
        ed(a, b, i, j, i + 1, j);
        ed(b, c, i + 1, j, i + 1, j + 1);
        ed(c, d, i + 1, j + 1, i, j + 1);
        ed(d, a, i, j + 1, i, j);
        if (pts.length >= 2) segs.push(pts.slice(0, 2));
      }
    }
  return segs;
}

function dentro(p: readonly [number, number], a: Anel): boolean {
  let c = false;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const [xi, yi] = a[i];
    const [xj, yj] = a[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi) c = !c;
  }
  return c;
}

/**
 * MultiPolygon GeoJSON a partir de anéis de um conjunto: exteriores no
 * sentido anti-horário (lon/lat) e buracos no horário, cada buraco no menor
 * exterior que o contém.
 */
export function multiPoligono(aneis: Anel[]): number[][][][] {
  if (!aneis.length) return [];
  // o maior anel é sempre exterior: o seu sinal diz quais são os exteriores
  let maior = aneis[0];
  for (const a of aneis) if (Math.abs(areaAnel(a)) > Math.abs(areaAnel(maior))) maior = a;
  const sinalExt = Math.sign(areaAnel(maior));
  const ext = aneis.filter((a) => Math.sign(areaAnel(a)) === sinalExt).sort((a, b) => Math.abs(areaAnel(a)) - Math.abs(areaAnel(b)));
  const bur = aneis.filter((a) => Math.sign(areaAnel(a)) !== sinalExt);
  const fecha = (a: Anel, ccw: boolean) => {
    const pos = areaAnel(a) < 0; // areaAnel > 0 ⇔ horário com y para cima
    const r = pos === ccw ? [...a] : [...a].reverse();
    return [...r, r[0]];
  };
  const polis = ext.map((a) => ({ a, buracos: [] as Anel[] }));
  for (const h of bur) {
    const alvo = polis.find((p) => dentro(h[0], p.a));
    if (alvo) alvo.buracos.push(h);
  }
  return polis.map((p) => [fecha(p.a, true), ...p.buracos.map((h) => fecha(h, false))]);
}
