/**
 * Cena do mapa da costa (home v6, #183): luz da hora, cores do mar por troço
 * e câmara. Puro (sem MapLibre): serve o mapa 3D (`CostaMapaGL`) e o mapa
 * plano sem WebGL (`costaCarta`). Constantes e fórmulas da maquete aprovada
 * (`docs/design/maquetes/v6-atlantico/index.html`: `luz`, `aplicarLuz`,
 * `corTroco`, `COR`, `CAM_DESK`, `CAM_MOB`).
 */
import { V6_BANDAS } from '@/lib/v6Tokens';
import type { BandaK } from '@/lib/modalidades';
import type { SpotHome } from './homeV6';

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

export const COR = { mar: '#0B3352', fundo: '#020A13', terra: '#14283A', costa: '#BFEFFF', fronteira: '#7F9BB2' } as const;

export interface Luz {
  day: number;
  gold: number;
  grey: number;
  az: number;
}

/** Luz da hora `i`: o sol do spot de referência (Guincho) e a nebulosidade média (0 quando o feed não a traz). */
export function luz(spots: readonly SpotHome[], i: number): Luz {
  const REF = spots.find((s) => s.id === 'guincho') ?? spots[0];
  const el = REF?.h[i]?.sunEl ?? -20;
  const cl = spots.length ? spots.reduce((a, s) => a + (s.h[i]?.cloud ?? 0), 0) / spots.length / 100 : 0;
  const day = sstep(-7, 7, el);
  return { day, gold: day * (1 - sstep(3, 22, el)) * (1 - cl * 0.75), grey: cl * 0.65 * day, az: REF?.h[i]?.sunAz ?? 0 };
}
export const aplicarLuz = (c: string, L: Luz, f = 1) => {
  let r = mix(c, '#F2A65A', L.gold * 0.18 * f);
  r = mix(r, '#000814', (1 - L.day) * 0.55 * f);
  return r;
};
/** Cor de um troço de mar (anel 0 junto à praia, 1, 2 ao largo) na cor da banda. */
export function corTroco(b: BandaK, ring: number, L: Luz): string {
  const bc = V6_BANDAS[b].c;
  const c = ring === 0 ? mix(bc, COR.mar, 0.08) : ring === 1 ? mix(bc, COR.mar, 0.42) : mix(bc, COR.mar, 0.74);
  return aplicarLuz(c, L, 0.7);
}

export interface CamaraCosta {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}
/** Vista do mar, de sudoeste: a costa em diagonal e a nortada a correr quase na horizontal. */
export const CAM_DESK: CamaraCosta = { center: [-8.75, 39.15], zoom: 6.3, pitch: 46, bearing: 56 };
export const CAM_MOB: CamaraCosta = { center: [-8.9, 38.95], zoom: 6.12, pitch: 45, bearing: 50 };
export const ZMOB: [number, number] = [5.45, 6.75];
/** Caixa do campo de vento (fora dela não há partículas). */
export const BOX_VENTO = [-15, 34, -3, 45] as const;

export interface GeoCosta {
  land: GeoJSON.FeatureCollection;
  border: GeoJSON.FeatureCollection;
  deep: GeoJSON.FeatureCollection;
  strips: { kite: GeoJSON.FeatureCollection; surf: GeoJSON.FeatureCollection };
  lugares: Array<{ n: string; p: [number, number] }>;
}
