/**
 * Geografia vectorial da cena da praia (#184): contornos fechados, buracos,
 * faixas de profundidade a crescer para o largo e costa no sítio certo.
 */
import { describe, expect, it } from 'vitest';
import { aneisGrelha, areaAnel, campoChegada, construirGeo, distancia, encadeia, multiPoligono } from '@/lib/praiaGeo';
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
