import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  clipTransform,
  decodeRing,
  lonLatToWorld,
  parseLandClipIndex,
  parseLandClipTile,
  pointInRings,
  projectRing,
  tierForZoom,
  tileKeysForView,
  traceRings,
  type LandClipIndex,
  type LandRing,
} from '../landClip';
import { screenLat, screenLon, toScreen, type ScreenView } from '../seaFieldPaint';

/**
 * Recorte vectorial da terra (campos «Vento» / «Ondulação» do /mapa) contra
 * os mosaicos reais de public/geo/land-clip (scripts/bake-land-clip.py).
 */
const DIR = path.join(__dirname, '../../../public/geo/land-clip');
let index: LandClipIndex;

function ringsFor(lat: number, lon: number, zoom: number): { zq: number; rings: LandRing[] } {
  const tier = tierForZoom(index, zoom);
  const t = index.tiers.indexOf(tier);
  const rings: LandRing[] = [];
  for (const k of tileKeysForView(tier, { south: lat - 0.01, north: lat + 0.01, west: lon - 0.01, east: lon + 0.01 })) {
    const tile = parseLandClipTile(JSON.parse(fs.readFileSync(path.join(DIR, String(t), `${k}.json`), 'utf8')))!;
    rings.push(...tile.rings);
  }
  return { zq: tier.z, rings };
}

/** Terra no recorte do nível de `zoom`? (even-odd nas coordenadas de quantização) */
function land(lat: number, lon: number, zoom = 11): boolean {
  const { zq, rings } = ringsFor(lat, lon, zoom);
  const w = lonLatToWorld(lon, lat, zq);
  return pointInRings(rings, w.x, w.y);
}

beforeAll(() => {
  index = parseLandClipIndex(JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')))!;
});

describe('landClip — formato e projecção', () => {
  it('índice: quatro níveis contíguos por zoom, mosaicos só onde há terra', () => {
    expect(index.tiers.map((t) => [t.minZoom, t.maxZoom])).toEqual([[0, 4], [5, 6], [7, 8], [9, 22]]);
    expect(tierForZoom(index, 11).z).toBe(13);
    expect(tierForZoom(index, 4.6).minZoom).toBe(5);
    expect(tierForZoom(index, 30)).toBe(index.tiers[3]);
    // mar aberto a meio do Atlântico: nenhum mosaico
    expect(tileKeysForView(index.tiers[3], { south: 35.1, north: 35.2, west: -40.2, east: -40.1 })).toEqual([]);
    expect(tileKeysForView(index.tiers[3], { south: 40.6, north: 40.7, west: -8.8, east: -8.7 })).toEqual(['40_-10']);
    expect(parseLandClipIndex({ v: 2 })).toBeNull();
  });

  it('anéis em deltas → absolutos; inválidos rejeitados', () => {
    expect([...decodeRing([10, 20, 5, 0, 0, 5])!]).toEqual([10, 20, 15, 20, 15, 25]);
    expect(decodeRing([1, 2, 3])).toBeNull();
    expect(decodeRing([1, 2, 'x', 4, 5, 6])).toBeNull();
    expect(parseLandClipTile({ v: 1, z: 13, rings: [[0, 0, 1, 0, 0, 1], [1]] })!.rings).toHaveLength(1);
  });

  it('projecção do recorte = projecção do campo (Web Mercator do Leaflet), a qualquer zoom', () => {
    const view: ScreenView = { W: 800, H: 600, zoom: 11.5, origin: { x: 0, y: 0 } };
    const c = lonLatToWorld(-8.75, 40.64, view.zoom);
    view.origin = { x: c.x - 400, y: c.y - 300 };
    // anel com um vértice em Aveiro, quantizado a z13 → ecrã a z11,5
    const q = lonLatToWorld(-8.75, 40.64, 13);
    const ring = Float64Array.from([q.x, q.y, q.x + 8, q.y, q.x, q.y + 8]);
    const px = projectRing(ring, 13, view.zoom, view.origin);
    expect(px[0]).toBeCloseTo(400, 6);
    expect(px[1]).toBeCloseTo(300, 6);
    expect(px[2] - px[0]).toBeCloseTo(8 * 2 ** -1.5, 6);
    const p = toScreen(view, 40.64, -8.75);
    expect(p.x).toBeCloseTo(400, 6);
    expect(screenLon(view, 400)).toBeCloseTo(-8.75, 9);
    expect(screenLat(view, 300)).toBeCloseTo(40.64, 9);
    expect(clipTransform(13, 11, { x: 5, y: 7 })).toEqual({ s: 0.25, tx: -5, ty: -7 });
    const calls: string[] = [];
    traceRings({ moveTo: () => calls.push('m'), lineTo: () => calls.push('l'), closePath: () => calls.push('z') }, [ring]);
    expect(calls.join('')).toBe('mllz');
  });
});

describe('landClip — linha de costa e águas interiores', () => {
  it('costa aberta: praia/mar a poucas centenas de metros da linha de costa', () => {
    expect(land(40.64, -8.70)).toBe(true); // Gafanha (entre ria e mar)
    expect(land(40.64, -8.80)).toBe(false); // mar ao largo da Barra
    expect(land(38.70, -9.50)).toBe(false); // mar ao largo de Cascais
    expect(land(38.72, -9.14)).toBe(true); // Lisboa
    expect(land(39.6, -9.04)).toBe(true); // Nazaré (vila)
    expect(land(39.6, -9.12)).toBe(false); // mar da Nazaré
  });

  it('águas interiores contam como terra (o campo não as pinta)', () => {
    expect(land(40.70, -8.69)).toBe(true); // Ria de Aveiro (laguna)
    expect(land(37.02, -7.85)).toBe(true); // Ria Formosa
    expect(land(38.70, -9.05)).toBe(true); // estuário do Tejo (mar da Palha)
    expect(land(38.47, -8.80)).toBe(true); // estuário do Sado
    expect(land(39.41, -9.20)).toBe(true); // Lagoa de Óbidos
  });

  it('ilhas e outros países do domínio (Natural Earth 10m)', () => {
    expect(land(37.76, -25.6, 7)).toBe(true); // São Miguel
    expect(land(32.75, -17.0, 7)).toBe(true); // Madeira
    expect(land(28.3, -16.6, 7)).toBe(true); // Tenerife
    expect(land(35.2, -2.95, 7)).toBe(true); // Melilla
    expect(land(43.3, -1.5, 7)).toBe(true); // País Basco francês
    expect(land(35.7, -0.65, 7)).toBe(true); // Orão
    expect(land(36.0, -3.0, 7)).toBe(false); // mar de Alborão
    expect(land(44.5, -3.0, 7)).toBe(false); // golfo da Biscaia
    expect(land(40, -3.7, 3)).toBe(true); // Madrid, nível mais grosso
  });
});
