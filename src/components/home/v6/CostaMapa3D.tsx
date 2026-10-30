'use client';

/**
 * Mapa da costa da home v6 (#183): MapLibre 3D (lazy, WebGL2) com o mar junto
 * a cada spot na cor da nota, vento em partículas (`ventoParticulas`, IDW dos
 * spots na hora mostrada), rótulos 2D sem sobreposição (os três da lista
 * primeiro), chip do vento, legenda e atribuição.
 * v7 «Porta do mapa» (#273): o cartão é a porta do /mapa. Um *stretched link*
 * (`.porta-a`) cobre a figura e leva ao /mapa com o contexto da home
 * (`hrefMapa`); por cima dele ficam só os rótulos (cada um abre o /mapa com esse
 * spot aberto), o crédito do mapa e a faixa «Explorar o mapa da costa →».
 * Sem diálogo de ecrã inteiro. Até o 3D arrancar, o poster é uma imagem neutra
 * da costa (só costa e mar, sem notas nem rótulos).
 * Telemóvel: faixa depois do top 3, câmara no top 3. Desktop: ao lado do
 * «VAI.», câmara para a costa toda, rótulos de todos.
 * Sem WebGL2 (ou contexto perdido, ou `?webgl=0`): mapa plano estático em
 * SVG com a mesma cor do mar, os mesmos rótulos e a grelha de setas.
 * `prefers-reduced-motion`: setas paradas e câmara a saltar.
 * Lógica da maquete aprovada (`index.html`: `rotulos`, `campoVento`,
 * `camMobile`, `camDesk`, `carta`); porta: docs/design/maquetes/v7-porta-mapa.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { criarVento, idwVento, type MotorVento } from '@/lib/ventoParticulas';
import { aplicarLuz, BOX_VENTO, CAM_DESK, CAM_MOB, COR, corTroco, luz, ZMOB, type GeoCosta } from '@/lib/home/costaCena';
import { rumo, type Linha, type Modelo, type SpotHome } from '@/lib/home/homeV6';
import type { EstadoHome } from '@/lib/home/estadoHome';
import { BANDAS_ORDEM, type BandaK } from '@/lib/modalidades';
import { bandaVars, V6_BANDAS } from '@/lib/v6Tokens';
import { getAssetPath } from '@/lib/paths';
import type { HomeV6Copy } from '@/lib/translations/homeV6';
import { spotDentroDoNivel, type NivelUtilizador } from '@/lib/mapDifficulty';
import type { HandleCostaGL } from './costaMapaGL';

type Modo = 'poster' | '3d' | 'plano';
type P2 = { x: number; y: number };
interface Proj {
  proj: (ll: [number, number]) => P2 | null;
  unproj: (p: [number, number]) => [number, number] | null;
}

export function temWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Sem interacção, o mapa 3D arranca este tempo depois de a página assentar (`load` e um
 * `requestIdleCallback`). Com interacção (rato, toque, tecla, roda, scroll) arranca logo.
 */
export const ARRANQUE_OCIOSO_MS = 6000;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const SVGNS = 'http://www.w3.org/2000/svg';
/** medidas dos posters neutros (public/images/home/costa-poster-*.webp) */
const POSTER = { 390: [716, 760], 1440: [668, 692] } as const;

export interface CostaMapa3DProps {
  M: Modelo;
  E: EstadoHome;
  copy: HomeV6Copy;
  /** URL do /mapa com o contexto da home; com `spotId`, abre esse spot (`…&spot=<id>&de=home`) */
  hrefMapa: (spotId?: string) => string;
  /** spots da modalidade no /mapa (contagem real do índice de spots), para a linha do CTA */
  nSpots: number;
  forcarPlano: boolean;
  /** #nivel-ui: com nível escolhido, os rótulos menores dos spots acima dele ficam esbatidos (nota e cor iguais). */
  nivel?: NivelUtilizador | null;
  /** «esbatido: acima do teu nível» (chip da legenda, só com nível). */
  legendaNivel?: string;
}

export default function CostaMapa3D({ M, E, copy: c, hrefMapa, nSpots, forcarPlano, nivel = null, legendaNivel }: CostaMapa3DProps) {
  const sec = useRef<HTMLElement>(null);
  const fig = useRef<HTMLElement>(null);
  const mapaEl = useRef<HTMLDivElement>(null);
  const cartaEl = useRef<SVGSVGElement>(null);
  const ventoEl = useRef<HTMLCanvasElement>(null);
  const rotEl = useRef<HTMLDivElement>(null);
  const guiasEl = useRef<SVGSVGElement>(null);
  const gl = useRef<HandleCostaGL | null>(null);
  const proj = useRef<Proj | null>(null);
  const vento = useRef<MotorVento | null>(null);
  const geo = useRef<GeoCosta | null>(null);
  const reduz = useRef(false);
  const desk = useRef(false);
  const chaveCam = useRef('');
  const [modo, setModo] = useState<Modo>('poster');
  const modoRef = useRef<Modo>('poster');
  const [pronto, setPronto] = useState(false);
  // o estado mais recente para os callbacks imperativos (MapLibre, resize)
  const st = useRef({ M, E, c, hrefMapa, nivel });
  const forcarRef = useRef(forcarPlano);
  useLayoutEffect(() => {
    st.current = { M, E, c, hrefMapa, nivel };
    forcarRef.current = forcarPlano;
  });
  const [reduzido, setReduzido] = useState(false);

  /* bandas do bloco por spot (noite: tudo noite), a do ranking único */
  const cores = () => {
    const { E: e } = st.current;
    const cor: Record<string, BandaK> = {};
    for (const r of e.R) cor[r.sp.id] = e.noite ? 'noite' : r.b;
    return cor;
  };
  const pintura = () => {
    const { M: m, E: e } = st.current;
    const topIds = e.top.map((r) => r.sp.id);
    return {
      d: e.d,
      L: luz(m.spots, e.horaMapa),
      cor: cores(),
      pontos: m.spotsDe(e.d).map((s) => ({ id: s.id, ll: [s.lon, s.lat] as [number, number], top: topIds.includes(s.id) })),
    };
  };

  /* ---------- rótulos: pílulas com a nota, guias para o ponto (colocação 2D sem sobreposição) ---------- */
  const rotulos = useCallback(() => {
    const box = rotEl.current;
    const svg = guiasEl.current;
    const p = proj.current;
    if (!box || !svg) return;
    box.querySelectorAll('.rot,.top-lbl').forEach((e) => e.remove());
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!p) return;
    const { M: m, E: e, c: cc, hrefMapa: href, nivel: nv } = st.current;
    const W = box.clientWidth;
    const H = box.clientHeight;
    const ids = e.top.map((r) => r.sp.id);
    const dk = desk.current;
    const extra = dk ? m.spotsDe(e.d).filter((s) => !ids.includes(s.id)) : [];
    const notaDe = (id: string) => e.R.find((r) => r.sp.id === id);
    // livre entre o cabeçalho do cartão (título + chip do vento) e a faixa do CTA (+ legenda no desktop)
    const topoLivre = dk ? 150 : 100;
    const fundo = H - (dk ? 164 : 122);
    type Item = { sp: SpotHome; r: Linha | undefined; top: boolean; p: P2 };
    const items: Item[] = [
      ...e.top.map((r) => ({ sp: r.sp, r, top: true })),
      ...extra.map((sp) => ({ sp, r: notaDe(sp.id), top: false })),
    ]
      .map((o) => ({ ...o, p: p.proj([o.sp.lon, o.sp.lat]) as P2 }))
      .filter((o) => o.p && o.p.x > 0 && o.p.x < W && o.p.y > 24 && o.p.y < H - 10);
    const postos: Array<{ x: number; y: number; w: number; h: number }> = [];
    const pontos = items.map((o) => o.p);
    const livre = (x: number, y: number, w: number, hh: number) =>
      x >= 4 &&
      x + w <= W - 4 &&
      y >= topoLivre &&
      y + hh <= fundo &&
      !postos.some((q) => x < q.x + q.w + 4 && x + w + 4 > q.x && y < q.y + q.h + 3 && y + hh + 3 > q.y) &&
      !pontos.some((q) => q.x > x - 5 && q.x < x + w + 5 && q.y > y - 5 && q.y < y + hh + 5);
    // guias já desenhadas: um rótulo novo não cruza a guia de outro (lê-se mal o «X»)
    const guias: Array<[number, number, number, number]> = [];
    const feitos: Array<{ a: HTMLAnchorElement; ln: SVGPathElement; x: number; y: number; w: number; h: number; p: P2 }> = [];
    const lado = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const cruzam = (g: [number, number, number, number], h: [number, number, number, number]) =>
      lado(g[0], g[1], g[2], g[3], h[0], h[1]) * lado(g[0], g[1], g[2], g[3], h[2], h[3]) < 0 &&
      lado(h[0], h[1], h[2], h[3], g[0], g[1]) * lado(h[0], h[1], h[2], h[3], g[2], g[3]) < 0;
    const guiaDe = (x: number, y: number, w: number, hh: number, q: P2): [number, number, number, number] => [
      x + w < q.x ? x + w : x > q.x ? x : x + w / 2,
      y + hh / 2,
      q.x,
      q.y,
    ];
    for (const o of items) {
      const b: BandaK = e.noite ? 'noite' : o.r ? o.r.b : 'noite';
      const a = document.createElement('a');
      const acima = !o.top && !!nv && !spotDentroDoNivel(o.sp.nivelPorModalidade?.[e.d] ?? o.sp.nivel, nv);
      a.className = 'rot' + (o.top ? '' : ' menor') + (acima ? ' acima' : '');
      if (acima) a.dataset.acimaNivel = '';
      a.href = href(o.sp.id);
      a.style.setProperty('--c', V6_BANDAS[b].c);
      a.style.setProperty('--t', V6_BANDAS[b].t);
      a.style.left = '0';
      a.style.top = '0';
      a.style.visibility = 'hidden';
      a.dataset.spot = o.sp.id;
      a.dataset.banda = b;
      if (o.top) a.dataset.top = String(ids.indexOf(o.sp.id) + 1);
      const rt = document.createElement('span');
      rt.className = 'rt';
      rt.textContent = o.sp.curto || o.sp.nome;
      const rn = document.createElement('span');
      rn.className = 'rn';
      rn.textContent = o.r && o.r.n != null ? String(o.r.n) : '–';
      a.append(rt, rn);
      a.setAttribute('aria-label', cc.rotAria(o.sp.nome, cc.banda[b], o.r?.n ?? null));
      box.appendChild(a);
      const w = a.offsetWidth;
      const hh = a.offsetHeight;
      const d = o.top ? 26 : 18;
      const C: Array<[number, number, number]> = [];
      for (let k = 0; k < 9; k++)
        for (const [sx, sy] of [[-1, 1], [-1, 0], [1, 1], [1, 0], [-1, -1], [1, -1], [0, 1]] as const) {
          const dx = sx < 0 ? -w - d - k * 4 : sx > 0 ? d + k * 4 : -w / 2;
          const dy =
            sy > 0 ? d * 0.3 + k * (hh * 0.55) : sy < 0 ? -hh - d * 0.3 - k * (hh * 0.55) : -hh / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (hh * 0.6);
          const x = o.p.x + dx;
          const y = o.p.y + dy;
          const ex = Math.max(x, Math.min(o.p.x, x + w));
          const ey = Math.max(y, Math.min(o.p.y, y + hh));
          C.push([x, y, Math.hypot(ex - o.p.x, ey - o.p.y) * (sx < 0 && sy >= 0 ? 0.8 : 1)]);
        }
      C.sort((u, v) => u[2] - v[2]);
      const semCruzar = ([x, y]: [number, number, number]) => !guias.some((g) => cruzam(g, guiaDe(x, y, w, hh, o.p)));
      let cand: [number, number] | undefined = (C.find((k) => livre(k[0], k[1], w, hh) && semCruzar(k)) ??
        C.find(([x, y]) => livre(x, y, w, hh))) as [number, number] | undefined;
      if (!cand) {
        if (!o.top) {
          a.remove();
          continue;
        }
        cand = [clamp(o.p.x - w - d, 4, W - w - 4), clamp(o.p.y + d * 0.4, topoLivre, fundo - hh)];
      }
      const [x, y] = cand;
      postos.push({ x, y, w, h: hh });
      a.style.left = x + 'px';
      a.style.top = y + 'px';
      a.style.visibility = '';
      const [ex, ey] = guiaDe(x, y, w, hh, o.p);
      guias.push([ex, ey, o.p.x, o.p.y]);
      const ln = document.createElementNS(SVGNS, 'path');
      ln.setAttribute('d', `M${ex.toFixed(1)} ${ey.toFixed(1)} L${o.p.x.toFixed(1)} ${o.p.y.toFixed(1)}`);
      ln.setAttribute('fill', 'none');
      ln.setAttribute('stroke', 'rgba(243,248,251,.75)');
      ln.setAttribute('stroke-width', o.top ? '1.5' : '1');
      svg.appendChild(ln);
      feitos.push({ a, ln, x, y, w, h: hh, p: o.p });
    }
    // Último recurso do «semCruzar»: duas guias que se cruzaram (vizinhos muito juntos, p. ex.
    // Caparica e Lagoa no telemóvel) trocam de lado, cada rótulo encostado ao lado do outro.
    for (let i = 0; i < feitos.length; i++)
      for (let j = i + 1; j < feitos.length; j++) {
        const A = feitos[i];
        const B = feitos[j];
        const gA = guiaDe(A.x, A.y, A.w, A.h, A.p);
        const gB = guiaDe(B.x, B.y, B.w, B.h, B.p);
        if (!cruzam(gA, gB)) continue;
        const naPos = (de: typeof A, para: typeof A) => ({ x: para.x + para.w / 2 > para.p.x ? para.x : para.x + para.w - de.w, y: para.y });
        const nA = naPos(A, B);
        const nB = naPos(B, A);
        const resto = feitos.filter((q) => q !== A && q !== B);
        const cabe = (n: { x: number; y: number }, q: typeof A) =>
          n.x >= 4 && n.x + q.w <= W - 4 && n.y >= topoLivre && n.y + q.h <= fundo &&
          !resto.some((r) => n.x < r.x + r.w + 4 && n.x + q.w + 4 > r.x && n.y < r.y + r.h + 3 && n.y + q.h + 3 > r.y) &&
          !pontos.some((t) => t.x > n.x - 5 && t.x < n.x + q.w + 5 && t.y > n.y - 5 && t.y < n.y + q.h + 5);
        const sobre = nA.x < nB.x + B.w + 4 && nA.x + A.w + 4 > nB.x && nA.y < nB.y + B.h + 3 && nA.y + A.h + 3 > nB.y;
        const gA2 = guiaDe(nA.x, nA.y, A.w, A.h, A.p);
        const gB2 = guiaDe(nB.x, nB.y, B.w, B.h, B.p);
        if (!cabe(nA, A) || !cabe(nB, B) || sobre || cruzam(gA2, gB2)) continue;
        for (const [q, n, g] of [[A, nA, gA2], [B, nB, gB2]] as const) {
          q.x = n.x;
          q.y = n.y;
          q.a.style.left = n.x + 'px';
          q.a.style.top = n.y + 'px';
          q.ln.setAttribute('d', `M${g[0].toFixed(1)} ${g[1].toFixed(1)} L${q.p.x.toFixed(1)} ${q.p.y.toFixed(1)}`);
        }
      }
    postos.splice(0, postos.length, ...feitos.map(({ x, y, w, h }) => ({ x, y, w, h })));
    const lbl = (txt: string, ll: [number, number]) => {
      const q = p.proj(ll);
      // nomes decorativos (aria-hidden): no desktop podem descer até ao topo da faixa do CTA (o «ATLÂNTICO» da maquete fica entre a legenda e o CTA)
      if (!q || q.x < 40 || q.x > W - 40 || q.y < topoLivre || q.y > (dk ? H - 112 : fundo)) return;
      if (postos.some((r) => q.x > r.x - 50 && q.x < r.x + r.w + 50 && q.y > r.y - 12 && q.y < r.y + r.h + 12)) return;
      const el = document.createElement('div');
      el.className = 'top-lbl';
      el.textContent = txt;
      el.style.left = q.x + 'px';
      el.style.top = q.y + 'px';
      el.setAttribute('aria-hidden', 'true');
      box.appendChild(el);
    };
    for (const l of geo.current?.lugares ?? [])
      if (l.n !== 'Coimbra' || dk) lbl(l.n, [l.p[0] + (l.n === 'Lisboa' ? 0.62 : 0.34), l.p[1] + (l.n === 'Lisboa' ? 0.1 : 0)]);
    lbl(cc.lugares.espanha, dk ? [-6.3, 40.6] : [-6.9, 40.3]);
    if (dk) lbl(cc.lugares.atlantico, [-10.9, 38.2]);
  }, []);

  /* ---------- vento em partículas: IDW dos spots na hora mostrada ---------- */
  const campoVento = useCallback(() => {
    const p = proj.current;
    const cv = ventoEl.current;
    const v = vento.current;
    if (!p || !cv || !v) return;
    const { M: m, E: e } = st.current;
    const i = e.horaMapa;
    const pts = m.spots.map((s) => [s.lon, s.lat, s.h[i].w, s.h[i].wd] as const);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    const S = 24;
    const nx = Math.ceil(W / S) + 1;
    const ny = Math.ceil(H / S) + 1;
    const g: Array<[number, number] | null> = new Array(nx * ny);
    const kpx = desk.current ? 2.2 : 1.8; // px/s por nó (exagero visual; o número está nos rótulos)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const ll = p.unproj([x * S, y * S]);
        if (!ll || ll[0] < BOX_VENTO[0] || ll[0] > BOX_VENTO[2] || ll[1] < BOX_VENTO[1] || ll[1] > BOX_VENTO[3]) {
          g[y * nx + x] = null;
          continue;
        }
        const w = idwVento(pts, ll[0], ll[1]);
        const p0 = p.proj(ll);
        const pe = p.proj([ll[0] + 0.06, ll[1]]);
        const pn = p.proj([ll[0], ll[1] + 0.06]);
        if (!p0 || !pe || !pn) {
          g[y * nx + x] = null;
          continue;
        }
        const ex = [pe.x - p0.x, pe.y - p0.y];
        const en = [pn.x - p0.x, pn.y - p0.y];
        const le = Math.hypot(ex[0], ex[1]) || 1;
        const ln = Math.hypot(en[0], en[1]) || 1;
        const vx = (w.u * ex[0]) / le + (w.v * en[0]) / ln;
        const vy = (w.u * ex[1]) / le + (w.v * en[1]) / ln;
        const mm = Math.hypot(vx, vy) || 1;
        const sp = w.w * kpx * clamp(ln / 9, 0.55, 1.25); // perto do horizonte, mais devagar (perspectiva)
        g[y * nx + x] = [(vx / mm) * sp, (vy / mm) * sp];
      }
    v.campo((x, y) => {
      const gx = x / S;
      const gy = y / S;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      if (x0 < 0 || y0 < 0 || x0 >= nx - 1 || y0 >= ny - 1) return null;
      const a = g[y0 * nx + x0];
      const b = g[y0 * nx + x0 + 1];
      const cc = g[(y0 + 1) * nx + x0];
      const d = g[(y0 + 1) * nx + x0 + 1];
      if (!a || !b || !cc || !d) return null;
      const fx = gx - x0;
      const fy = gy - y0;
      return [lerp(lerp(a[0], b[0], fx), lerp(cc[0], d[0], fx), fy), lerp(lerp(a[1], b[1], fx), lerp(cc[1], d[1], fx), fy)];
    });
    if (reduz.current || modoRef.current === 'plano') v.estatico();
  }, []);

  /* ---------- enquadramento: no telemóvel, o top 3; no desktop, a costa toda ---------- */
  const enquadra = useCallback((logo: boolean) => {
    const h = gl.current;
    const f = fig.current;
    if (!h || !f) return;
    const { M: m, E: e } = st.current;
    if (desk.current) {
      const ch = 'desk|' + f.clientWidth + 'x' + f.clientHeight;
      if (chaveCam.current === ch) return;
      chaveCam.current = ch;
      const pts = m.spots.map((s) => [s.lon, s.lat] as [number, number]);
      h.salta(h.ajusta(pts, { z0: 6.3, tx: 0.48, ty: 0.58, v: 0.5, h: 0.66, pitch: CAM_DESK.pitch, bearing: CAM_DESK.bearing, zr: [5.3, 7.2] }));
      return;
    }
    const chave = e.d + '|' + e.top.map((r) => r.sp.id).join(',') + '|' + f.clientHeight;
    if (chave === chaveCam.current) return;
    chaveCam.current = chave;
    const pts = e.top.map((r) => [r.sp.lon, r.sp.lat] as [number, number]);
    if (!pts.length) return;
    const todosSul = e.top.every((r) => ['sagres', 'algarve'].includes(r.sp.zona) && r.sp.sp.praiaVirada < 200);
    // o top 3 fica entre o cabeçalho do cartão e a faixa do CTA
    const alvo = h.ajusta(pts, { z0: 6.4, tx: todosSul ? 0.5 : 0.62, ty: 0.47, v: 0.3, h: 0.42, pitch: CAM_MOB.pitch, bearing: CAM_MOB.bearing, zr: ZMOB });
    if (logo || reduz.current) h.salta(alvo);
    else h.anima(alvo);
  }, []);

  /* ---------- mapa plano (sem WebGL): a mesma informação, norte para cima ---------- */
  const carta = useCallback(() => {
    const svg = cartaEl.current;
    const G = geo.current;
    if (!svg || !G) return;
    const { M: m, E: e } = st.current;
    const W = svg.clientWidth || 390;
    const H = svg.clientHeight || 560;
    const dk = desk.current;
    const box = dk ? [-12.4, 36.6, -5.6, 42.3] : [-10.4, 36.8, -6.6, 42.1];
    const k = Math.cos((39.4 * Math.PI) / 180);
    const s = Math.min(W / ((box[2] - box[0]) * k), H / (box[3] - box[1]));
    const ox = (W - (box[2] - box[0]) * k * s) / 2 + (dk ? 0 : W * 0.08);
    const oy = (H - (box[3] - box[1]) * s) / 2;
    proj.current = {
      proj: ([lon, lat]) => ({ x: ox + (lon - box[0]) * k * s, y: oy + (box[3] - lat) * s }),
      unproj: ([x, y]) => [box[0] + (x - ox) / (k * s), box[3] - (y - oy) / s],
    };
    const pr = proj.current.proj;
    const P = (cs: number[][]) =>
      cs
        .map(([x, y]) => {
          const q = pr([x, y])!;
          return q.x.toFixed(1) + ' ' + q.y.toFixed(1);
        })
        .join('L');
    const path = (g: GeoJSON.Geometry) => {
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      return polys.map((pp) => pp.map((r) => 'M' + P(r) + 'Z').join('')).join('') + lines.map((l) => 'M' + P(l)).join('');
    };
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = luz(m.spots, e.horaMapa);
    const cor = cores();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const add = (tag: string, at: Record<string, string | number>) => {
      const el = document.createElementNS(SVGNS, tag);
      for (const [a, v] of Object.entries(at)) el.setAttribute(a, String(v));
      svg.appendChild(el);
    };
    add('rect', { width: W, height: H, fill: aplicarLuz(COR.mar, L) });
    for (const f of G.deep.features) add('path', { d: path(f.geometry), fill: COR.fundo, 'fill-opacity': 0.18, 'fill-rule': 'evenodd' });
    for (const f of G.strips[e.d].features) {
      const sid = (f.properties as { s: string; r: number }).s;
      if (!cor[sid]) continue;
      add('path', { d: path(f.geometry), fill: corTroco(cor[sid], (f.properties as { r: number }).r, L) });
    }
    add('path', { 'fill-rule': 'evenodd', d: path(G.land.features[0].geometry), fill: aplicarLuz(COR.terra, L), stroke: COR.costa, 'stroke-opacity': 0.55, 'stroke-width': 1 });
    for (const f of G.border.features) add('path', { d: path(f.geometry), stroke: COR.fronteira, 'stroke-dasharray': '3 2', opacity: 0.35, fill: 'none' });
    const topIds = e.top.map((r) => r.sp.id);
    for (const sp of m.spotsDe(e.d)) {
      const q = pr([sp.lon, sp.lat])!;
      const t = topIds.includes(sp.id);
      add('circle', { cx: q.x, cy: q.y, r: t ? 7.5 : 5, fill: '#030E18' });
      add('circle', { cx: q.x, cy: q.y, r: t ? 5.5 : 3.4, fill: V6_BANDAS[cor[sp.id] ?? 'noite'].c });
    }
    rotulos();
    campoVento();
  }, [rotulos, campoVento]);

  /* ---------- arranque: 3D ou plano quando o mapa se aproxima do viewport ---------- */
  useEffect(() => {
    const f = fig.current;
    if (!f) return;
    reduz.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduzido(reduz.current);
    desk.current = window.matchMedia('(min-width: 1024px)').matches;
    if (ventoEl.current)
      vento.current = criarVento(ventoEl.current, {
        n: desk.current ? 200 : 90,
        vida: [4, 8],
        cauda: 2.8,
        vref: 46,
        meandro: 0.42,
        largura: desk.current ? 1.5 : 1.3,
        alfa: 0.62,
      });
    let iniciado = false;
    let vivo = true;
    const usarPlano = () => {
      gl.current?.destruir();
      gl.current = null;
      modoRef.current = 'plano';
      setModo('plano');
      requestAnimationFrame(() => {
        vento.current?.tamanho();
        carta();
        setPronto(true);
      });
    };
    const iniciar = async () => {
      iniciado = true;
      try {
        const r = await fetch(getAssetPath('/geo/costa-home.json'));
        geo.current = (await r.json()) as GeoCosta;
      } catch {
        return;
      }
      if (!vivo) return;
      const forcar = forcarRef.current || new URLSearchParams(window.location.search).get('webgl') === '0';
      if (forcar || !temWebGL2()) {
        usarPlano();
        return;
      }
      try {
        const { criarCostaGL } = await import('./costaMapaGL');
        if (!mapaEl.current || !vivo) return;
        modoRef.current = '3d';
        setModo('3d');
        const h = criarCostaGL({
          container: mapaEl.current,
          geo: geo.current!,
          cam: desk.current ? CAM_DESK : CAM_MOB,
          pintura: pintura(),
          onPronto: () => {
            rotulos();
            campoVento();
            if (!reduz.current) vento.current?.iniciar();
            campoVento();
            setTimeout(() => setPronto(true), 400);
          },
          onMexe: (inicio) => {
            if (inicio) {
              rotEl.current?.classList.add('movendo');
              vento.current?.limpar();
            } else {
              rotEl.current?.classList.remove('movendo');
              rotulos();
              campoVento();
            }
          },
          // o link da porta cobre o canvas: sem navegação por proximidade (#273)
          onPerdido: () => usarPlano(),
        });
        gl.current = h;
        proj.current = h;
        enquadra(true);
      } catch {
        usarPlano();
      }
    };
    // Arranque diferido (Lighthouse do run 38819063476: com o MapLibre + relevo a arrancar
    // logo no 1.º ecrã do desktop, 2,7 MB de tiles e ~9 s de main thread → TBT 7,9 s, LCP
    // 4,3 s). O mapa só arranca quando está perto do viewport E (o visitante mexe na página
    // — rato, toque, tecla, roda, scroll — OU a página já assentou: `load` + ocioso +
    // ARRANQUE_OCIOSO_MS). Até lá fica o poster da figura, no mesmo sítio e com as mesmas
    // medidas (sem CLS); o resto da figura (título, legenda, chip, crédito) já está no HTML.
    let perto = false;
    let querido = false;
    let espera = 0;
    let ocioso = 0;
    const talvez = () => {
      if (perto && querido && !iniciado && vivo) void iniciar();
    };
    const INTENCAO = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    const largaIntencao = () => {
      for (const ev of INTENCAO) window.removeEventListener(ev, quer, true);
    };
    function quer() {
      if (querido) return;
      querido = true;
      largaIntencao();
      talvez();
    }
    for (const ev of INTENCAO) window.addEventListener(ev, quer, { capture: true, passive: true });
    const ric: (cb: () => void) => number =
      typeof window.requestIdleCallback === 'function'
        ? (cb) => window.requestIdleCallback(cb, { timeout: 2000 })
        : (cb) => window.setTimeout(cb, 1);
    const depoisDoLoad = () => {
      espera = window.setTimeout(() => {
        ocioso = ric(quer);
      }, ARRANQUE_OCIOSO_MS);
    };
    if (document.readyState === 'complete') depoisDoLoad();
    else window.addEventListener('load', depoisDoLoad, { once: true });
    const io = new IntersectionObserver(
      (es) => {
        const vis = es.some((e) => e.isIntersecting);
        vento.current?.pausar(!vis);
        if (vis) {
          perto = true;
          talvez();
        }
      },
      { rootMargin: '200px 0px', threshold: 0.01 },
    );
    io.observe(f);
    const rs = () => {
      const dk = window.matchMedia('(min-width: 1024px)').matches;
      if (dk !== desk.current) chaveCam.current = '';
      desk.current = dk;
      if (modoRef.current === 'plano') {
        vento.current?.tamanho();
        carta();
        return;
      }
      if (gl.current) enquadra(true);
      rotulos();
      vento.current?.tamanho();
      vento.current?.limpar();
      campoVento();
    };
    window.addEventListener('resize', rs);
    const vis = () => vento.current?.pausar(document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => {
      vivo = false;
      io.disconnect();
      largaIntencao();
      window.removeEventListener('load', depoisDoLoad);
      window.clearTimeout(espera);
      if (ocioso && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(ocioso);
      window.removeEventListener('resize', rs);
      document.removeEventListener('visibilitychange', vis);
      vento.current?.parar();
      gl.current?.destruir();
      gl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- mudar de modalidade / bloco: o mesmo ranking pinta o mar, os rótulos e o vento ---------- */
  const chaveEstado = `${E.d}|${E.bId}|${E.horaMapa}|${E.top.map((r) => r.sp.id + r.n).join(',')}|${M.spots.length}|${nivel ?? ''}`;
  useEffect(() => {
    if (modoRef.current === 'plano') {
      carta();
      return;
    }
    if (!gl.current) return;
    gl.current.pinta(pintura());
    rotulos();
    campoVento();
    enquadra(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveEstado]);

  const t0 = E.top[0];
  const hv = t0 ? t0.sp.h[E.horaMapa] : null;
  const poster = (w: 390 | 1440) => getAssetPath(`/images/home/costa-poster-${w}.webp`);
  return (
    <section ref={sec} id="mapa-sec" className="mapa-sec" aria-label={c.mapaRegiao} data-testid="home-mapa">
      <figure
        ref={fig}
        className={`cena porta${modo === 'plano' ? ' sem-webgl' : ''}`}
        aria-label={c.mapaFig}
        data-modo={modo}
        data-pronto={pronto ? '1' : '0'}
      >
        {/* poster neutro (só costa e mar, sem notas nem rótulos): o 1.º paint do cartão até o 3D arrancar */}
        <picture className="poster">
          <source media="(min-width: 1024px)" srcSet={poster(1440)} width={POSTER[1440][0]} height={POSTER[1440][1]} />
          <img
            src={poster(390)}
            alt=""
            width={POSTER[390][0]}
            height={POSTER[390][1]}
            decoding="async"
            fetchPriority="low"
            data-testid="home-mapa-poster"
          />
        </picture>
        <svg ref={cartaEl} className="carta" aria-hidden="true" />
        <div ref={mapaEl} className="mapa" aria-hidden="true" />
        <canvas ref={ventoEl} className="vento" aria-hidden="true" data-testid="home-vento" data-estatico={reduzido || modo === 'plano' ? '1' : '0'} />
        <div className="cab">
          <h2 className="sec" id="mapa-t">
            {c.mapa} <span>{E.mapaQ}</span>
          </h2>
          {t0 && hv ? (
            <span className="vento-chip" data-testid="home-vento-chip">
              <svg viewBox="0 0 28 10" aria-hidden="true">
                <path d="M1 3h18M1 7h24M19 1l4 2-4 2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              </svg>
              {c.chipVento(t0.sp.curto || t0.sp.nome, rumo(hv.wd), hv.w)}
            </span>
          ) : null}
          <p className="sub">
            {c.mapaSub[E.d]}
            <span className="vt">{c.mapaSubVento}</span>
          </p>
        </div>
        <p className="estatica">{c.estatica}</p>
        <div className="leg" data-testid="legenda-bandas">
          {(E.noite ? (['noite'] as BandaK[]) : (BANDAS_ORDEM as readonly BandaK[])).map((b) => (
            <span key={b} className="chip" style={bandaVars(b) as CSSProperties}>
              {c.banda[b]}
              {c.legNum[b] ? <b> {c.legNum[b]}</b> : null}
            </span>
          ))}
          {nivel && legendaNivel ? (
            <span className="nvleg" data-testid="legenda-nivel">
              <i aria-hidden="true" />
              {legendaNivel}
            </span>
          ) : null}
          <span className="txt">{c.legenda}</span>
        </div>
        <div className="cta" aria-hidden="true">
          <span className="cta-tx">
            <span className="cta-t">{c.explorarMapa}</span>
            <span className="cta-s" id="porta-s">
              {c.ctaLinha(nSpots, E.d)}
            </span>
          </span>
          <span className="cta-seta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
        {/* stretched link: o cartão inteiro leva ao /mapa; por cima dele só os rótulos e o crédito */}
        <a className="porta-a" href={hrefMapa()} aria-describedby="porta-s" data-testid="home-porta-mapa">
          <span className="sr">{c.explorarMapa}</span>
        </a>
        <div ref={rotEl} className="rotulos" data-testid="home-rotulos">
          <svg ref={guiasEl} className="guias" aria-hidden="true" />
        </div>
        <p className="credito-mapa">
          © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · {c.relevo}{' '}
          <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a> · MapLibre
        </p>
      </figure>
    </section>
  );
}
