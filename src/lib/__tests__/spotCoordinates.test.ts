/**
 * Coordenadas dos spots (22/10): 31 spots estavam longe da praia (1,1 a 25 km)
 * e foram corrigidos para a praia OSM `natural=beach` (Nominatim). Guarda:
 *  - cada spot corrigido a ≤ 500 m da coordenada esperada;
 *  - `src/lib/spots.ts` e `data/coast-orientation-review.json` com as mesmas coordenadas;
 *  - os spots corrigidos a ≤ 1 km da linha de costa OSM (distância do ficheiro de revisão).
 * Sem rede: só lê ficheiros do repositório.
 */
import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import review from '../../../data/coast-orientation-review.json';

type Linha = { id: string; lat: number; lon: number; distCostaM: number | null };
const porId = new Map((review as unknown as { spots: Linha[] }).spots.map((l) => [l.id, l]));

/** [id, lat, lon] — praia OSM `natural=beach` (Nominatim), 22/10. */
const CORRIGIDOS: Array<[string, number, number]> = [
  ['canavial', 37.0839, -8.6790],
  ['seixal-bay', 38.6377, -9.1121],
  ['alteirinhos', 37.5185, -8.7886],
  ['castelo-neiva', 41.6299, -8.8213],
  ['santa-barbara', 37.8167, -25.5487],
  ['garrão', 37.0412, -8.0528],
  ['monte-verde', 37.8230, -25.5268],
  ['nova-vaga', 38.5985, -9.2088],
  ['anjos', 37.0065, -25.1586],
  ['cordoama', 37.1092, -8.9372],
  ['amorosa', 41.6458, -8.8249],
  ['sao-lourenco', 39.0117, -9.4212],
  ['funchal', 32.6392, -16.9512],
  ['ofir', 41.5185, -8.7878],
  ['milicias', 37.7510, -25.6252],
  ['almoxarife', 38.5543, -28.6095],
  ['praia-torreira', 40.7371, -8.7224],
  ['ilha-faro', 37.0031, -7.9860],
  ['praia-da-rainha', 38.6164, -9.2184],
  ['malhao', 37.7802, -8.8021],
  ['barriga', 37.1189, -8.9305],
  ['praia-verde', 37.1739, -7.4793],
  ['consolacao', 39.3378, -9.3602],
  ['tres-irmaos', 37.1197, -8.5813],
  ['castelejo', 37.1001, -8.9455],
  ['sao-vicente-madeira', 32.8101, -17.0466],
  ['adraga', 38.8037, -9.4848],
  ['apulia', 41.4828, -8.7779],
  ['vila-praia-ancora', 41.8133, -8.8651],
  ['furadouro', 40.8853, -8.6725],
  ['seixal-madeira', 32.8219, -17.1031],
];

/** Distância em metros (haversine). */
function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

describe('coordenadas dos spots', () => {
  it('a lista de corrigidos tem 31 spots, todos em spots.ts', () => {
    expect(CORRIGIDOS.length).toBe(31);
    for (const [id] of CORRIGIDOS) expect(spots.some((s) => s.id === id), id).toBe(true);
  });

  it.each(CORRIGIDOS)('%s fica a ≤ 500 m da praia esperada', (id, lat, lon) => {
    const s = spots.find((x) => x.id === id)!;
    expect(distM(s.lat, s.lon, lat, lon)).toBeLessThanOrEqual(500);
  });

  it('spots.ts e o ficheiro de revisão têm as mesmas coordenadas', () => {
    for (const s of spots) {
      const l = porId.get(s.id);
      expect(l, s.id).toBeDefined();
      expect([l!.lat, l!.lon], s.id).toEqual([s.lat, s.lon]);
    }
  });

  it('os spots corrigidos ficam a ≤ 1 km da linha de costa OSM', () => {
    for (const [id] of CORRIGIDOS) {
      const d = porId.get(id)?.distCostaM;
      expect(d, id).not.toBeNull();
      expect(d!, id).toBeLessThanOrEqual(1000);
    }
  });
});
