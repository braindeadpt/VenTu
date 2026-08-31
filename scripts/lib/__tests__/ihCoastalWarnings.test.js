/**
 * Unit tests for scripts/lib/ihCoastalWarnings.js — Avisos à Navegação
 * Costeiros do IH (nav_warning_coastal).
 *
 * Covers the pure geometry (ray casting), the GeometryCollection/MultiPolygon
 * normalization, the per-spot coverage map, and the OGC fetch with a mocked
 * fetchImpl (PASS / HTTP error / missing features).
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  fetchCoastalWarnings,
  pointInRing,
  warningCoversSpot,
  buildSpotCoverage,
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

  it('DEFAULT_IH_API é o endpoint keyless do IH', () => {
    expect(DEFAULT_IH_API).toBe('https://api-features.hidrografico.pt');
  });
});
