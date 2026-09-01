import { describe, expect, it, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  fetchIsobathFeatures,
  distancePointToSegmentKm,
  isobathDistancesForSpot,
  buildSpotIsobaths,
  simplifyLine,
  buildContoursPayload,
  CONTOUR_SIMPLIFY_DEG,
  DEPTHS,
  MAX_DISTANCE_KM,
} = require('../ihIsobaths.js');

afterEach(() => vi.unstubAllGlobals());

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('distancePointToSegmentKm', () => {
  it('ponto no segmento → ~0', () => {
    // Segmento de 0 a 10 km ao longo do equador fictício (só ordem de grandeza).
    const d = distancePointToSegmentKm(38.7, -9.45, [38.7, -9.5], [38.7, -9.4]);
    expect(d).toBeLessThan(0.05);
  });

  it('distância ao extremo mais próximo quando a projecção cai fora', () => {
    const d = distancePointToSegmentKm(38.8, -9.5, [38.7, -9.5], [38.7, -9.4]);
    // Perpendicular cai fora do segmento → distância ao vértice A (~11.1 km/deg).
    expect(d).toBeGreaterThan(10.5);
    expect(d).toBeLessThan(11.5);
  });

  it('ponto a meio do segmento → metade da distância ao extremo', () => {
    const d = distancePointToSegmentKm(38.75, -9.45, [38.7, -9.5], [38.7, -9.4]);
    // Projecção cai no segmento (y a meio) → distância ≈ 5.5 km.
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(6);
  });
});

describe('isobathDistancesForSpot', () => {
  // Nazaré Costeira: contornos perto da costa (linhas a oeste do spot —
  // o ponto NÃO fica em cima das linhas, para a distância ser > 0).
  const features = [
    { depth: 8, coords: [[[-9.2, 39.54, 8], [-9.2, 39.56, 8]]] },
    { depth: 16, coords: [[[-9.21, 39.54, 16], [-9.21, 39.56, 16]]] },
    { depth: 30, coords: [[[-9.22, 39.54, 30], [-9.22, 39.56, 30]]] },
  ];
  const spot = { id: 'nazare', lat: 39.55, lon: -9.2 };
  // Linha vertical a -9.2 passa PELO spot — deslocada +0.01° na longitude.
  const nearFeatures = features.map((f) => ({
    ...f,
    coords: f.coords.map((line) => line.map((v) => [v[0] - 0.01, v[1], v[2]])),
  }));

  it('devolve as três profundidades com distâncias crescentes', () => {
    const out = isobathDistancesForSpot(spot, nearFeatures);
    expect(Object.keys(out)).toEqual(['8', '16', '30']);
    expect(out[8]).toBeLessThan(out[16]);
    expect(out[16]).toBeLessThan(out[30]);
  });

  it('omite profundidades sem contorno e as que excedem maxKm', () => {
    const partial = nearFeatures.slice(0, 1);
    const out = isobathDistancesForSpot(spot, partial);
    expect(out[8]).toBeGreaterThan(0);
    expect(out[16]).toBeUndefined();
    expect(out[30]).toBeUndefined();

    const far = isobathDistancesForSpot(
      { lat: 38.7, lon: -9.45 },
      [{ depth: 8, coords: [[[-20, 38, 8], [-19, 39, 8]]] }],
      { maxKm: 25 },
    );
    expect(far).toEqual({});
  });

  it('suporta LineString simples e MultiLineString', () => {
    const mixed = nearFeatures.slice(0, 1);
    expect(isobathDistancesForSpot(spot, mixed)[8]).toBeGreaterThan(0);
  });

  it('DEPTHS = [8, 16, 30] e MAX_DISTANCE_KM = 25', () => {
    expect(DEPTHS).toEqual([8, 16, 30]);
    expect(MAX_DISTANCE_KM).toBe(25);
  });
});

describe('fetchIsobathFeatures', () => {
  const feature = (id, depth, line) => ({
    id,
    properties: { id, source: 'LH', depth },
    geometry: { type: 'MultiLineString', coordinates: [line] },
  });

  it('normaliza a resposta OGC (MultiLineString → linhas, depth)', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        numberReturned: 2,
        features: [
          feature(1, 8, [[-9.2, 39.54, 8], [-9.2, 39.56, 8]]),
          feature(2, 16, [[-9.21, 39.54, 16], [-9.21, 39.56, 16]]),
        ],
      }),
    );
    const out = await fetchIsobathFeatures(fetchMock);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 1, depth: 8 });
    expect(out[0].coords[0][0]).toEqual([-9.2, 39.54, 8]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('depcnt_8_16_30');
  });

  it('ignora features sem depth numérico e geometrias desconhecidas', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        features: [
          { properties: { depth: 'x' }, geometry: { type: 'Point', coordinates: [0, 0] } },
          { properties: { depth: 8 }, geometry: { type: 'MultiLineString', coordinates: [] } },
          { properties: { depth: 30 }, geometry: { type: 'LineString', coordinates: [[0, 0, 30], [1, 1, 30]] } },
        ],
      }),
    );
    const out = await fetchIsobathFeatures(fetchMock);
    expect(out).toHaveLength(1);
    expect(out[0].depth).toBe(30);
  });

  it('falha de rede/HTTP propaga o erro', async () => {
    const fetchMock = vi.fn(async () => json({}, 500));
    await expect(fetchIsobathFeatures(fetchMock)).rejects.toThrow(/HTTP 500/);
  });
});

describe('simplifyLine (Douglas-Peucker)', () => {
  it('linhas rectas colapsam para os extremos (vértices redundantes removidos)', () => {
    const line = [[-9, 39], [-9.01, 39.01], [-9.02, 39.02], [-9.03, 39.03]];
    const out = simplifyLine(line, 0.001);
    expect(out).toEqual([[-9, 39], [-9.03, 39.03]]);
  });

  it('mantém o vértice que desvia acima da tolerância', () => {
    const line = [[-9, 39], [-9.01, 39.02], [-9.02, 39]];
    const out = simplifyLine(line, 0.001);
    expect(out).toContainEqual([-9.01, 39.02]);
  });

  it('linhas curtas / vazias passam intactas', () => {
    expect(simplifyLine([[-9, 39], [-9.01, 39]], 0.001)).toEqual([[-9, 39], [-9.01, 39]]);
    expect(simplifyLine([], 0.001)).toEqual([]);
    expect(simplifyLine(null, 0.001)).toEqual([]);
  });
});

describe('buildContoursPayload', () => {
  const features = [
    { depth: 8, coords: [[[-9, 39, 8], [-9.01, 39.01, 8], [-9.02, 39.02, 8]]] },
    { depth: 8, coords: [[[-9.1, 39, 8], [-9.12, 39.01, 8]]] },
    { depth: 30, coords: [[[-9.2, 39, 30], [-9.21, 39.01, 30]]] },
  ];

  it('agrupa por profundidade e descarta o z (vértices 2D)', () => {
    const { contours, vertexCount } = buildContoursPayload(features, 0.001);
    // Object.keys de keys inteiras vem por ordem numérica crescente.
    expect(Object.keys(contours)).toEqual(['8', '30']);
    expect(contours['8']).toHaveLength(2);
    // z removido: [lon, lat] apenas.
    expect(contours['8'][0][0]).toEqual([-9, 39]);
    expect(contours['8'][0][0]).not.toHaveLength(3);
    expect(vertexCount).toBeGreaterThan(0);
  });

  it('linhas simplificadas com < 2 vértices são descartadas', () => {
    const degenerate = [
      { depth: 8, coords: [[[-9, 39, 8]]] },
      { depth: 16, coords: [[[-9, 39, 16], [-9.01, 39, 16]]] },
    ];
    const { contours } = buildContoursPayload(degenerate, 0.001);
    expect(contours['8']).toBeUndefined();
    expect(contours['16']).toHaveLength(1);
  });

  it('CONTOUR_SIMPLIFY_DEG = 0.001 (≈110 m — orçamento ~89 KB no conjunto real)', () => {
    expect(CONTOUR_SIMPLIFY_DEG).toBe(0.001);
  });
});

describe('buildSpotIsobaths', () => {
  it('mapeia spots → depths (só os com contorno próximo)', () => {
    const features = [
      { depth: 8, coords: [[[-9.21, 39.54, 8], [-9.21, 39.56, 8]]] },
    ];
    const spots = [
      { id: 'nazare', lat: 39.55, lon: -9.2 },
      { id: 'far', lat: 30, lon: -20 },
    ];
    const out = buildSpotIsobaths(spots, features);
    expect(out.nazare[8]).toBeGreaterThan(0);
    expect(out.far).toBeUndefined();
  });
});
