/**
 * Coordenadas dos spots (22/10): 31 spots estavam longe da praia (1,1 a 25 km)
 * e foram corrigidos para a praia OSM `natural=beach` (Nominatim); numa 2.ª passagem
 * mais 6, com coordenadas confirmadas pelo Pedro (`fao` e `barrinha-faro` são pins
 * dele no Google Maps). Em Fão ficam 2 spots: `fao` (praia, surf + kite; absorveu o
 * duplicado `fao-ofir-surf`) e `esposende` (rio Cávado, só kite). Na 3.ª passagem (23/10)
 * mais pins do Pedro, `esposende-praia` sem kite, `rodanho` só kite, e 8 spots removidos
 * (Fão/Ofir duplicados, Póvoa, Castelo do Neiva, Garrão, Sines). Guarda:
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

/** [id, lat, lon] — praia OSM `natural=beach` (Nominatim), 22/10; os últimos 6 confirmados pelo Pedro. */
const CORRIGIDOS: Array<[string, number, number]> = [
  ['canavial', 37.0839, -8.6790],
  ['seixal-bay', 38.6377, -9.1121],
  ['alteirinhos', 37.5187, -8.7882],
  ['santa-barbara', 37.8167, -25.5487],
  ['monte-verde', 37.8230, -25.5268],
  ['nova-vaga', 38.5985, -9.2088],
  ['anjos', 37.0065, -25.1586],
  ['cordoama', 37.1091, -8.9380],
  ['amorosa', 41.6458, -8.8249],
  ['sao-lourenco', 39.0117, -9.4212],
  ['funchal', 32.6392, -16.9512],
  ['milicias', 37.7510, -25.6252],
  ['almoxarife', 38.5543, -28.6095],
  ['praia-torreira', 40.7371, -8.7224],
  ['ilha-faro', 37.0031, -7.9860],
  ['praia-da-rainha', 38.6164, -9.2184],
  ['malhao', 37.7864, -8.8016],
  ['barriga', 37.1190, -8.9304],
  ['praia-verde', 37.1739, -7.4793],
  ['consolacao', 39.3378, -9.3602],
  ['tres-irmaos', 37.1197, -8.5813],
  ['castelejo', 37.0998, -8.9463],
  ['sao-vicente-madeira', 32.8101, -17.0466],
  ['adraga', 38.8043, -9.4848],
  ['apulia', 41.4825, -8.7778],
  ['vila-praia-ancora', 41.8133, -8.8652],
  ['furadouro', 40.8853, -8.6725],
  ['seixal-madeira', 32.8219, -17.1031],
  // 2.ª passagem (22/10): coordenadas confirmadas pelo Pedro.
  ['santa-catarina-terceira', 38.7100, -27.0503],
  ['cachorro-pico', 38.5561, -28.4471],
  ['formosa-santa-maria', 36.9509, -25.0973],
  ['vale-figueiras', 37.2473, -8.8688],
  ['fao', 41.5233, -8.7900],
  ['barrinha-faro', 36.9868, -7.9644],
  // Fão = 2 spots (22/10): pin «Kitesurf Spot» do Pedro, kite no rio Cávado.
  ['esposende', 41.5336, -8.7892],
  // 3.ª passagem (23/10): pins do Pedro no Google Maps (arredondados a 4 casas).
  ['esposende-praia', 41.5432, -8.7927],
  ['vila-cha', 41.2902, -8.7332],
  ['rodanho', 41.6673, -8.8247],
  ['falesia', 37.0760, -8.1342],
  ['beliche', 37.0256, -8.9641],
  ['monte-clerigo', 37.3413, -8.8531],
  ['pessegueiro', 37.8299, -8.7920],
  ['porto-covo', 37.8572, -8.7936],
  ['sao-torpes', 37.9228, -8.8053],
  ['parede', 38.6858, -9.3538],
  ['praia-grande-sintra', 38.8132, -9.4782],
];

/** Distância em metros (haversine). */
function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

describe('coordenadas dos spots', () => {
  it('a lista de corrigidos tem 46 spots, todos em spots.ts', () => {
    expect(CORRIGIDOS.length).toBe(46);
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
  it('Fão tem só 2 spots: fao (praia, surf + kite) e esposende (rio, só kite)', () => {
    expect(spots.some((s) => s.id === 'fao-ofir-surf' || s.slug === 'fao-ofir-surf')).toBe(false);
    expect(porId.has('fao-ofir-surf')).toBe(false);
    const fao = spots.find((s) => s.id === 'fao')!;
    expect(fao.slug).toBe('fao');
    expect([...(fao.compatibleSports ?? [])].sort()).toEqual(['kitesurf', 'surf']);
    expect(fao.type).toBe('multisport');
    expect(distM(fao.lat, fao.lon, 41.5232614, -8.7900361)).toBeLessThanOrEqual(50);
    const esp = spots.find((s) => s.id === 'esposende')!;
    expect(esp.compatibleSports).toEqual(['kitesurf']);
    expect(distM(esp.lat, esp.lon, 41.5336193, -8.7891908)).toBeLessThanOrEqual(50);
    expect(esp.description).toMatch(/Cávado/);
    expect(esp.descriptionEn).toMatch(/Cavado/);
  });

  it('fao e esposende com a orientação do ficheiro de revisão', () => {
    for (const id of ['fao', 'esposende']) {
      const s = spots.find((x) => x.id === id)!;
      const l = (review as unknown as { spots: Array<{ id: string; final: number }> }).spots.find((x) => x.id === id)!;
      expect(s.coastOrientation, id).toBe(l.final);
    }
  });

  /** 3.ª passagem (23/10): [id, lat, lon] dos pins do Pedro, sem arredondar. */
  const PINS_3: Array<[string, number, number]> = [
  ['esposende-praia', 41.5431645, -8.7926698],
  ['vila-cha', 41.2901998, -8.7332253],
  ['apulia', 41.4825091, -8.77776],
  ['rodanho', 41.66731, -8.824704],
  ['vila-praia-ancora', 41.813339, -8.865248],
  ['falesia', 37.0759611, -8.1341991],
  ['beliche', 37.025631, -8.964114],
  ['cordoama', 37.109104, -8.9379888],
  ['castelejo', 37.0998323, -8.9462696],
  ['barriga', 37.1189869, -8.9303988],
  ['vale-figueiras', 37.247275, -8.868842],
  ['monte-clerigo', 37.3412813, -8.8531204],
  ['alteirinhos', 37.5187239, -8.7881894],
  ['malhao', 37.7864198, -8.8015865],
  ['pessegueiro', 37.829904, -8.792002],
  ['porto-covo', 37.8571962, -8.7936476],
  ['sao-torpes', 37.9227778, -8.8052778],
  ['parede', 38.6857511, -9.3538019],
  ['adraga', 38.8042525, -9.4848076],
  ['praia-grande-sintra', 38.8132152, -9.478208],
  ];

  it.each(PINS_3)('%s fica a ≤ 20 m do pin do Pedro', (id, lat, lon) => {
    const s = spots.find((x) => x.id === id)!;
    expect(s, id).toBeDefined();
    expect(distM(s.lat, s.lon, lat, lon)).toBeLessThanOrEqual(20);
  });

  it('os spots movidos na 3.ª passagem têm a orientação do ficheiro de revisão', () => {
    const finais = new Map((review as unknown as { spots: Array<{ id: string; final: number }> }).spots.map((l) => [l.id, l.final]));
    for (const [id] of PINS_3) {
      const s = spots.find((x) => x.id === id)!;
      expect(s.coastOrientation, id).toBe(finais.get(id));
    }
  });

  const REMOVIDOS = ['ofir', 'ofir-praia', 'foil-fao-cavado', 'foil-esposende-piscinas', 'povoa-varzim', 'castelo-neiva', 'garrão', 'garrao', 'sines', 'fao-ofir-surf'];

  it.each(REMOVIDOS)('%s foi removido (spots.ts e ficheiro de revisão)', (id) => {
    expect(spots.some((s) => s.id === id || s.slug === id)).toBe(false);
    expect(porId.has(id)).toBe(false);
  });

  it('nenhum conditionsSource aponta para um spot que não existe', () => {
    const ids = new Set(spots.map((s) => s.id));
    for (const s of spots) if (s.conditionsSource) expect(ids.has(s.conditionsSource), s.id).toBe(true);
  });

  it('Fão/Esposende: só fao, esposende e esposende-praia; desportos e vento como o Pedro pediu', () => {
    const zona = spots.filter((s) => s.region === 'Esposende').map((s) => s.id).sort();
    expect(zona).toEqual(['apulia', 'esposende', 'esposende-praia', 'fao']);
    expect(spots.find((s) => s.id === 'fao')!.bestWind).toBe('NW, N');
    const ep = spots.find((s) => s.id === 'esposende-praia')!;
    expect([...(ep.compatibleSports ?? [])].sort()).toEqual(['bodyboard', 'foil', 'surf']);
    expect(spots.find((s) => s.id === 'rodanho')!.compatibleSports).toEqual(['kitesurf']);
  });
});
