/**
 * Geografia vectorial da cena da praia (#184): contornos fechados, buracos,
 * faixas de profundidade a crescer para o largo e costa no sítio certo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { aneisGrelha, areaAnel, campoChegada, construirGeo, distancia, encadeia, frentesGeo, geoDeEstatico, janelaFrentes, JANELA_FRENTES, multiPoligono, type GeoEstatico } from '@/lib/praiaGeo';
import { PROF_FAIXAS } from '@/lib/praiaCena';

const grelha = (nx: number, ny: number, f: (i: number, j: number) => number) => {
  const a = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) a[j * nx + i] = f(i, j);
  return a;
};

describe('praiaGeo · marching squares', () => {
  it('um disco dá um só anel fechado com a área certa', () => {
    const R = 8;
    const g = grelha(30, 30, (i, j) => R - Math.hypot(i - 15, j - 15));
    const an = aneisGrelha(g, 30, 30);
    expect(an).toHaveLength(1);
    expect(Math.abs(areaAnel(an[0]))).toBeGreaterThan(Math.PI * R * R * 0.95);
    expect(Math.abs(areaAnel(an[0]))).toBeLessThan(Math.PI * R * R * 1.05);
  });

  it('um anel com buraco dá exterior e buraco com sinais opostos', () => {
    const g = grelha(40, 40, (i, j) => {
      const r = Math.hypot(i - 20, j - 20);
      return Math.min(14 - r, r - 6);
    });
    const an = aneisGrelha(g, 40, 40);
    expect(an).toHaveLength(2);
    expect(Math.sign(areaAnel(an[0]))).toBe(-Math.sign(areaAnel(an[1])));
    const mp = multiPoligono(an.map((a) => a.map(([x, y]) => [x, -y] as [number, number])));
    expect(mp).toHaveLength(1);
    expect(mp[0]).toHaveLength(2);
  });

  it('um conjunto que toca a borda fecha pela borda', () => {
    const g = grelha(20, 20, (i) => 10 - i);
    const an = aneisGrelha(g, 20, 20);
    expect(an).toHaveLength(1);
    expect(Math.abs(areaAnel(an[0]))).toBeGreaterThan(9 * 19);
  });

  it('distância chamfer cresce a partir do alvo', () => {
    const alvo = new Uint8Array(10 * 10);
    alvo[0] = 1;
    const d = distancia(alvo, 10, 10, 10);
    expect(d[0]).toBe(0);
    expect(d[9]).toBeCloseTo(90, 5);
    expect(d[99]).toBeCloseTo(9 * 10 * Math.SQRT2, 3);
  });
});

describe('praiaGeo · praia sintética', () => {
  // costa norte–sul em lon −9,47; terra a leste a subir; mar a oeste com batimetria grosseira a −80 m
  const ll: [number, number] = [-9.47, 38.73];
  const fino = (lon: number) => (lon > -9.47 ? (lon + 9.47) * 4000 : 0);
  const largo = (lon: number) => (lon > -9.47 ? 50 : -80);
  const geo = construirGeo(ll, { meiaLon: 0.06, meiaLat: 0.04, res: 60 }, fino, largo);

  it('costa onde a elevação passa 0,3 m', () => {
    expect(geo.terra.length).toBeGreaterThanOrEqual(1);
    const xs = geo.terra.flatMap((a) => a.map((p) => p[0]));
    const oeste = Math.min(...xs);
    expect(oeste).toBeGreaterThan(-9.4715);
    expect(oeste).toBeLessThan(-9.468);
  });

  it('as faixas ficam mais largas para o largo (isóbatas por ordem)', () => {
    const oesteDe = (an: Array<Array<[number, number]>>) => Math.min(...an.flatMap((a) => a.map((p) => p[0])));
    const limites = geo.faixas.map((f) => (f.length ? oesteDe(f) : Infinity));
    expect(geo.faixas).toHaveLength(PROF_FAIXAS.length);
    // 5 m a 0,2–0,65 km da costa (rampa da maquete); até 75 m existem, 100 m não (o fundo é 80 m)
    for (let i = 1; i < 6; i++) expect(limites[i]).toBeLessThan(limites[i - 1]);
    const km5 = (-9.47 - limites[0]) * 111.32 * Math.cos((38.73 * Math.PI) / 180);
    expect(km5).toBeGreaterThan(0.2);
    expect(km5).toBeLessThan(0.65);
  });

  it('areia só junto à costa, em terra baixa', () => {
    const xs = geo.areia.flatMap((a) => a.map((p) => p[0]));
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(-9.47 + 0.0015);
  });

  it('multiPoligono: exteriores anti-horários (lon/lat)', () => {
    const mp = multiPoligono(geo.terra);
    expect(mp.length).toBeGreaterThan(0);
    const ext = mp[0][0] as unknown as Array<[number, number]>;
    expect(areaAnel(ext.slice(0, -1))).toBeLessThan(0);
  });

  it('campoChegada: passo 20 escolhe o rumo da maquete (311° → campo de 320°)', () => {
    expect(campoChegada(geo.ondas, 311, 20)).toBe(campoChegada(geo.ondas, 320));
    expect(campoChegada(geo.ondas, 311)).toBe(campoChegada(geo.ondas, 310));
    expect(campoChegada(geo.ondas, 311)).not.toBe(campoChegada(geo.ondas, 320));
    expect(campoChegada(geo.ondas, 355, 20)).toBe(campoChegada(geo.ondas, 0));
  });
});

describe('janelaFrentes (caixa das frentes da vista plana, a da maquete)', () => {
  const ll: [number, number] = [-9.472, 38.732];
  const mx = 111320 * Math.cos((ll[1] * Math.PI) / 180);
  const my = 110540;
  const em = (dx: number, dy: number) => [ll[0] + dx / mx, ll[1] + dy / my] as const;

  it('praia virada a oeste: até 3127 m para o largo, 2211 m a sul e 2874 m a norte do spot (Guincho da maquete)', () => {
    const j = janelaFrentes(ll, 270);
    expect(j(...em(-3000, 0))).toBe(true);
    expect(j(...em(-3250, 0))).toBe(false);
    expect(j(...em(-1000, -2100))).toBe(true);
    expect(j(...em(-1000, -2300))).toBe(false);
    expect(j(...em(-1000, 2800))).toBe(true);
    expect(j(...em(-1000, 2950))).toBe(false);
    // em terra (para leste) não corta: a terra já tapa as frentes
    expect(j(...em(5000, 0))).toBe(true);
    // os limites em graus batem com a caixa da maquete (−9,508° e 38,712°–38,758°)
    expect(ll[0] - JANELA_FRENTES.largo / mx).toBeCloseTo(-9.508, 3);
    expect(ll[1] - JANELA_FRENTES.esquerda / my).toBeCloseTo(38.712, 3);
    expect(ll[1] + JANELA_FRENTES.direita / my).toBeCloseTo(38.758, 3);
  });

  it('roda com a praia: virada a norte, o largo é para norte e a direita é para leste', () => {
    const j = janelaFrentes(ll, 0);
    expect(j(...em(0, 3000))).toBe(true);
    expect(j(...em(0, 3250))).toBe(false);
    expect(j(...em(2800, 1000))).toBe(true);
    expect(j(...em(2950, 1000))).toBe(false);
    expect(j(...em(-2300, 1000))).toBe(false);
  });

  it('com caixa editorial usa-a tal e qual', () => {
    const j = janelaFrentes(ll, 280, [-9.508, 38.712, -9.4, 38.758]);
    expect(j(-9.507, 38.74)).toBe(true);
    expect(j(-9.509, 38.74)).toBe(false);
    expect(j(-9.49, 38.711)).toBe(false);
    expect(j(-9.49, 38.759)).toBe(false);
  });

  it('frentesGeo com janela: nenhum ponto fora da caixa e menos frentes do que sem ela', () => {
    const fino = (lon: number) => (lon > -9.47 ? (lon + 9.47) * 4000 : 0);
    const largo = (lon: number) => (lon > -9.47 ? 50 : -80);
    const geo = construirGeo([-9.47, 38.73], { meiaLon: 0.06, meiaLat: 0.04, res: 60 }, fino, largo);
    const caixa: [number, number, number, number] = [-9.5, 38.715, -9.4, 38.745];
    const todas = frentesGeo(geo.ondas, 280, 11, 1.4, 3.2, false, 3200, 1, 20);
    const dentro = frentesGeo(geo.ondas, 280, 11, 1.4, 3.2, false, 3200, 1, 20, janelaFrentes([-9.47, 38.73], 270, caixa));
    const pts = (l: Array<Array<[number, number]>>) => l.flat();
    expect(pts(dentro).length).toBeGreaterThan(0);
    expect(pts(dentro).length).toBeLessThan(pts(todas).length);
    // cada ponto fica a menos de uma célula da grelha das ondas da caixa (o teste é ao centro da célula)
    const m = Math.max(geo.ondas.dlon, geo.ondas.dlat);
    for (const [lon, lat] of pts(dentro)) {
      expect(lon).toBeGreaterThanOrEqual(caixa[0] - m);
      expect(lat).toBeGreaterThanOrEqual(caixa[1] - m);
      expect(lat).toBeLessThanOrEqual(caixa[3] + m);
    }
    expect(Math.min(...pts(todas).map((p) => p[0]))).toBeLessThan(caixa[0] - m);
  });
});

describe('geoDeEstatico (ficheiro de public/geo/praia)', () => {
  const base = (extra: Partial<GeoEstatico> = {}): GeoEstatico => ({
    v: 1,
    bbox: [-9.6, 38.6, -9.3, 38.9],
    faixas: [[]],
    terra: [],
    relevo: [],
    areia: [],
    pinhal: [],
    urbano: [],
    rocha: [],
    estradas: [],
    lugares: [],
    picos: [],
    ondas: { nx: 1, ny: 1, w: -9.6, n: 38.9, dlon: 0.001, dlat: 0.001, res: 120, prof: 'Cg==', dist: 'AQ==' },
    ...extra,
  });

  it('passa os limites administrativos (linhas [lon, lat])', () => {
    const lim = [[[-9.4838, 38.7573], [-9.4476, 38.7676]]] as GeoEstatico['estradas'];
    const g = geoDeEstatico(base({ limites: lim }));
    expect(g?.limites).toEqual(lim);
  });

  it('ficheiros sem limites (gerados antes) dão uma lista vazia', () => {
    expect(geoDeEstatico(base())?.limites).toEqual([]);
  });
});

describe('geografia estática do Guincho (public/geo/praia/guincho.json)', () => {
  const j = JSON.parse(readFileSync(path.join(process.cwd(), 'public/geo/praia/guincho.json'), 'utf8')) as GeoEstatico;
  const caixa = [-9.53, 38.7, -9.43, 38.785];
  const naCaixa = (p: [number, number]) => p[0] >= caixa[0] && p[0] <= caixa[2] && p[1] >= caixa[1] && p[1] <= caixa[3];

  it('costa com o detalhe da maquete (OSM z14, simplify 0,00006°): pelo menos 400 vértices na vista plana', () => {
    // a maquete tem 601 vértices nesta caixa; a costa da grelha de 40 m suavizada tinha 476 no ficheiro todo
    const n = j.terra.reduce((s, a) => s + a.filter(naCaixa).length, 0);
    expect(n).toBeGreaterThan(400);
  });

  it('traz o limite de concelho Cascais–Sintra em terra, a norte da praia', () => {
    expect(j.limites?.length).toBeGreaterThan(0);
    const pts = (j.limites ?? []).flat().filter(naCaixa);
    expect(pts.length).toBeGreaterThan(5);
    expect(pts.some((p) => p[1] > 38.75 && p[1] < 38.775)).toBe(true);
  });
});

describe('encadeia (frentes de onda em linhas contínuas)', () => {
  it('junta segmentos com extremos comuns, em qualquer sentido, sem perder pontos', () => {
    const P = (x: number): [number, number] => [-9.5 + x * 0.001, 38.7 + x * 0.0005];
    // linha 0-1-2-3-4 partida em segmentos desordenados e alguns invertidos, mais um solto
    const segs: Array<Array<[number, number]>> = [
      [P(2), P(3)],
      [P(1), P(0)],
      [P(3), P(4)],
      [P(2), P(1)],
      [[0, 0], [0, 1]],
    ];
    const l = encadeia(segs);
    expect(l).toHaveLength(2);
    const longa = l.find((x) => x.length === 5)!;
    const xs = longa.map((p) => Math.round((p[0] + 9.5) * 1000));
    expect(xs[0] === 0 ? xs : [...xs].reverse()).toEqual([0, 1, 2, 3, 4]);
    expect(l.find((x) => x.length === 2)).toEqual([[0, 0], [0, 1]]);
  });
});
