// Bake land polygons for the field land-mask.
// Sources: GADM 4.1 level-0 for PT + ES (we keep only rings intersecting our
// field boxes, simplified with Douglas–Peucker).
import { writeFileSync } from 'fs';

const BOXES = [
  { id: 'mainland', south: 36.35, west: -10.55, north: 42.6, east: -6.55 },
  { id: 'azores', south: 36.85, west: -31.55, north: 39.85, east: -24.75 },
  { id: 'madeira', south: 32.28, west: -17.55, north: 33.22, east: -16.15 },
];

function dp(ring, eps) {
  // Douglas–Peucker on [lon,lat] ring (closed — drop last dup first).
  const pts = ring.slice(0, -1);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1e-9;
    let maxD = -1, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i];
      const d = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  out.push(out[0].slice());
  return out;
}

const url = (c) => `https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_${c}_0.json`;
const rings = [];

for (const c of ['PRT', 'ESP']) {
  const d = await (await fetch(url(c))).json();
  for (const f of d.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0];
      if (ring.length < 8) continue; // micro-islets/slivers: irrelevant at our scale
      const lats = ring.map((p) => p[1]);
      const lons = ring.map((p) => p[0]);
      const s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lons), e = Math.max(...lons);
      if (!BOXES.some((b) => !(n < b.south || s > b.north || e < b.west || w > b.east))) continue;
      const simp = dp(ring, 0.0045).map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
      rings.push(simp);
      console.log(`ring: ${ring.length}→${simp.length} verts, lat ${s.toFixed(1)}-${n.toFixed(1)}`);
    }
  }
}

console.log('total rings:', rings.length, 'verts:', rings.reduce((a, r) => a + r.length, 0));
const ts =
  `// AUTO-GENERATED — scripts/bake-land-rings.mjs. GADM 4.1 level-0 (PT+ES), simplified.\n` +
  `// Rings in [lon,lat] order, closed. Used by landMask.ts to rasterize land.\n` +
  `export const LAND_RINGS: number[][][] = ${JSON.stringify(rings)};\n`;
writeFileSync('src/lib/landRings.ts', ts);
console.log('wrote src/lib/landRings.ts', (ts.length / 1024).toFixed(0), 'KB');
