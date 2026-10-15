/**
 * Fotografias da página de spot v6 (#184): uma por spot e modalidade, do
 * Unsplash (Unsplash License) e uma do Wikimedia Commons (CC BY-SA 3.0, o
 * Guincho em kite). Crédito em cada foto; as substitutas dizem o sítio real.
 *
 * Spots sem foto própria: a foto da mesma modalidade do spot curado mais
 * próximo (≤ 60 km), marcada como substituta com o sítio real. Mais longe
 * (ilhas, por exemplo) não há foto: o hero mostra o fundo `mar`.
 * Lista legível: `public/fotos/spots/CREDITOS.md`.
 */
import data from './spotFotos.json';
import { getAssetPath } from '@/lib/paths';
import type { Spot } from '@/types';
import type { Modalidade } from '@/lib/modalidades';
import { spots as TODOS } from '@/lib/spots';

export type EstadoFoto = 'real' | 'zona' | 'sub';
export interface FotoMeta {
  ficheiro: string;
  card: string;
  w: number;
  h: number;
  wc: number;
  hc: number;
  autor: string;
  fonte: 'Unsplash' | 'Wikimedia Commons';
  lic: string;
  licUrl: string;
  pagina: string;
  perfil: string;
  local: string;
  altPt: string;
  altEn: string;
  pos: string;
  up?: number;
  posd?: string;
  fl?: number;
}
export interface FotoSpot extends FotoMeta {
  id: string;
  estado: EstadoFoto;
  /** Sítio real da foto (mostrado no crédito quando não é o próprio spot). */
  onde: string;
  src: string;
  srcCard: string;
}

const D = data as unknown as {
  fotos: Record<string, FotoMeta>;
  spots: Record<string, Record<Modalidade, { foto: string; estado: EstadoFoto; onde: string }>>;
};

const RAIO_SUB_KM = 60;

function distKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function montar(id: string, estado: EstadoFoto, onde: string): FotoSpot {
  const m = D.fotos[id];
  return {
    ...m,
    id,
    estado,
    onde,
    src: getAssetPath(`/fotos/spots/${m.ficheiro}`),
    srcCard: getAssetPath(`/fotos/spots/${m.card}`),
  };
}

export function fotoDoSpot(spot: Pick<Spot, 'id' | 'lat' | 'lon'>, d: Modalidade): FotoSpot | null {
  const e = D.spots[spot.id]?.[d];
  if (e) return montar(e.foto, e.estado, e.onde);
  let melhor: { id: string; km: number } | null = null;
  for (const sid of Object.keys(D.spots)) {
    const s = TODOS.find((x) => x.id === sid);
    if (!s) continue;
    const km = distKm(spot, s);
    if (km <= RAIO_SUB_KM && (!melhor || km < melhor.km)) melhor = { id: sid, km };
  }
  if (!melhor) return null;
  const f = D.spots[melhor.id][d];
  const onde = f.estado === 'real' ? D.fotos[f.foto].local.split(',')[0] || f.onde : f.onde;
  return montar(f.foto, 'sub', onde);
}

export const FOTOS_META = D.fotos;
export const FOTOS_POR_SPOT = D.spots;
