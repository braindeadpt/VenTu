import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

import {
  clearOceanMaskCache,
  decodeMaskPath,
  drawOceanMask,
  featherPx,
  filesForView,
  frameOrigin,
  installOceanMask,
  loadOceanMaskIndex,
  loadOceanMaskSet,
  maskOpacity,
  metersPerPixel,
  OCEAN_MASK_COLORS,
  parseOceanMaskIndex,
  parseOceanMaskSet,
  prepareMask,
  preparedMaskSync,
  type OceanMaskIndex,
} from '../oceanMask';

const DIR = path.join(__dirname, '..', '..', '..', 'public', 'geo', 'ocean-mask');
const readJson = (f: string) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8'));

const INDEX: OceanMaskIndex = {
  frame: [-12.5, 35.5, -5, 44],
  coarse: { file: 'coarse.json', z: 11 },
  regionMinZoom: 11,
  regionZ: 16,
  regions: [
    { id: 'norte', file: 'norte.json', bbox: [-12.5, 41.35, -5, 44] },
    { id: 'aveiro', file: 'aveiro.json', bbox: [-12.5, 40.25, -5, 41.35] },
    { id: 'algarve', file: 'algarve.json', bbox: [-12.5, 35.5, -5, 40.25] },
  ],
};

describe('oceanMask — parse', () => {
  it('índice válido e inválido', () => {
    expect(parseOceanMaskIndex({ v: 1, ...INDEX })).toEqual(INDEX);
    expect(parseOceanMaskIndex({ ...INDEX, v: 2 })).toBeNull();
    expect(parseOceanMaskIndex({ v: 1, ...INDEX, regions: [{ id: 'x', file: 'x.json', bbox: [1, 2, 0, 3] }] })).toBeNull();
    expect(parseOceanMaskIndex(null)).toBeNull();
  });

  it('caminhos em deltas → absolutos; inválidos descartados', () => {
    expect(Array.from(decodeMaskPath([10, 20, 1, 1, -2, 0], 3)!)).toEqual([10, 20, 11, 21, 9, 21]);
    expect(decodeMaskPath([10, 20, 1], 2)).toBeNull();
    expect(decodeMaskPath([10, 20], 2)).toBeNull();
    const s = parseOceanMaskSet({ v: 1, z: 16, fill: [[0, 0, 5, 0, 0, 5], [1, 2]], sea: [[0, 0, 1, 1]], inner: 'x' })!;
    expect(s.fill).toHaveLength(1);
    expect(s.sea).toHaveLength(1);
    expect(s.inner).toEqual([]);
    expect(s.iso1).toEqual([]);
    expect(parseOceanMaskSet({ v: 1, fill: [] })).toBeNull();
  });
});

describe('oceanMask — selecção de ficheiros por vista', () => {
  const sj = { south: 40.66, north: 40.74, west: -8.84, east: -8.68 };

  it('abaixo de regionMinZoom: só o grosseiro', () => {
    expect(filesForView(INDEX, sj, 10.9)).toEqual(['coarse.json']);
  });

  it('a partir de regionMinZoom: só as regiões que tocam a vista', () => {
    expect(filesForView(INDEX, sj, 13)).toEqual(['aveiro.json']);
    // vista em cima da costura norte/aveiro → as duas
    expect(filesForView(INDEX, { south: 41.3, north: 41.4, west: -8.8, east: -8.6 }, 13)).toEqual(['norte.json', 'aveiro.json']);
  });

  it('a margem puxa a região vizinha quando a costa dela está logo fora do ecrã', () => {
    const v = { south: 41.37, north: 41.45, west: -8.8, east: -8.6 };
    expect(filesForView(INDEX, v, 13, 0)).toEqual(['norte.json']);
    expect(filesForView(INDEX, v, 13, 0.05)).toEqual(['norte.json', 'aveiro.json']);
  });

  it('fora da moldura: nada (ex.: Açores)', () => {
    expect(filesForView(INDEX, { south: 37.6, north: 37.9, west: -25.8, east: -25.3 }, 12)).toEqual([]);
  });
});

describe('oceanMask — pena e opacidade', () => {
  it('z ≥ 13: 330 m aprovados', () => {
    const lat = 40.7;
    expect(featherPx(13, lat).sea * metersPerPixel(13, lat)).toBeCloseTo(330, 6);
    expect(featherPx(15, lat).sea * metersPerPixel(15, lat)).toBeCloseTo(330, 6);
  });

  it('abaixo de z13 a pena é estreita em píxeis (sem blocos Esri na pena a z12)', () => {
    expect(featherPx(12, 37).sea).toBeCloseTo(5.5, 6);
    expect(featherPx(11, 37).sea).toBeCloseTo(4, 6);
    expect(featherPx(9, 37).sea).toBeCloseTo(2.5, 6);
    // contínua e monótona entre z9 e z15
    let prev = 0;
    for (let z = 9; z <= 15; z += 0.25) {
      const f = featherPx(z, 39).sea;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('rias: 60 m, nunca abaixo de 1,5 px', () => {
    expect(featherPx(16, 37).inner * metersPerPixel(16, 37)).toBeCloseTo(60, 6);
    expect(featherPx(9, 37).inner).toBe(1.5);
  });

  it('opacidade: 0 abaixo de z8, rampa até 1 a z9', () => {
    expect(maskOpacity(7)).toBe(0);
    expect(maskOpacity(8.5)).toBeCloseTo(0.5);
    expect(maskOpacity(12)).toBe(1);
  });
});

describe('oceanMask — carregamento', () => {
  beforeEach(() => clearOceanMaskCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    clearOceanMaskCache();
  });

  it('índice: um só pedido em voo; falha fica em backoff', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ v: 1, ...INDEX }) }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([loadOceanMaskIndex(), loadOceanMaskIndex()]);
    expect(a).toEqual(INDEX);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0] ?? '')).toContain('/geo/ocean-mask/index.json');

    clearOceanMaskCache();
    const failing = vi.fn(async () => ({ ok: false, json: async () => null }));
    vi.stubGlobal('fetch', failing);
    expect(await loadOceanMaskIndex()).toBeNull();
    expect(await loadOceanMaskIndex()).toBeNull();
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('conjuntos: cache por ficheiro e dedupe em voo; preparedMaskSync espera por todos', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ v: 1, z: 16, fill: [[0, 0, 10, 0, 0, 10]], sea: [], inner: [], iso1: [], iso2: [], url }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    installOceanMask(INDEX, {});
    expect(preparedMaskSync(INDEX, ['norte.json'])).toBeNull();
    await Promise.all([loadOceanMaskSet('norte.json'), loadOceanMaskSet('norte.json')]);
    await loadOceanMaskSet('norte.json');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/** Path2D de registo (o Node não tem canvas). */
class FakePath2D {
  ops: Array<[string, number, number]> = [];
  moveTo(x: number, y: number) {
    this.ops.push(['M', x, y]);
  }
  lineTo(x: number, y: number) {
    this.ops.push(['L', x, y]);
  }
  closePath() {
    this.ops.push(['Z', 0, 0]);
  }
  addPath(p: FakePath2D) {
    this.ops.push(...p.ops);
  }
}

function fakeCtx() {
  const calls: string[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (...args: unknown[]) => {
        calls.push(`${k}:${t.globalCompositeOperation ?? ''}:${args.length && typeof args[0] === 'string' ? args[0] : ''}`);
        if (k === 'createPattern') return null;
      };
    },
    set(t, k: string, v) {
      t[k] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, state };
}

describe('oceanMask — preparação e desenho', () => {
  beforeEach(() => vi.stubGlobal('Path2D', FakePath2D));
  afterEach(() => vi.unstubAllGlobals());

  const set = parseOceanMaskSet({
    v: 1,
    z: 16,
    fill: [[8_000_000, 6_000_000, 100, 0, 0, 100, -100, 0]],
    sea: [[8_000_000, 6_000_000, 100, 0]],
    inner: [],
    iso1: [[8_000_000, 6_000_100, 100, 0]],
    iso2: [],
  })!;

  it('caminhos relativos à origem da moldura (precisão float32 do canvas)', () => {
    const m = prepareMask(INDEX, 'k', [set])!;
    const { ox, oy } = frameOrigin(INDEX, 16);
    expect(m.ox).toBe(ox);
    const ops = (m.fill as unknown as FakePath2D).ops;
    expect(ops[0]).toEqual(['M', 8_000_000 - ox, 6_000_000 - oy]);
    expect(Math.abs(ops[0][1])).toBeLessThan(1_000_000);
    expect(ops[ops.length - 1][0]).toBe('Z');
    // conjuntos com z diferentes nunca se misturam
    expect(prepareMask(INDEX, 'k2', [set, { ...set, z: 11 }])).toBeNull();
  });

  it('ordem de desenho: água → pena (destination-out) → fundo (source-atop) → linhas', () => {
    const m = prepareMask(INDEX, 'k', [set])!;
    const { ctx, calls, state } = fakeCtx();
    const scratch = fakeCtx();
    drawOceanMask(ctx, m, { zoom: 13, origin: { x: 0, y: 0 }, width: 100, height: 80, dpr: 2, lat: 40.7 }, () => ({
      canvas: {} as CanvasImageSource,
      ctx: scratch.ctx,
    }));
    const iFill = calls.findIndex((c) => c.startsWith('fill:source-over:'));
    const iErase = calls.findIndex((c) => c.startsWith('stroke:destination-out'));
    const iDepth = calls.findIndex((c) => c.startsWith('drawImage:source-atop'));
    const iIso = calls.lastIndexOf(calls.filter((c) => c.startsWith('stroke:source-over')).pop() ?? '');
    expect(iFill).toBeGreaterThan(-1);
    expect(iErase).toBeGreaterThan(iFill);
    expect(iDepth).toBeGreaterThan(iErase);
    expect(iIso).toBeGreaterThan(iDepth);
    expect(scratch.calls.some((c) => c.startsWith('fill:source-over'))).toBe(true);
    expect(scratch.state.fillStyle).toBe(OCEAN_MASK_COLORS.fundo);
    expect(state.globalCompositeOperation).toBe('source-over');
  });

  it('linhas de carta só a partir de z10', () => {
    const m = prepareMask(INDEX, 'k', [set])!;
    const { ctx, calls } = fakeCtx();
    drawOceanMask(ctx, m, { zoom: 9.5, origin: { x: 0, y: 0 }, width: 10, height: 10, dpr: 1, lat: 40 }, () => null);
    expect(calls.some((c) => c.startsWith('stroke:source-over'))).toBe(false);
  });
});

describe('public/geo/ocean-mask — forma da saída do bake', () => {
  const index = parseOceanMaskIndex(readJson('index.json'))!;

  it('índice válido, ficheiros presentes, sem ficheiros órfãos', () => {
    expect(index).not.toBeNull();
    const files = new Set(readdirSync(DIR));
    expect(files.has(index.coarse.file)).toBe(true);
    for (const r of index.regions) expect(files.has(r.file)).toBe(true);
    expect([...files].sort()).toEqual(['index.json', index.coarse.file, ...index.regions.map((r) => r.file)].sort());
    expect(readJson('index.json').source.data).toMatch(/OpenStreetMap.*ODbL/);
  });

  it('cada ficheiro: z certo, água não vazia, coordenadas dentro da moldura', () => {
    const check = (file: string, z: number) => {
      const s = parseOceanMaskSet(readJson(file))!;
      expect(s.z).toBe(z);
      expect(s.fill.length).toBeGreaterThan(0);
      expect(s.sea.length).toBeGreaterThan(0);
      const sc = 256 * 2 ** z;
      const minX = ((index.frame[0] + 180) / 360) * sc - 2;
      const maxX = ((index.frame[2] + 180) / 360) * sc + 2;
      for (const p of s.fill)
        for (let i = 0; i < p.length; i += 2) {
          expect(p[i]).toBeGreaterThanOrEqual(minX);
          expect(p[i]).toBeLessThanOrEqual(maxX);
        }
      return s;
    };
    check(index.coarse.file, index.coarse.z);
    let iso = 0;
    for (const r of index.regions) iso += check(r.file, index.regionZ).iso1.length;
    expect(iso).toBeGreaterThan(0);
  });

  it('orçamento: ≤ 250 KB gzip por vista (pior caso: duas regiões vizinhas)', () => {
    const gz = (f: string) => gzipSync(readFileSync(path.join(DIR, f))).length;
    expect(gz(index.coarse.file)).toBeLessThan(250 * 1024);
    for (let i = 1; i < index.regions.length; i++) {
      expect(gz(index.regions[i - 1].file) + gz(index.regions[i].file)).toBeLessThan(250 * 1024);
    }
  });

  it('as vistas de referência caem na região certa', () => {
    const at = (lat: number, lon: number) =>
      filesForView(index, { south: lat - 0.02, north: lat + 0.02, west: lon - 0.04, east: lon + 0.04 }, 13, 0);
    expect(at(40.7, -8.76)).toEqual(['aveiro.json']); // São Jacinto
    expect(at(38.98, -9.42)).toEqual(['lisboa.json']); // Ericeira
    expect(at(37.0, -7.9)).toEqual(['algarve.json']); // Ria Formosa
  });
});
