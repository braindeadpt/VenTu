import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadIsobathContours,
  clearIsobathContoursCache,
  contoursWithinRadius,
  ISOBATH_DEPTHS,
  ISOBATH_DEPTH_STYLE,
  type IsobathContoursFile,
} from '@/lib/isobaths';

afterEach(() => {
  clearIsobathContoursCache();
  vi.restoreAllMocks();
});

const FILE: IsobathContoursFile = {
  depths: [8, 16, 30],
  vertexCount: 10,
  contours: {
    // Duas linhas da profundidade 8: uma perto da Nazaré, outra longe.
    '8': [
      [
        [-9.25, 39.5],
        [-9.2, 39.55],
      ],
      [
        [-8.0, 40.0],
        [-8.1, 40.1],
      ],
    ],
    '30': [
      [
        [-9.3, 39.5],
        [-9.28, 39.6],
      ],
    ],
  },
};

describe('contoursWithinRadius', () => {
  it('devolve só as linhas com algum vértice dentro do raio, por profundidade', () => {
    const out = contoursWithinRadius(FILE, 39.55, -9.2, 15);
    expect(out.map((o) => o.depth)).toEqual([8, 30]);
    expect(out[0].lines).toHaveLength(1); // a linha longe (-8.0) cai fora
    expect(out[1].lines).toHaveLength(1);
  });

  it('raio pequeno → sem linhas (nenhuma profundidade)', () => {
    // Spot deslocado ~7 km do vértice mais próximo → raio 2 km vazio.
    expect(contoursWithinRadius(FILE, 39.6, -9.15, 2)).toEqual([]);
  });

  it('ficheiro null/sem contours → [] (nunca rebenta)', () => {
    expect(contoursWithinRadius(null, 39.55, -9.2, 15)).toEqual([]);
    expect(contoursWithinRadius({}, 39.55, -9.2, 15)).toEqual([]);
  });
});

describe('ISOBATH_DEPTH_STYLE / ISOBATH_DEPTHS', () => {
  it('estilos e etiquetas por profundidade (8/16/30 m)', () => {
    expect(ISOBATH_DEPTHS).toEqual([8, 16, 30]);
    expect(ISOBATH_DEPTH_STYLE[8].label).toBe('8 m');
    expect(ISOBATH_DEPTH_STYLE[16].label).toBe('16 m');
    expect(ISOBATH_DEPTH_STYLE[30].label).toBe('30 m');
    for (const s of Object.values(ISOBATH_DEPTH_STYLE)) {
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('loadIsobathContours', () => {
  it('PASS: carrega o ficheiro uma vez (cache de módulo)', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(FILE), { status: 200 }),
    );
    const a = await loadIsobathContours(fetchImpl);
    const b = await loadIsobathContours(fetchImpl);
    expect(a?.contours?.['8']).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // cache
    expect(b).toBe(a);
  });

  it('HTTP 404 → null (os mapas não desenham camada, nunca rebentam)', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    expect(await loadIsobathContours(fetchImpl)).toBeNull();
  });

  it('falha de rede → null', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await loadIsobathContours(fetchImpl)).toBeNull();
  });
});
