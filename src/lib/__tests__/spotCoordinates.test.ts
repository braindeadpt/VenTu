/**
 * Coordenadas dos spots (22/10): 31 spots estavam longe da praia (1,1 a 25 km)
 * e foram corrigidos para a praia OSM `natural=beach` (Nominatim); numa 2.ª passagem
 * mais 6, com coordenadas confirmadas pelo Pedro (`fao` e `barrinha-faro` são pins
 * dele no Google Maps). Em Fão ficam 2 spots: `fao` (praia, surf + kite; absorveu o
 * duplicado `fao-ofir-surf`) e `esposende` (rio Cávado, só kite). Na 3.ª passagem (23/10)
 * mais pins do Pedro, `esposende-praia` sem kite, `rodanho` só kite, e 8 spots removidos
 * (Fão/Ofir duplicados, Póvoa, Castelo do Neiva, Garrão, Sines). Na 4.ª passagem (23/10)
 * 2 spots novos (`arvore`, `vale-figueiros-sines`) e `beliche` fixado à mão em 230°. Na 5.ª
 * passagem (23/10) a Ericeira (8 spots movidos e 4 novos) e a lagoa-albufeira. Na 6.ª (24/10)
 * `coxos` fixado à mão em 280°, o texto do kite na Foz do Lizandro e o foil da lagoa movido. Guarda:
 *  - cada spot corrigido a ≤ 500 m da coordenada esperada;
 *  - `src/lib/spots.ts` e `data/coast-orientation-review.json` com as mesmas coordenadas;
 *  - os spots corrigidos a ≤ 1 km da linha de costa OSM (distância do ficheiro de revisão).
 * Sem rede: só lê ficheiros do repositório.
 */
import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import { SPOT_LIVECAMS } from '@/lib/spotLivecams';
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
    // surf numa praia virada a 275°: vento bom é o terral (E/SE), não a Nortada do kite
    expect(ep.bestWind).toBe('E, SE');
    expect(SPOT_LIVECAMS.fao.url).toContain('surftotal.com/camaras-report/minho/ofir');
    expect(spots.find((s) => s.id === 'rodanho')!.compatibleSports).toEqual(['kitesurf']);
  });

  /** 4.ª passagem (23/10): spots novos, [id, lat, lon] do Pedro. */
  const NOVOS_4: Array<[string, number, number]> = [
    ['arvore', 41.3296, -8.7391],
    ['vale-figueiros-sines', 37.8958, -8.7975],
  ];

  it.each(NOVOS_4)('%s existe, fica a ≤ 20 m do pin e a ≤ 1 km da costa OSM', (id, lat, lon) => {
    const s = spots.find((x) => x.id === id)!;
    expect(s, id).toBeDefined();
    expect(s.slug).toBe(id);
    expect(distM(s.lat, s.lon, lat, lon)).toBeLessThanOrEqual(20);
    const l = porId.get(id) as unknown as { final: number; origem: string; distCostaM: number | null };
    expect(l, id).toBeDefined();
    expect(s.coastOrientation, id).toBe(l.final);
    expect(l.origem, id).toBe('osm');
    expect(l.distCostaM!, id).toBeLessThanOrEqual(1000);
  });

  it('arvore: surf, foil e kite (multisport), em Vila do Conde; azurara não mudou', () => {
    const a = spots.find((s) => s.id === 'arvore')!;
    expect(a.type).toBe('multisport');
    expect([...(a.compatibleSports ?? [])].sort()).toEqual(['foil', 'kitesurf', 'surf']);
    expect(a.region).toBe('Vila do Conde');
    expect(a.bestWind).toBe('S, SW');
    expect(a.coastOrientation).toBe(265);
    const z = spots.find((s) => s.id === 'azurara')!;
    expect([z.lat, z.lon, z.coastOrientation]).toEqual([41.338, -8.743, 225]);
    expect(z.compatibleSports).toEqual(['surf', 'sup', 'bodyboard', 'kitesurf']);
    expect(distM(a.lat, a.lon, z.lat, z.lon)).toBeGreaterThan(500);
  });

  it('vale-figueiros-sines: surf e bodyboard como São Torpes/Porto Covo; não se confunde com vale-figueiras', () => {
    const v = spots.find((s) => s.id === 'vale-figueiros-sines')!;
    expect(v.compatibleSports).toEqual(spots.find((s) => s.id === 'sao-torpes')!.compatibleSports);
    expect(v.coastOrientation).toBe(250);
    expect(spots.some((s) => s.id === 'vale-figueiros' || s.slug === 'vale-figueiros')).toBe(false);
    const vf = spots.find((s) => s.id === 'vale-figueiras')!;
    expect(vf.region).not.toBe(v.region);
    expect(distM(v.lat, v.lon, vf.lat, vf.lon)).toBeGreaterThan(50000);
  });

  it('beliche fica 230° fixado à mão (origem manual no ficheiro de revisão)', () => {
    const b = spots.find((s) => s.id === 'beliche')!;
    expect(b.coastOrientation).toBe(230);
    const l = porId.get('beliche') as unknown as { final: number; origem: string };
    expect(l.final).toBe(230);
    expect(l.origem).toBe('manual');
  });

  /** 5.ª passagem (23/10): Ericeira, [id, lat, lon] (OSM e pins do Pedro). */
  const ERICEIRA_5: Array<[string, number, number]> = [
    ['crazy-left', 38.99666, -9.42606],
    ['cave-ericeira', 38.99446, -9.42489],
    ['pedra-branca', 38.98016, -9.42276],
    ['empa', 38.97969, -9.42231],
    ['sao-sebastiao', 38.97267, -9.4204],
    ['coxos', 39.00085, -9.42562],
    ['foz-lizandro', 38.942, -9.41363],
    ['pescadores-ericeira', 38.96432, -9.41902],
    // Lagoa de Albufeira (Sesimbra): pin do Pedro «Praia da Lagoa de Albufeira (Lagoa)»
    ['lagoa-albufeira', 38.50878, -9.17599],
  ];
  const NOVOS_5: Array<[string, number, number]> = [
    ['praia-norte-ericeira', 38.96717, -9.42005],
    ['praia-sul-ericeira', 38.95763, -9.41602],
    ['sao-juliao', 38.93197, -9.41972],
    ['calada', 39.03284, -9.41843],
  ];

  it.each(ERICEIRA_5)('Ericeira: %s fica a ≤ 20 m do pin, com a orientação do ficheiro de revisão', (id, lat, lon) => {
    const s = spots.find((x) => x.id === id)!;
    expect(s, id).toBeDefined();
    expect(distM(s.lat, s.lon, lat, lon)).toBeLessThanOrEqual(20);
    const l = porId.get(id) as unknown as { final: number };
    expect(s.coastOrientation, id).toBe(l.final);
  });

  it.each(NOVOS_5)('Ericeira: %s existe, fica a ≤ 20 m do pin e a ≤ 1 km da costa OSM', (id, lat, lon) => {
    const s = spots.find((x) => x.id === id)!;
    expect(s, id).toBeDefined();
    expect(s.slug).toBe(id);
    expect(s.region).toBe('Ericeira');
    expect(distM(s.lat, s.lon, lat, lon)).toBeLessThanOrEqual(20);
    const l = porId.get(id) as unknown as { final: number; distCostaM: number | null };
    expect(l, id).toBeDefined();
    expect(s.coastOrientation, id).toBe(l.final);
    expect(l.distCostaM, id).not.toBeNull();
    expect(l.distCostaM!, id).toBeLessThanOrEqual(1000);
  });

  it('Ericeira: crazy-left já não está em cima da Praia do Sul; foz-lizandro tem kite com a Nortada', () => {
    const cl = spots.find((s) => s.id === 'crazy-left')!;
    const sul = spots.find((s) => s.id === 'praia-sul-ericeira')!;
    expect(distM(cl.lat, cl.lon, sul.lat, sul.lon)).toBeGreaterThan(4000);
    const fl = spots.find((s) => s.id === 'foz-lizandro')!;
    expect(fl.compatibleSports).toContain('kitesurf');
    expect(fl.bestWind).toBe('N, NW');
    // São Julião da Ericeira não é o Forte de São Julião (Carcavelos)
    const c = spots.find((s) => s.id === 'carcavelos')!;
    const sj = spots.find((s) => s.id === 'sao-juliao')!;
    expect(distM(sj.lat, sj.lon, c.lat, c.lon)).toBeGreaterThan(20000);
  });

  it('lagoa-albufeira: na lagoa (pin do Pedro), mesmos desportos, orientação curada de água interior', () => {
    const s = spots.find((x) => x.id === 'lagoa-albufeira')!;
    expect(s.region).toBe('Sesimbra');
    expect(s.compatibleSports).toEqual(['kitesurf']);
    expect(distM(s.lat, s.lon, 38.501, -9.14)).toBeGreaterThan(2500);
    const l = porId.get('lagoa-albufeira') as unknown as { final: number; origem: string };
    expect(l.origem).toBe('curado');
    expect(s.coastOrientation).toBe(l.final);
  });

  /** 6.ª passagem (24/10), decisões do Pedro. */
  it('coxos: 280° fixado à mão (VALOR_MANUAL), não os 230° da falésia local', () => {
    const s = spots.find((x) => x.id === 'coxos')!;
    const l = porId.get('coxos') as unknown as { final: number; origem: string };
    expect(s.coastOrientation).toBe(280);
    expect(l.final).toBe(280);
    expect(l.origem).toBe('manual');
  });

  it('foz-lizandro: kite com regra da época balnear, sem «proibido no verão»', () => {
    const s = spots.find((x) => x.id === 'foz-lizandro')!;
    const txt = [s.description, s.descriptionEn, ...(s.hazards ?? [])].join(' ');
    expect(txt).not.toMatch(/proibido no verão|forbidden in summer/i);
    expect(s.description).toContain('época balnear');
    expect(s.compatibleSports).toContain('kitesurf');
  });

  it('foil-lagoa-albufeira: no mesmo pin da lagoa-albufeira (dentro da lagoa)', () => {
    const f = spots.find((x) => x.id === 'foil-lagoa-albufeira')!;
    const l = spots.find((x) => x.id === 'lagoa-albufeira')!;
    expect(distM(f.lat, f.lon, l.lat, l.lon)).toBeLessThanOrEqual(20);
    expect(distM(f.lat, f.lon, 38.501, -9.14)).toBeGreaterThan(2500);
    const r = porId.get('foil-lagoa-albufeira')!;
    expect(distM(r.lat, r.lon, f.lat, f.lon)).toBeLessThanOrEqual(1);
  });
});
