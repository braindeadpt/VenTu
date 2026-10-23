#!/usr/bin/env node
/**
 * bake-ocean-mask.mjs — máscara VECTORIAL do oceano para o satélite Esri do
 * /mapa (Leaflet). Corrige a «escada» dos tiles World Imagery no mar: o mar e
 * as rias passam a uma cor sólida (#0C2A42) desenhada num canvas por cima dos
 * tiles, com uma pena de ~330 m junto à costa (src/lib/oceanMask.ts +
 * src/components/spots/map/oceanMaskLayer.ts).
 *
 * Fonte: água do OpenStreetMap (© OpenStreetMap contributors, ODbL) servida
 * em vector tiles pela OpenFreeMap (esquema OpenMapTiles, camada `water`).
 *   - z9  na moldura toda (OCEAN_MASK_FRAME) — oceano grosseiro longe da costa;
 *   - z12 nos tiles da faixa costeira do continente (±3 km da costa z9) —
 *     classe `ocean` (linha de costa OSM: inclui Tejo, Sado, Ria Formosa,
 *     parte da Ria de Aveiro) + `lake`/`river`/`dock` (rias, lagoas, estuários).
 *
 * Passos (geometria em píxeis-mundo inteiros ao zoom 17 — ~0,92 m — com
 * clipper-lib; distâncias em metros convertidas à latitude 39,5°N, erro ≤ 4 %
 * nos extremos do continente):
 *   1. água z12 recortada ao tile e unida; fora da faixa, oceano z9;
 *   2. «mar aberto» = abertura morfológica do mar (r = 600 m), maior peça,
 *      dilatada 350 m e intersectada com o mar — o Tejo e o Sado (bocas largas)
 *      ficam mar aberto; Ria de Aveiro, Ria Formosa, Óbidos… ficam «interior»;
 *   3. água interior (rias/lagoas/estuários + lagos/rios OSM da faixa) só em
 *      manchas com > 0,15 km² depois de uma erosão de 60 m (sem salinas nem
 *      canais com menos de ~120 m — a pena interior apagava-os de qualquer modo);
 *   4. costa = fronteira da água (sem a moldura), separada em `sea` (junto ao
 *      mar aberto → pena larga) e `inner` (rias → pena estreita);
 *   5. linhas de carta a 1,2 km e 3,5 km do mar aberto: erosão + abertura e
 *      fecho de 400 m (sem cantos), Douglas–Peucker 35 m, Chaikin ×4;
 *   6. ficheiro grosseiro (z < 11) + 6 regiões de detalhe por latitude.
 *
 * Saída (estática, commitada — NÃO é dado do pipeline, fica fora de public/data):
 *   public/geo/ocean-mask/index.json        { v, source, frame, coarse, regions, … }
 *   public/geo/ocean-mask/coarse.json       { v, z: 11, fill, sea, inner, iso1, iso2 }
 *   public/geo/ocean-mask/<região>.json     { v, z: 16, fill, sea, inner, iso1, iso2 }
 *   fill = anéis (regra even-odd); sea/inner/iso* = polilinhas; tudo em
 *   inteiros [x0, y0, dx1, dy1, …] — píxeis-mundo ao zoom `z` do ficheiro.
 *
 * Uso (offline; o resultado é commitado, não corre no CI):
 *   node scripts/bake-ocean-mask.mjs [--tiles <url com {z}/{x}/{y}>] [--cache <dir>] [--out <dir>]
 * Sem --tiles usa a versão actual do planeta (https://tiles.openfreemap.org/planet);
 * a versão usada fica registada em index.json (`source.tiles`) — repetir com
 * esse --tiles reproduz o mesmo resultado byte a byte.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  WZ,
  lonToWorld,
  latToWorld,
  metersPerUnit,
  bboxToWorld,
  decodeMvtLayer,
  ringArea,
  simplifyRing,
  simplifyLine,
  chaikin,
  lineLength,
  ringToShoreLines,
  clipRingToBox,
  clipLineToBox,
  encodePath,
  OCEAN_MASK_FRAME,
  OCEAN_MASK_REGIONS,
} from './lib/oceanMaskBake.mjs';

const require = createRequire(import.meta.url);
const C = require('clipper-lib');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const OUT = path.resolve(ROOT, arg('--out', 'public/geo/ocean-mask'));
const LAT0 = 39.5;
const MPU = metersPerUnit(WZ, LAT0); // metros por unidade de trabalho
const M = (m) => m / MPU; // metros → unidades
/** Faixa costeira do continente com detalhe z12 (Minho → Guadiana). */
const COAST_BOX = [-9.95, 36.85, -7.25, 42.2];
const COAST_MARGIN_M = 3000;

const OPEN_R_M = 600;
const OPEN_GROW_M = 350;
const INNER_ERODE_M = 60;
const INNER_MIN_KM2 = 0.15;
const ISO_M = [1200, 3500];
const ISO_SMOOTH_M = 400;
const ISO_MIN_LEN_M = 2500;

const REGION_Z = 16; // quantização das regiões (~1,8 m)
const COARSE_Z = 11; // quantização do grosseiro (~59 m)
const REGION_TOL_M = 2.5;
const COARSE_TOL_M = 70;
const ISO_TOL_M = 3;
const ISO_PRE_TOL_M = 35;
const REGION_MIN_ZOOM = 11;

// ── tiles ───────────────────────────────────────────────────────────────────

async function resolveTilesUrl() {
  const explicit = arg('--tiles', null);
  if (explicit) return explicit;
  const r = await fetch('https://tiles.openfreemap.org/planet', { headers: { 'User-Agent': 'ventu-bake-ocean-mask' } });
  if (!r.ok) throw new Error(`TileJSON OpenFreeMap: HTTP ${r.status}`);
  const tj = await r.json();
  if (!Array.isArray(tj.tiles) || !tj.tiles[0]) throw new Error('TileJSON sem tiles');
  return tj.tiles[0];
}

function cacheDirFor(url) {
  const ver = (url.match(/planet\/([^/]+)\//) || [null, 'custom'])[1];
  return path.resolve(arg('--cache', path.join(os.tmpdir(), 'ventu-ocean-mask-tiles', ver)));
}

async function getTile(url, cache, z, x, y) {
  const p = path.join(cache, `${z}_${x}_${y}.pbf`);
  if (existsSync(p)) return readFileSync(p);
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url.replace('{z}', z).replace('{x}', x).replace('{y}', y), {
        headers: { 'User-Agent': 'ventu-bake-ocean-mask' },
      });
      if (r.status === 204 || r.status === 404) {
        writeFileSync(p, Buffer.alloc(0));
        return Buffer.alloc(0);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      writeFileSync(p, b);
      return b;
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 500 * (i + 1)));
    }
  }
  throw new Error(`tile ${z}/${x}/${y}: ${lastErr}`);
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const tileX = (lon, z) => Math.floor(lonToWorld(lon, z) / 256);
const tileY = (lat, z) => Math.floor(latToWorld(lat, z) / 256);

// ── clipper ─────────────────────────────────────────────────────────────────

const NZ = C.PolyFillType.pftNonZero;
const EO = C.PolyFillType.pftEvenOdd;

function boolOp(type, subj, clip, subjClosed = true) {
  const c = new C.Clipper();
  c.AddPaths(subj, C.PolyType.ptSubject, subjClosed);
  if (clip) c.AddPaths(clip, C.PolyType.ptClip, true);
  if (subjClosed) {
    const out = new C.Paths();
    c.Execute(type, out, NZ, NZ);
    return out;
  }
  const tree = new C.PolyTree();
  c.Execute(type, tree, NZ, NZ);
  return C.Clipper.OpenPathsFromPolyTree(tree);
}
const union = (a, b = null) => boolOp(C.ClipType.ctUnion, a, b);
const inter = (a, b) => boolOp(C.ClipType.ctIntersection, a, b);
const diff = (a, b) => boolOp(C.ClipType.ctDifference, a, b);

function offset(paths, deltaUnits, arcTol = 1.5) {
  const co = new C.ClipperOffset(2, arcTol);
  co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, deltaUnits);
  return out;
}

const rect = (b) => [
  [
    { X: b.minX, Y: b.minY },
    { X: b.maxX, Y: b.minY },
    { X: b.maxX, Y: b.maxY },
    { X: b.minX, Y: b.maxY },
  ],
];

/** Peças (contorno exterior + buracos + ilhas) de um conjunto de anéis. */
function pieces(paths) {
  const c = new C.Clipper();
  c.AddPaths(paths, C.PolyType.ptSubject, true);
  const tree = new C.PolyTree();
  c.Execute(C.ClipType.ctUnion, tree, NZ, NZ);
  const out = [];
  const walk = (node) => {
    for (const outer of node.Childs()) {
      const acc = [outer.Contour()];
      for (const hole of outer.Childs()) {
        acc.push(hole.Contour());
        for (const isl of hole.Childs()) walk({ Childs: () => [isl] });
      }
      out.push({ area: C.Clipper.Area(outer.Contour()), paths: acc });
    }
  };
  walk(tree);
  return out;
}

const toPts = (path) => path.map((p) => [p.X, p.Y]);
const nverts = (paths) => paths.reduce((s, p) => s + p.length, 0);

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
  const url = tiles;
  const cache = cacheDirFor(url);
  mkdirSync(cache, { recursive: true });
  log('tiles', url, 'cache', cache);

  const frame = bboxToWorld(OCEAN_MASK_FRAME, WZ);

  // 1) z9 na moldura
  const z9 = [];
  for (let x = tileX(OCEAN_MASK_FRAME[0], 9); x <= tileX(OCEAN_MASK_FRAME[2], 9); x++)
    for (let y = tileY(OCEAN_MASK_FRAME[3], 9); y <= tileY(OCEAN_MASK_FRAME[1], 9); y++) z9.push([x, y]);
  const water9 = await mapLimit(z9, 8, async ([x, y]) => tileWater(await getTile(url, cache, 9, x, y), 9, x, y, ['ocean']));
  const ocean9 = inter(union(water9.flatMap((w) => w.ocean ?? [])), rect(frame));
  log('z9', z9.length, 'tiles; oceano', nverts(ocean9), 'vértices');

  // 2) tiles z12 da faixa costeira: mistos (terra e mar z9) numa margem de 3 km
  const marg = M(COAST_MARGIN_M);
  const ocean9Pts = ocean9.map(toPts);
  const inOcean9 = (px, py) => {
    let ins = false;
    for (const r of ocean9Pts)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++)
        if (r[i][1] > py !== r[j][1] > py && px < ((r[j][0] - r[i][0]) * (py - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0])
          ins = !ins;
    return ins;
  };
  const z12 = [];
  const S = 2 ** (WZ - 12) * 256;
  for (let x = tileX(COAST_BOX[0], 12); x <= tileX(COAST_BOX[2], 12); x++)
    for (let y = tileY(COAST_BOX[3], 12); y <= tileY(COAST_BOX[1], 12); y++) {
      let sea = 0;
      let land = 0;
      for (let i = 0; i <= 6; i++)
        for (let j = 0; j <= 6; j++) {
          const px = x * S - marg + ((S + 2 * marg) * i) / 6;
          const py = y * S - marg + ((S + 2 * marg) * j) / 6;
          if (inOcean9(px, py)) sea++;
          else land++;
        }
      if (sea && land) z12.push([x, y]);
    }
  const water12 = await mapLimit(z12, 8, async ([x, y]) =>
    tileWater(await getTile(url, cache, 12, x, y), 12, x, y, ['ocean', 'lake', 'river', 'dock']),
  );
  const foot = union(z12.flatMap(([x, y]) => rect({ minX: x * S, minY: y * S, maxX: (x + 1) * S, maxY: (y + 1) * S })));
  const ocean12 = union(water12.flatMap((w) => w.ocean ?? []));
  // manchas interiores minúsculas (salinas, tanques) nunca passam o filtro do passo 4 — fora já (só velocidade)
  const tinyArea = (0.01 * 1e6) / (MPU * MPU);
  const inl12 = pieces(water12.flatMap((w) => [...(w.lake ?? []), ...(w.river ?? []), ...(w.dock ?? [])]))
    .filter((p) => p.area > tinyArea)
    .flatMap((p) => p.paths);
  log('z12', z12.length, 'tiles; oceano', nverts(ocean12), 'interior', nverts(inl12));

  // mar = z12 na faixa ∪ z9 fora dela; fecha micro-juntas entre tiles (±2 m)
  let sea = union(ocean12, diff(ocean9, foot));
  sea = offset(offset(sea, M(2)), -M(2));
  log('mar', nverts(sea), 'vértices');

  // 3) mar aberto (abertura r = 600 m, maior peça) — Tejo/Sado incluídos
  const opened = offset(offset(sea, -M(OPEN_R_M), 2), M(OPEN_R_M), 2);
  const big = pieces(opened).sort((a, b) => b.area - a.area)[0];
  const seaOpen = inter(sea, offset(big.paths, M(OPEN_GROW_M), 2));
  const lagoons = diff(sea, seaOpen);
  log('mar aberto', nverts(seaOpen), 'lagoas', nverts(lagoons));

  // 4) água interior: rias/lagoas + lagos/rios OSM da faixa, manchas largas
  const innerAll = union(diff(offset(offset(inl12, M(3)), -M(3)), offset(sea, M(5))), lagoons);
  const eroded = offset(innerAll, -M(INNER_ERODE_M));
  const minArea = (INNER_MIN_KM2 * 1e6) / (MPU * MPU);
  const keepEroded = pieces(eroded)
    .filter((p) => p.area > minArea)
    .flatMap((p) => p.paths);
  const inner = inter(innerAll, offset(keepEroded, M(INNER_ERODE_M + 1)));
  const water = union(seaOpen, inner);
  log('interior mantido', nverts(inner), '; água', nverts(water));

  // 5) costa (sem moldura) e classificação mar aberto / interior
  const shore = water.flatMap((r) => ringToShoreLines(toPts(r), frame));
  const shorePaths = shore.map((l) => l.map(([X, Y]) => ({ X, Y })));
  const seaZone = offset(seaOpen, M(3));
  const seaCoast = boolOp(C.ClipType.ctIntersection, shorePaths, seaZone, false).map(toPts);
  const innerCoast = boolOp(C.ClipType.ctDifference, shorePaths, seaZone, false).map(toPts);
  log('costa', shore.length, 'linhas; mar', seaCoast.length, 'interior', innerCoast.length);

  // 6) linhas de carta (mar aberto, sem cantos)
  const iso = ISO_M.map((d) => {
    let g = offset(seaOpen, -M(d), 2);
    g = offset(g, -M(ISO_SMOOTH_M), 2);
    g = offset(g, 2 * M(ISO_SMOOTH_M), 2);
    g = offset(g, -M(ISO_SMOOTH_M), 2);
    const near = M(d + ISO_SMOOTH_M + 200);
    const nearFrame = (p) =>
      p[0] < frame.minX + near || p[0] > frame.maxX - near || p[1] < frame.minY + near || p[1] > frame.maxY - near;
    const lines = [];
    for (const r of g) {
      const pts = toPts(r);
      // parte nos troços junto à moldura (artefactos do corte, não costa)
      let cur = [];
      for (const p of [...pts, pts[0]]) {
        if (nearFrame(p)) {
          if (cur.length > 1) lines.push(cur);
          cur = [];
        } else cur.push(p);
      }
      if (cur.length > 1) lines.push(cur);
    }
    return lines
      .filter((l) => lineLength(l) * MPU >= ISO_MIN_LEN_M)
      .map((l) => {
        const closed = l.length > 3 && l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1];
        // DP largo (tira os serrilhados herdados da costa) e Chaikin ×4 (curva lisa)
        const base = simplifyLine(l, M(ISO_PRE_TOL_M));
        const sm = chaikin(closed ? base.slice(0, -1) : base, 4, closed);
        return simplifyLine(closed ? [...sm, sm[0]] : sm, M(ISO_TOL_M));
      });
  });
  log('iso', iso.map((l) => l.length).join(' / '), 'linhas');

  // 7) saída
  mkdirSync(OUT, { recursive: true });
  const fillRings = water.map(toPts).map((r) => ({ r, a: Math.abs(ringArea(r)) }));
  const writeSet = (file, z, box) => {
    const div = 2 ** (WZ - z);
    const tol = z === COARSE_Z ? M(COARSE_TOL_M) : M(REGION_TOL_M);
    const minRing = z === COARSE_Z ? (2 * div) ** 2 : 4;
    const clipR = (r) => (box ? clipRingToBox(r, box) : r);
    const clipL = (l) => (box ? clipLineToBox(l, box) : [l]);
    const fill = [];
    for (const { r, a } of fillRings) {
      if (a < minRing) continue;
      const c = clipR(r);
      if (!c.length) continue;
      const e = encodePath(simplifyRing(c, tol), div, 3);
      if (e) fill.push(e);
    }
    const lines = (ls, t, minLen = 0) => {
      const out = [];
      for (const l of ls) {
        if (minLen && lineLength(l) < minLen) continue;
        for (const c of clipL(l)) {
          const e = encodePath(simplifyLine(c, t), div, 2);
          if (e) out.push(e);
        }
      }
      return out;
    };
    const coarse = z === COARSE_Z;
    const data = {
      v: 1,
      z,
      fill,
      sea: lines(seaCoast, tol, coarse ? 4 * div : 0),
      inner: lines(innerCoast, tol, coarse ? 4 * div : 0),
      iso1: lines(iso[0], coarse ? tol : M(ISO_TOL_M)),
      iso2: lines(iso[1], coarse ? tol : M(ISO_TOL_M)),
    };
    const s = JSON.stringify(data);
    writeFileSync(path.join(OUT, file), s);
    const gz = gzipSync(s, { level: 9 }).length;
    log(file, `${(s.length / 1024).toFixed(0)} KB, gzip ${(gz / 1024).toFixed(0)} KB`);
    return { bytes: s.length, gzip: gz };
  };

  const sizes = { 'coarse.json': writeSet('coarse.json', COARSE_Z, null) };
  const regions = [];
  for (const reg of OCEAN_MASK_REGIONS) {
    const file = `${reg.id}.json`;
    sizes[file] = writeSet(file, REGION_Z, bboxToWorld(reg.bbox, WZ));
    regions.push({ id: reg.id, file, bbox: reg.bbox });
  }
  const index = {
    v: 1,
    source: {
      data: 'OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0) — camada water do esquema OpenMapTiles',
      tiles,
      script: 'scripts/bake-ocean-mask.mjs',
    },
    frame: OCEAN_MASK_FRAME,
    coarse: { file: 'coarse.json', z: COARSE_Z },
    regionMinZoom: REGION_MIN_ZOOM,
    regionZ: REGION_Z,
    regions,
  };
  writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  log('ok', OUT, JSON.stringify(sizes));
}

let tiles = '';

/** Água de um tile MVT → { classe: Paths } em unidades de trabalho, recortada ao tile. */
function tileWater(buf, z, x, y, classes) {
  const out = {};
  if (!buf || !buf.length) return out;
  const layer = decodeMvtLayer(new Uint8Array(buf.buffer, buf.byteOffset, buf.length), 'water');
  if (!layer) return out;
  const ext = layer.extent;
  const k = (2 ** (WZ - z) * 256) / ext;
  const byClass = {};
  for (const f of layer.features) {
    if (f.type !== 3) continue;
    const cls = f.props.class;
    if (!classes.includes(cls)) continue;
    if (f.props.intermittent === 1 || f.props.intermittent === true) continue;
    const rings = f.rings.map((r) => r.map(([px, py]) => ({ X: Math.round((x * ext + px) * k), Y: Math.round((y * ext + py) * k) })));
    // cada feature normalizada (even-odd → orientação canónica) antes da união non-zero
    const norm = C.Clipper.SimplifyPolygons(rings, EO);
    (byClass[cls] ||= []).push(...norm);
  }
  const S = 2 ** (WZ - z) * 256;
  const box = rect({ minX: x * S, minY: y * S, maxX: (x + 1) * S, maxY: (y + 1) * S });
  for (const [cls, paths] of Object.entries(byClass)) out[cls] = inter(union(paths), box);
  return out;
}

resolveTilesUrl()
  .then((u) => {
    tiles = u;
  })
  .then(main)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
