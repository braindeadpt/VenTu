import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  loadCoastalNavWarnings,
  warningsForSpot,
  clearCoastalNavWarningsCache,
  type CoastalWarningsFile,
} from '@/lib/ihCoastalWarnings';

afterEach(() => {
  clearCoastalNavWarningsCache();
  vi.unstubAllGlobals();
});

const RING: number[][][] = [
  [
    [-9.21, 39.56],
    [-9.2, 39.57],
    [-9.19, 39.56],
    [-9.21, 39.56],
  ],
];

const file = (overrides: Partial<CoastalWarningsFile> = {}): CoastalWarningsFile => ({
  warnings: [
    {
      id: 1,
      ref: 'ANAV NR 1577/26',
      category: 'Requisitos de segurança maritima',
      url: 'https://example.test/1',
      source: 'ih',
      polygons: RING,
    },
    { id: 2, ref: 'ANAV NR 1578/26', category: 'Exercício militar', url: '', source: 'ih' },
    // Cross-border NW: aviso espanhol «Avisos a los navegantes».
    {
      id: 9001,
      ref: 'AVISO 9001/26',
      category: 'Ejercicio naval',
      url: 'https://armada.defensa.gob.es/',
      source: 'es',
      polygons: RING,
    },
  ],
  coverage: { nazare: [1], peniche: [1, 2] },
  fetchedAt: '2026-08-15T08:00:00Z',
  sourceCollection: 'nav_warning_coastal',
  ...overrides,
});

describe('loadCoastalNavWarnings', () => {
  it('fetcha ih-coastal-warnings.json uma vez e cacheia por sessão', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(file()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const a = await loadCoastalNavWarnings(fetchMock as typeof fetch);
    const b = await loadCoastalNavWarnings(fetchMock as typeof fetch);
    expect(a?.warnings?.length).toBe(3);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('404 → null (o bloco esconde-se, nunca quebra a página)', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadCoastalNavWarnings(fetchMock as typeof fetch)).toBeNull();
  });

  it('falha de rede → null', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadCoastalNavWarnings(fetchMock as typeof fetch)).toBeNull();
  });
});

describe('warningsForSpot', () => {
  it('resolve os ids de cobertura para os avisos do spot', () => {
    const out = warningsForSpot(file(), 'nazare');
    expect(out?.map((w) => w.ref)).toEqual(['ANAV NR 1577/26']);
  });

  it('spot com vários avisos → todos resolvidos por ordem', () => {
    const out = warningsForSpot(file(), 'peniche');
    expect(out?.map((w) => w.ref)).toEqual(['ANAV NR 1577/26', 'ANAV NR 1578/26']);
  });

  it('spot sem cobertura / ficheiro ausente → null', () => {
    expect(warningsForSpot(file(), 'viana')).toBeNull();
    expect(warningsForSpot(null, 'nazare')).toBeNull();
    expect(warningsForSpot(file({ coverage: {} }), 'nazare')).toBeNull();
  });

  it('id de cobertura sem warning correspondente é ignorado', () => {
    const out = warningsForSpot(file({ coverage: { nazare: [99] } }), 'nazare');
    expect(out).toBeNull();
  });

  it('preserva os polígonos (área coberta) para o overlay do mapa', () => {
    const out = warningsForSpot(file(), 'nazare');
    expect(out?.[0].polygons).toEqual(RING);
    // Aviso sem polígonos → polygons ausente (o mapa simplesmente não desenha).
    const peniche = warningsForSpot(file(), 'peniche');
    expect(peniche?.[1].polygons).toBeUndefined();
  });

  it('preserva source (ih|es) para a secção rotular por plataforma', () => {
    const out = warningsForSpot(file({ coverage: { nazare: [1, 9001] } }), 'nazare');
    expect(out?.map((w) => w.source)).toEqual(['ih', 'es']);
    expect(out?.[1].ref).toBe('AVISO 9001/26');
  });
});
