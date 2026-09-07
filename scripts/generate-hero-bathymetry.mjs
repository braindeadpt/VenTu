#!/usr/bin/env node
/**
 * Bakes the hero's bathymetric texture from the IH isobath contours.
 *
 * WHY BAKE: the hero paints above the fold, and the full contour file is
 * ~177 KB — a network round-trip and a parse before the most important pixels
 * on the site. This emits a tiny TS module instead: the paths ship inside the
 * JS bundle, so the texture is there on first paint with zero extra requests.
 *
 * WHY SIMPLIFY AGAIN: fetch-ih-isobaths.js already simplifies to ~2.1K
 * vertices for the MAP, where the lines are data you read against a scale.
 * In the hero they are texture — nobody measures a depth off the background —
 * so a much coarser tolerance costs nothing visually and roughly quarters the
 * payload.
 *
 *   node scripts/generate-hero-bathymetry.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'public/data/isobaths-contours.json');
const OUT = resolve(ROOT, 'src/lib/generated/heroBathymetry.ts');

/** Coarser than the map's 0.001° — texture, not a readable depth line. */
const TOLERANCE_DEG = 0.006;
/** Drop stubs: a 2-point fragment reads as a scratch, not a contour. */
const MIN_POINTS = 4;
/** SVG units across the viewBox; height follows from the real aspect ratio. */
const VIEWBOX_WIDTH = 1000;

/** Perpendicular distance from p to the segment a→b. */
function perpDistance(p, a, b) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const cx = ax + Math.max(0, Math.min(1, t)) * dx;
  const cy = ay + Math.max(0, Math.min(1, t)) * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Ramer–Douglas–Peucker, iterative (deep coastlines blow a recursive stack). */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const file = JSON.parse(readFileSync(SRC, 'utf8'));
const contours = file.contours ?? {};

// Bounding box across every depth, so all three layers share one projection.
let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
for (const lines of Object.values(contours)) {
  for (const line of lines) {
    for (const [lon, lat] of line) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
}

// Equirectangular with a cosine correction at the mean latitude. At this
// extent (~2.3° of longitude) the distortion against a proper projection is
// far below one SVG unit — and this is a background, not a chart to navigate.
const meanLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
const lonScale = Math.cos(meanLat);
const spanX = (maxLon - minLon) * lonScale;
const spanY = maxLat - minLat;
const viewBoxHeight = Math.round((VIEWBOX_WIDTH * spanY) / spanX);
const project = ([lon, lat]) => [
  ((lon - minLon) * lonScale * VIEWBOX_WIDTH) / spanX,
  // SVG y grows downward; north must end up at the top.
  ((maxLat - lat) * VIEWBOX_WIDTH) / spanX,
];

const layers = [];
let keptPoints = 0;
let sourcePoints = 0;

for (const depth of file.depths ?? Object.keys(contours).map(Number)) {
  const lines = contours[String(depth)] ?? [];
  const paths = [];
  for (const line of lines) {
    sourcePoints += line.length;
    const simplified = simplify(line, TOLERANCE_DEG);
    if (simplified.length < MIN_POINTS) continue;
    keptPoints += simplified.length;
    const d = simplified
      .map(project)
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join('');
    paths.push(d);
  }
  layers.push({ depth: Number(depth), paths });
}

const body = `/**
 * GENERATED — do not edit. Run \`npm run hero:bathymetry\`.
 *
 * The hero's bathymetric texture: IH isobath contours (${(file.depths ?? []).join('/')} m)
 * off the Portuguese coast, projected into a fixed viewBox and simplified to
 * ${TOLERANCE_DEG}° — coarse on purpose, because in the hero these lines are
 * texture rather than a depth you read.
 *
 * Source: ${file.sourceCollection ?? 'IH depcnt_8_16_30'}
 * Baked from public/data/isobaths-contours.json (fetched ${file.fetchedAt ?? 'unknown'}).
 * ${sourcePoints} source vertices reduced to ${keptPoints}.
 */

export interface HeroBathymetryLayer {
  /** Contour depth in metres. */
  depth: number;
  /** SVG path \`d\` strings in HERO_BATHYMETRY_VIEWBOX coordinates. */
  paths: string[];
}

/** Real geographic extent of the baked paths, for attribution and debugging. */
export const HERO_BATHYMETRY_BOUNDS = {
  minLon: ${minLon.toFixed(4)},
  maxLon: ${maxLon.toFixed(4)},
  minLat: ${minLat.toFixed(4)},
  maxLat: ${maxLat.toFixed(4)},
} as const;

export const HERO_BATHYMETRY_VIEWBOX = {
  width: ${VIEWBOX_WIDTH},
  height: ${viewBoxHeight},
} as const;

export const HERO_BATHYMETRY: HeroBathymetryLayer[] = ${JSON.stringify(layers, null, 2)};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body, 'utf8');

const bytes = Buffer.byteLength(body, 'utf8');
console.log(
  `hero-bathymetry: ${layers.length} layers, ` +
    `${layers.reduce((n, l) => n + l.paths.length, 0)} paths, ` +
    `${sourcePoints} -> ${keptPoints} vertices, ${(bytes / 1024).toFixed(1)} KB`,
);
