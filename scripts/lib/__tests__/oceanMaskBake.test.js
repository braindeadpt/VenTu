import { describe, it, expect } from 'vitest';
import {
  decodeGeometry,
  decodeMvtLayer,
  encodePath,
  decodePath,
  ringToShoreLines,
  clipRingToBox,
  clipLineToBox,
  chaikin,
  simplifyLine,
  simplifyRing,
  ringArea,
  lonToWorld,
  latToWorld,
  worldToLon,
  worldToLat,
  bboxToWorld,
  OCEAN_MASK_FRAME,
  OCEAN_MASK_REGIONS,
} from '../oceanMaskBake.mjs';

// ── escritor protobuf mínimo (só para montar tiles MVT de teste) ──
const varint = (n) => {
  const out = [];
  while (n > 127) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
};
const key = (field, wire) => varint(field * 8 + wire);
const bytes = (field, arr) => [...key(field, 2), ...varint(arr.length), ...arr];
const str = (field, s) => bytes(field, [...new TextEncoder().encode(s)]);
const packed = (field, nums) => bytes(field, nums.flatMap(varint));
const zz = (n) => (n << 1) ^ (n >> 31);
const cmd = (id, count) => (count << 3) | id;

/** quadrado (x,y)-(x+s,y+s) como comandos MVT, cursor a partir de (cx,cy). */
function squareGeom(x, y, s) {
  return [cmd(1, 1), zz(x), zz(y), cmd(2, 3), zz(s), zz(0), zz(0), zz(s), zz(-s), zz(0), cmd(7, 1)];
}

function buildTile() {
  const featOcean = [
    ...packed(2, [0, 0]), // class=ocean
    ...key(3, 0), ...varint(3), // POLYGON
    ...packed(4, squareGeom(0, 0, 100)),
  ];
  const featLake = [
    ...packed(2, [0, 1, 1, 2]), // class=lake, intermittent=1
    ...key(3, 0), ...varint(3),
    ...packed(4, squareGeom(200, 200, 50)),
  ];
  const valOcean = str(1, 'ocean');
  const valLake = str(1, 'lake');
  const valOne = [...key(5, 0), ...varint(1)];
  const water = [
    ...key(15, 0), ...varint(2),
    ...str(1, 'water'),
    ...bytes(2, featOcean),
    ...bytes(2, featLake),
    ...str(3, 'class'),
    ...str(3, 'intermittent'),
    ...bytes(4, valOcean),
    ...bytes(4, valLake),
    ...bytes(4, valOne),
    ...key(5, 0), ...varint(4096),
  ];
  const other = [...str(1, 'transportation'), ...key(5, 0), ...varint(4096)];
  return new Uint8Array([...bytes(3, other), ...bytes(3, water)]);
}

describe('oceanMaskBake — MVT', () => {
  it('decodeGeometry: MoveTo/LineTo/ClosePath com deltas zigzag', () => {
    expect(decodeGeometry(squareGeom(10, 20, 5))).toEqual([[[10, 20], [15, 20], [15, 25], [10, 25]]]);
  });

  it('decodeMvtLayer: encontra a camada pedida, propriedades e extent', () => {
    const layer = decodeMvtLayer(buildTile(), 'water');
    expect(layer.extent).toBe(4096);
    expect(layer.features).toHaveLength(2);
    expect(layer.features[0].props).toEqual({ class: 'ocean' });
    expect(layer.features[0].type).toBe(3);
    expect(layer.features[0].rings[0][2]).toEqual([100, 100]);
    expect(layer.features[1].props).toEqual({ class: 'lake', intermittent: 1 });
    expect(decodeMvtLayer(buildTile(), 'nada')).toBeNull();
  });
});

describe('oceanMaskBake — geometria', () => {
  it('encodePath/decodePath: ida e volta com quantização e sem vértices repetidos', () => {
    const pts = [[0, 0], [4, 0], [4.4, 0.4], [8, 8], [0, 8], [0, 0]];
    const enc = encodePath(pts, 2, 3);
    expect(enc.slice(0, 2)).toEqual([0, 0]);
    expect(decodePath(enc)).toEqual([[0, 0], [2, 0], [4, 4], [0, 4]]);
    expect(encodePath([[0, 0], [0.1, 0.1]], 2, 2)).toBeNull();
  });

  it('ringToShoreLines descarta os segmentos em cima da moldura', () => {
    const box = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    // mar encostado à moldura a oeste/norte/sul; costa = segmentos interiores
    const ring = [[0, 0], [60, 0], [70, 50], [60, 100], [0, 100]];
    expect(ringToShoreLines(ring, box)).toEqual([[[60, 0], [70, 50], [60, 100]]]);
    // ilha (nenhum segmento na moldura) → linha fechada
    const isl = [[40, 40], [50, 40], [50, 50]];
    expect(ringToShoreLines(isl, box)).toEqual([[[40, 40], [50, 40], [50, 50], [40, 40]]]);
  });

  it('clipRingToBox preserva a área dentro da caixa', () => {
    const r = clipRingToBox([[-10, -10], [10, -10], [10, 10], [-10, 10]], { minX: 0, minY: 0, maxX: 20, maxY: 20 });
    expect(Math.abs(ringArea(r))).toBeCloseTo(100);
    expect(clipRingToBox([[30, 30], [40, 30], [40, 40]], { minX: 0, minY: 0, maxX: 20, maxY: 20 })).toEqual([]);
  });

  it('clipLineToBox parte a linha nas saídas e reentradas', () => {
    const out = clipLineToBox([[-5, 5], [5, 5], [15, 5], [15, 15], [5, 15]], { minX: 0, minY: 0, maxX: 10, maxY: 20 });
    expect(out).toEqual([
      [[0, 5], [5, 5], [10, 5]],
      [[10, 15], [5, 15]],
    ]);
  });

  it('chaikin mantém as pontas das linhas abertas e alisa os cantos', () => {
    const sm = chaikin([[0, 0], [10, 0], [10, 10]], 2);
    expect(sm[0]).toEqual([0, 0]);
    expect(sm[sm.length - 1]).toEqual([10, 10]);
    expect(sm.some(([x, y]) => x === 10 && y === 0)).toBe(false);
  });

  it('simplifyLine/simplifyRing tiram vértices colineares', () => {
    expect(simplifyLine([[0, 0], [1, 0.01], [2, 0], [3, 0]], 0.1)).toEqual([[0, 0], [3, 0]]);
    const r = simplifyRing([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]], 0.1);
    expect(r).toHaveLength(4);
  });

  it('projecção Web Mercator (convenção Leaflet) ida e volta', () => {
    const x = lonToWorld(-9.42, 16);
    const y = latToWorld(38.98, 16);
    expect(worldToLon(x, 16)).toBeCloseTo(-9.42, 9);
    expect(worldToLat(y, 16)).toBeCloseTo(38.98, 9);
    const b = bboxToWorld([-10, 38, -9, 39], 10);
    expect(b.minY).toBeLessThan(b.maxY);
  });

  it('regiões: faixas contíguas que cobrem a moldura de norte a sul', () => {
    const [w, s, e, n] = OCEAN_MASK_FRAME;
    expect(OCEAN_MASK_REGIONS[0].bbox[3]).toBe(n);
    expect(OCEAN_MASK_REGIONS[OCEAN_MASK_REGIONS.length - 1].bbox[1]).toBe(s);
    for (let i = 0; i < OCEAN_MASK_REGIONS.length; i++) {
      const b = OCEAN_MASK_REGIONS[i].bbox;
      expect(b[0]).toBe(w);
      expect(b[2]).toBe(e);
      if (i) expect(b[3]).toBe(OCEAN_MASK_REGIONS[i - 1].bbox[1]);
    }
  });
});
