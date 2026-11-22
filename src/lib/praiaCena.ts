/**
 * Cena da praia (#184): cores, luz, câmara e frentes de onda, partilhadas
 * pelo mapa 3D (MapLibre) e pela vista plana (sem WebGL). Mesmas fórmulas da
 * maquete v6 (`guincho.html`: `luz`, `aplicarLuz`, `corMar`), generalizadas a
 * qualquer spot: a profundidade vem do próprio relevo (AWS Terrain Tiles,
 * terrarium, com batimetria) e a câmara da orientação da praia (#178).
 */
import { V6_BANDAS } from '@/lib/v6Tokens';
import type { BandaK } from '@/lib/modalidades';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return toHex(A.map((v, i) => lerp(v, B[i], t)));
};
export const hexRgb = hex;

export interface Luz {
  day: number;
  gold: number;
}
/** Luz da hora: dia (0–1) e hora dourada, pela elevação do sol e nuvens. */
export function luz(sunEl: number, cloud: number | null | undefined): Luz {
  const day = sstep(-7, 7, sunEl);
  const cl = (cloud ?? 0) / 100;
  return { day, gold: day * (1 - sstep(3, 22, sunEl)) * (1 - cl * 0.75) };
}
export const aplicarLuz = (c: string, L: Luz, f = 1) => {
  let o = mix(c, '#F2A65A', L.gold * 0.2 * f);
  o = mix(o, '#000814', (1 - L.day) * 0.42 * f);
  return o;
};

/**
 * Ângulo CSS (graus) para a seta do chip do vento ficar alinhada com as
 * partículas no ecrã, compensando tanto o `bearing` como o `pitch` da câmara.
 */
export function anguloSetaVento(wd: number, bearing = 0, pitch = 0): number {
  const rad = ((wd - bearing) * Math.PI) / 180;
  const vx = -Math.sin(rad);
  const vy = Math.cos(rad) * Math.cos((pitch * Math.PI) / 180);
  const ang = (Math.atan2(-vx, vy) * 180) / Math.PI;
  return ((ang % 360) + 360) % 360;
}

/** Remove sufixo de região repetitivo entre parênteses num rótulo de vizinho (ex.: "Coxos (Ericeira)" → "Coxos"). */
export function rotuloCurtoVizinho(nome: string): string {
  const limpo = nome.replace(/\s*\([^)]+\)\s*$/, '').trim();
  return limpo.length >= 3 ? limpo : nome;
}

/** Resolve o parâmetro `?sport=` do /mapa para o link «Abrir no mapa» nunca filtrar fora o próprio spot. */
export function sportParaMapa(compativeis: readonly string[] | undefined, d: 'kite' | 'surf'): string {
  const ativo = d === 'kite' ? 'kitesurf' : 'surf';
  if (!compativeis?.length) return 'all';
  if (compativeis.includes(ativo)) return ativo;
  return compativeis[0] ?? 'all';
}

export const COR = {
  terra: '#1E3A3E',
  pinhal: '#1C4A3A',
  urb: '#2C4458',
  rocha: '#3B4A52',
  areia: '#C9B07A',
  estrada: '#6C8CA3',
  mar: '#0B3352',
  fundo: '#03101C',
} as const;

/** Cores da terra por cota (0 m, 60, 150, 300 m): mais verde e mais clara a subir, como o pinhal e a rocha da maquete. */
export const TERRA_COTAS = [COR.terra, mix(COR.terra, COR.pinhal, 0.7), mix(COR.pinhal, COR.rocha, 0.35), mix(COR.rocha, '#56677B', 0.25)] as const;

/** Faixas de profundidade (m): 0 (0–5) … 7 (100+), claro junto à praia. */
export const PROF_FAIXAS = [5, 10, 20, 30, 50, 75, 100] as const;
const OC = ['#0F4A73', '#0C3E63', '#0A3354', '#082A47', '#06213A', '#04182C'];
/** Cor do mar na faixa i: a nota da hora junto à praia, azuis do Atlântico ao largo. */
export function corMar(b: BandaK, i: number, L: Luz): string {
  const bc = V6_BANDAS[b].c;
  const c = i === 0 ? mix(bc, COR.mar, 0.06) : i === 1 ? mix(bc, COR.mar, 0.3) : i === 2 ? mix(OC[0], bc, 0.2) : OC[Math.min(5, i - 2)];
  return aplicarLuz(c, L, 0.8);
}
/** Faixa de profundidade de uma elevação (negativa no mar). */
export function faixaDe(elev: number): number {
  const d = -elev;
  for (let i = 0; i < PROF_FAIXAS.length; i++) if (d < PROF_FAIXAS[i]) return i;
  return PROF_FAIXAS.length;
}

const R = Math.PI / 180;
/** Desloca [lon, lat] `km` no rumo `brg` (graus). */
export function desloca(ll: [number, number], brg: number, km: number): [number, number] {
  const dLat = (km / 111.32) * Math.cos(brg * R);
  const dLon = ((km / 111.32) * Math.sin(brg * R)) / Math.cos(ll[1] * R);
  return [ll[0] + dLon, ll[1] + dLat];
}

export interface Camara {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}
/**
 * Câmara vista do mar: olha para terra com um ângulo de 28° (como a maquete no
 * Guincho: praia a 280°, bearing 72°). No desktop fica centrada um pouco ao largo
 * do spot. No telemóvel o spot (`foco`, o ponto do rótulo grande quando há
 * rótulos editoriais) fica no centro do enquadramento: o desvio de 0,65 km ao
 * largo, a 28° do eixo da câmara, punha-o ~20 px ao lado e acima do centro a 390 px.
 */
export function camara(ll: [number, number], praiaVirada: number, desktop: boolean, foco?: [number, number], aguaInterior = false): Camara {
  if (aguaInterior) {
    return {
      center: foco ?? ll,
      zoom: desktop ? 13.0 : 12.4,
      pitch: 55,
      bearing: 0,
    };
  }
  const bearing = (((praiaVirada + 152) % 360) + 360) % 360;
  return {
    center: desktop ? desloca(ll, praiaVirada, 0.75) : (foco ?? ll),
    zoom: desktop ? 13.25 : 12.6,
    pitch: 60,
    bearing,
  };
}

/**
 * Frentes de onda (fallback quando não há grelha de profundidade): linhas
 * paralelas entre si (nunca se cruzam, mesmo com ondulação oblíqua) com
 * curvatura suave de refracção junto à costa; espaçadas pelo período e
 * animadas pela fase `t`. A terra tapa-as (fica por cima no mapa e no plano).
 */
export function frentesOnda(
  ll: [number, number],
  praiaVirada: number,
  sd: number,
  tp: number,
  hs: number,
  t: number,
): Array<Array<[number, number]>> {
  if (!(hs > 0.15) || !(tp > 0)) return [];
  let alfa = ((sd - praiaVirada + 540) % 360) - 180; // 0 = entra de frente
  alfa = clamp(alfa, -70, 70);
  const lam = clamp(tp * 0.055, 0.25, 1.1); // km entre frentes (exagerado para se ver)
  const fase = ((t * 0.08) % lam + lam) % lam;
  const dir = praiaVirada + 90 + alfa * 0.4;
  const out: Array<Array<[number, number]>> = [];
  for (let k = 0; k < 14; k++) {
    const dist = 0.12 + k * lam + (lam - fase);
    if (dist > 5.5) break;
    const linha: Array<[number, number]> = [];
    for (let s = -3.6; s <= 3.61; s += 0.45) {
      // curvatura ligeira crescente para o largo mas idêntica em k → frentes sempre paralelas (dist(k+1) > dist(k))
      const curva = 0.018 * s * s;
      const base = desloca(ll, praiaVirada, dist + curva);
      linha.push(desloca(base, dir, s));
    }
    out.push(linha);
  }
  return out;
}
