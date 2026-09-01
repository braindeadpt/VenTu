/**
 * Unit tests for scripts/lib/ihCoastalWarnings.js — Avisos à Navegação
 * Costeiros do IH (nav_warning_coastal).
 *
 * Covers the pure geometry (ray casting), the GeometryCollection/MultiPolygon
 * normalization, the per-spot coverage map, and the OGC fetch with a mocked
 * fetchImpl (PASS / HTTP error / missing features).
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  fetchCoastalWarnings,
  fetchEsNavWarnings,
  pointInRing,
  warningCoversSpot,
  buildSpotCoverage,
  coastalWarningsForSpot,
  coastalWarningLine,
  DEFAULT_IH_API,
} = require('../ihCoastalWarnings.js');

// Ring around Nazaré (approx): lon/lat corners enclosing (lat 39.600, lon -9.076).
const nazareRing = [
  [-9.2, 39.5],
  [-8.9, 39.5],
  [-8.9, 39.7],
  [-9.2, 39.7],
  [-9.2, 39.5], // closed
];

describe('pointInRing (ray casting)', () => {
  it('ponto dentro → true', () => {
    expect(pointInRing(39.6, -9.076, nazareRing)).toBe(true);
  });

  it('ponto fora → false', () => {
    expect(pointInRing(41.3, -8.7, nazareRing)).toBe(false);
  });

  it('ring não fechado também funciona (vértex final implícito ao inicial)', () => {
    const openRing = nazareRing.slice(0, -1); // drop closing vertex
    expect(pointInRing(39.6, -9.076, openRing)).toBe(true);
  });

  it('ponto no vértice não rebenta (devolve boolean; boundary é ambíguo em ray casting)', () => {
    expect(typeof pointInRing(39.5, -9.2, nazareRing)).toBe('boolean');
  });
});

describe('warningCoversSpot', () => {
  const warning = { id: 1, ref: 'ANAV NR 1/26', category: 'Exercício', url: '', polygons: [nazareRing] };

  it('cobre quando o polígono contém o spot', () => {
    expect(warningCoversSpot(warning, { lat: 39.6, lon: -9.076 })).toBe(true);
  });

  it('não cobre quando o spot está fora de todos os polígonos', () => {
    expect(warningCoversSpot(warning, { lat: 41.3, lon: -8.7 })).toBe(false);
  });

  it('cobre se QUALQUER polígono contém (várias áreas do mesmo aviso)', () => {
    const multi = {
      ...warning,
      polygons: [
        [[-10, 40], [-9.8, 40], [-9.8, 40.2], [-10, 40.2], [-10, 40]],
        nazareRing,
      ],
    };
    expect(warningCoversSpot(multi, { lat: 39.6, lon: -9.076 })).toBe(true);
  });
});

describe('buildSpotCoverage', () => {
  const w1 = { id: 1, ref: 'A1', category: '', url: '', polygons: [nazareRing] };
  const w2 = { id: 2, ref: 'A2', category: '', url: '', polygons: [[[-10, 40], [-9.8, 40], [-9.8, 40.2], [-10, 40.2], [-10, 40]]] };

  it('mapeia spotId → ids dos avisos que o cobrem', () => {
    const spots = [
      { id: 'nazare', lat: 39.6, lon: -9.076 },
      { id: 'peniche', lat: 39.36, lon: -9.38 },
      { id: 'viana', lat: 41.7, lon: -8.83 },
    ];
    expect(buildSpotCoverage(spots, [w1, w2])).toEqual({ nazare: [1] });
  });

  it('spot sem cobertura fica fora do mapa (UI mostra nada)', () => {
    const spots = [{ id: 'viana', lat: 41.7, lon: -8.83 }];
    expect(buildSpotCoverage(spots, [w1, w2])).toEqual({});
  });
});

describe('fetchCoastalWarnings (fetch mockado)', () => {
  const feature = (overrides = {}) => ({
    type: 'Feature',
    properties: { id: 1, coastal_warning: 'ANAV NR 1577/26', category: 'Requisitos de segurança maritima', url: 'https://geoanavnet.hidrografico.pt/...' },
    geometry: {
      type: 'GeometryCollection',
      geometries: [{ type: 'Polygon', coordinates: [nazareRing] }],
    },
    ...overrides,
  });

  it('PASS: normaliza GeometryCollection/MultiPolygon e devolve os avisos', async () => {
    const fetchImpl = async (url, opts) => {
      expect(url).toContain('/collections/nav_warning_coastal/items');
      expect(opts.headers.Accept).toContain('geo+json');
      return new Response(
        JSON.stringify({ features: [feature(), feature({ properties: { id: 2, coastal_warning: 'ANAV NR 2/26' }, geometry: { type: 'MultiPolygon', coordinates: [[nazareRing]] } })] }),
        { status: 200, headers: { 'content-type': 'application/geo+json' } },
      );
    };

    const out = await fetchCoastalWarnings(fetchImpl);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 1, ref: 'ANAV NR 1577/26', category: 'Requisitos de segurança maritima' });
    expect(out[0].polygons).toEqual([nazareRing]);
    expect(out[1].polygons).toEqual([nazareRing]);
  });

  it('FAIL: HTTP 500 → erro (o CLI mantém o ficheiro anterior)', async () => {
    const fetchImpl = async () => new Response('boom', { status: 500 });
    await expect(fetchCoastalWarnings(fetchImpl)).rejects.toThrow('HTTP 500');
  });

  it('FAIL: sem array features → erro', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ collections: [] }), { status: 200 });
    await expect(fetchCoastalWarnings(fetchImpl)).rejects.toThrow('no features array');
  });

  it('ignora features sem id numérico ou sem polígonos', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          features: [
            feature({ properties: { coastal_warning: 'no id' } }), // sem id → ignorada
            feature({ geometry: { type: 'Point', coordinates: [0, 0] } }), // sem polígono → ignorada
            feature({ properties: { id: 3 } }), // válida
          ],
        }),
        { status: 200 },
      );
    const out = await fetchCoastalWarnings(fetchImpl);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(3);
  });

  it('usa o apiBase dado (env IH_API_URL)', async () => {
    let called = '';
    const fetchImpl = async (url) => {
      called = url;
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    };
    await fetchCoastalWarnings(fetchImpl, 'https://example.test');
    expect(called).toContain('https://example.test/collections/nav_warning_coastal/items');
  });

  it('marca source:"ih" nos avisos do IH', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ features: [feature()] }), { status: 200 });
    const out = await fetchCoastalWarnings(fetchImpl);
    expect(out[0].source).toBe('ih');
  });

  it('DEFAULT_IH_API é o endpoint keyless do IH', () => {
    expect(DEFAULT_IH_API).toBe('https://api-features.hidrografico.pt');
  });
});

describe('coastalWarningsForSpot / coastalWarningLine (linha de segurança)', () => {
  const file = {
    warnings: [
      { id: 1, ref: 'ANAV NR 1/26', category: 'Exercício', url: 'https://x', source: 'ih' },
      { id: 2, ref: 'ANAV NR 2/26', category: 'Requisitos', url: '', source: 'ih' },
      { id: 9001, ref: 'AVISO 9001/26', category: 'Ejercicio', url: '', source: 'es' },
    ],
    coverage: { nazare: [1, 9001], guincho: [2] },
  };

  it('resolve coverage ids → avisos (com source preservado)', () => {
    expect(coastalWarningsForSpot(file, 'nazare')).toEqual([
      file.warnings[0],
      file.warnings[2],
    ]);
  });

  it('sem cobertura ou sem ficheiro → [] (a linha simplesmente não aparece)', () => {
    expect(coastalWarningsForSpot(file, 'viana')).toEqual([]);
    expect(coastalWarningsForSpot(null, 'nazare')).toEqual([]);
    expect(coastalWarningsForSpot({}, 'nazare')).toEqual([]);
  });

  it('ignora ids sem warning correspondente (coverage stale)', () => {
    const stale = { ...file, coverage: { nazare: [1, 999] } };
    expect(coastalWarningsForSpot(stale, 'nazare')).toEqual([file.warnings[0]]);
  });

  it('linha pt — refs com categoria, separadas por « · »', () => {
    expect(coastalWarningLine(coastalWarningsForSpot(file, 'nazare'), true)).toBe(
      '⚓ Avisos à Navegação Costeiros (IH): ANAV NR 1/26 — Exercício · AVISO 9001/26 — Ejercicio',
    );
  });

  it('linha en e fallback de ref vazia', () => {
    expect(coastalWarningLine(coastalWarningsForSpot(file, 'guincho'), false)).toBe(
      '⚓ Coastal navigation warnings (IH): ANAV NR 2/26 — Requisitos',
    );
    expect(coastalWarningLine([{ id: 7, ref: '', category: '' }], true)).toBe(
      '⚓ Avisos à Navegação Costeiros (IH): AVISO 7',
    );
  });

  it("sem avisos → linha vazia ('' nunca aparece no email/Telegram)", () => {
    expect(coastalWarningLine([], true)).toBe('');
    expect(coastalWarningLine(null, true)).toBe('');
  });
});

describe('fetchEsNavWarnings (Avisos a los navegantes, cross-border NW)', () => {
  const esFeature = (overrides = {}) => ({
    type: 'Feature',
    properties: { id: 9001, ref: 'AVISO 9001/26', category: 'Ejercicio naval', url: 'https://armada.defensa.gob.es/...' },
    geometry: { type: 'Polygon', coordinates: [nazareRing] },
    ...overrides,
  });

  it('sem URL → lista vazia (camada degrada sem falhar)', async () => {
    expect(await fetchEsNavWarnings(vi.fn(), '')).toEqual([]);
    expect(await fetchEsNavWarnings(vi.fn(), '   ')).toEqual([]);
  });

  it('GeoJSON → avisos normalizados com source:"es" (ref próprio, não coastal_warning)', async () => {
    const fetchImpl = async (url) => {
      expect(url).toBe('https://example.test/es.json');
      return new Response(
        JSON.stringify({ features: [esFeature(), esFeature({ properties: { id: 9002, ref: 'AVISO 9002/26' } })] }),
        { status: 200, headers: { 'content-type': 'application/geo+json' } },
      );
    };
    const out = await fetchEsNavWarnings(fetchImpl, 'https://example.test/es.json');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 9001, ref: 'AVISO 9001/26', category: 'Ejercicio naval', source: 'es' });
    expect(out[0].polygons).toEqual([nazareRing]);
  });

  it('HTTP 500 → erro (o CLI avisa e segue só com os do IH)', async () => {
    const fetchImpl = async () => new Response('boom', { status: 500 });
    await expect(fetchEsNavWarnings(fetchImpl, 'https://example.test/es.json')).rejects.toThrow('HTTP 500');
  });

  it('sem array features → erro', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ foo: 1 }), { status: 200 });
    await expect(fetchEsNavWarnings(fetchImpl, 'https://example.test/es.json')).rejects.toThrow('no features array');
  });
});
