#!/usr/bin/env node
/**
 * Gera a geografia estática da cena «A praia em 3D» (#184) para os spots
 * curados: `public/geo/praia/<id>.json`. Corre offline (à mão, quando os
 * spots curados mudam) e o resultado vai no repositório: a página só lê
 * ficheiros da mesma origem (CSP inalterada) e nenhum pedido a terceiros.
 *
 * Fontes (descarregadas uma vez para uma cache local com curl):
 *  - OpenStreetMap via tiles vectoriais OpenFreeMap (OpenMapTiles, z13):
 *    oceano (linha de costa), pinhal/mato, urbano, areia, rocha, estradas,
 *    limites administrativos, localidades e picos (© OpenStreetMap contributors, ODbL);
 *  - AWS Terrain Tiles (terrarium) z12 (relevo) e z10 (batimetria).
 * O cálculo das faixas de profundidade, da areia, das cotas e da grelha das
 * frentes de onda é o mesmo do browser (`src/lib/praiaGeo.ts`, via o
 * equivalente JS gerado por esbuild/tsx não é preciso: o módulo TS é
 * transpilado aqui com o compilador do TypeScript já instalado).
 *
 * Descodificação MVT com `@mapbox/vector-tile` + `pbf`, que já estão em
 * node_modules como dependências do maplibre-gl (nada novo no package.json).
 *
 * Uso: node scripts/gen-praia-geo.mjs [id ...]   (cache em .cache/praia-geo/)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { VectorTile } = await import('@mapbox/vector-tile');
const { PbfReader: Pbf } = await import('pbf');
const ts = require('typescript');

const CACHE = path.join(raiz, '.cache', 'praia-geo');
const OUT = path.join(raiz, 'public', 'geo', 'praia');
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

/* ---------- módulos TS do site (transpilados para uma pasta temporária) ---------- */
const tmp = fs.mkdtempSync(path.join(CACHE, 'mod-'));
function transpila(rel, deps = {}) {
  let src = fs.readFileSync(path.join(raiz, rel), 'utf8');
  for (const [de, para] of Object.entries(deps)) src = src.replaceAll(de, para);
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const f = path.join(tmp, path.basename(rel).replace(/\.ts$/, '.mjs'));
  fs.writeFileSync(f, js);
  return f;
}
// praiaCena importa os tokens (só para cores); para o gerador basta PROF_FAIXAS
fs.writeFileSync(path.join(tmp, 'praiaCena.mjs'), 'export const PROF_FAIXAS = [5, 10, 20, 30, 50, 75, 100];\n');
const geoMod = await import(pathToFileURL(transpila('src/lib/praiaGeo.ts', { "'@/lib/praiaCena'": "'./praiaCena.mjs'" })).href);
const { construirGeo, alisa, aneisGrelha, desfoca, areaAnel } = geoMod;

/* ---------- spots curados e coordenadas ---------- */
const editorial = JSON.parse(fs.readFileSync(path.join(raiz, 'src/lib/spotEditorial.json'), 'utf8')).spots;
const spotsTs = fs.readFileSync(path.join(raiz, 'src/lib/spots.ts'), 'utf8');
function coordsDe(id) {
  const re = new RegExp(`id: '${id}'[\\s\\S]{0,400}?lat: (-?[\\d.]+), lon: (-?[\\d.]+)`);
  const m = spotsTs.match(re);
  if (!m) throw new Error(`sem coordenadas para ${id}`);
  return [Number(m[2]), Number(m[1])];
}
const pedidos = process.argv.slice(2);
const ids = (pedidos.length ? pedidos : Object.keys(editorial)).filter((id) => editorial[id]);

/* ---------- tiles ---------- */
function baixa(url, f) {
  if (fs.existsSync(f) && fs.statSync(f).size > 0) return fs.readFileSync(f);
  for (let k = 0; k < 3; k++) {
    try {
      execFileSync('curl', ['-sf', '--max-time', '40', '-A', 'VenTu praia-geo (+https://ventu.surf)', '-o', f, url]);
      return fs.readFileSync(f);
    } catch {
      /* tenta outra vez */
    }
  }
  return null;
}
const tileXY = (lon, lat, z) => {
  const n = 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [Math.floor(((lon + 180) / 360) * n), Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n)];
};
const tile2ll = (x, y, z) => {
  const n = 2 ** z;
  return [(x / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI];
};

/* PNG terrarium → Float32Array (descodificador PNG mínimo: 8 bits RGB/RGBA, sem entrelaçamento) */
function pngElev(buf) {
  let p = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const tipo = buf.toString('ascii', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (tipo === 'IHDR') {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      ct = d[9];
      if (d[8] !== 8 || d[12] !== 0) throw new Error('PNG não suportado');
    } else if (tipo === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error('PNG: tipo de cor ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const L = w * bpp;
  const px = Buffer.alloc(L * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (L + 1)];
    const lin = raw.subarray(y * (L + 1) + 1, (y + 1) * (L + 1));
    for (let x = 0; x < L; x++) {
      const a = x >= bpp ? px[y * L + x - bpp] : 0;
      const b = y ? px[(y - 1) * L + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * L + x - bpp] : 0;
      let v = lin[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * L + x] = v & 255;
    }
  }
  const e = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) e[i] = px[i * bpp] * 256 + px[i * bpp + 1] + px[i * bpp + 2] / 256 - 32768;
  return e;
}

function amostradorTerr(z, bbox) {
  const [x0, y0] = tileXY(bbox[0], bbox[3], z);
  const [x1, y1] = tileXY(bbox[2], bbox[1], z);
  const m = new Map();
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const b = baixa(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, path.join(CACHE, `t${z}_${x}_${y}.png`));
      m.set(`${x}/${y}`, b ? pngElev(b) : null);
    }
  const n = 256 * 2 ** z;
  const px = (gx, gy) => {
    const tx = Math.floor(gx / 256);
    const ty = Math.floor(gy / 256);
    const t = m.get(`${tx}/${ty}`);
    return t ? t[(gy - ty * 256) * 256 + (gx - tx * 256)] : null;
  };
  return (lon, lat) => {
    const s = Math.sin((lat * Math.PI) / 180);
    const gx = ((lon + 180) / 360) * n - 0.5;
    const gy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n - 0.5;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const a = px(ix, iy);
    const b = px(ix + 1, iy);
    const c = px(ix, iy + 1);
    const d = px(ix + 1, iy + 1);
    if (a === null || b === null || c === null || d === null) return a ?? b ?? c ?? d;
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

/* ---------- OSM (OpenFreeMap) ---------- */
const tj = JSON.parse(baixa('https://tiles.openfreemap.org/planet', path.join(CACHE, 'tilejson.json')).toString());
const URL_VT = tj.tiles[0];
const ZV = 13;

function osm(bbox) {
  const [x0, y0] = tileXY(bbox[0], bbox[3], ZV);
  const [x1, y1] = tileXY(bbox[2], bbox[1], ZV);
  const out = { oceano: [], pinhal: [], urbano: [], areia: [], rocha: [], estradas: [], limites: [], lugares: [], picos: [] };
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const url = URL_VT.replace('{z}', ZV).replace('{x}', x).replace('{y}', y);
      const b = baixa(url, path.join(CACHE, `v${ZV}_${x}_${y}.pbf`));
      if (!b) continue;
      const vt = new VectorTile(new Pbf(b));
      const conv = (f) => {
        const ext = f.extent;
        const g = f.loadGeometry();
        return g.map((anel) => anel.map((p) => tile2ll(x + p.x / ext, y + p.y / ext, ZV)));
      };
      const L = (n) => vt.layers[n];
      const cada = (n, fn) => {
        const l = L(n);
        if (l) for (let i = 0; i < l.length; i++) fn(l.feature(i));
      };
      cada('water', (f) => {
        if (f.properties.class === 'ocean' && f.type === 3) out.oceano.push(conv(f));
      });
      cada('landcover', (f) => {
        if (f.type !== 3) return;
        const c = f.properties.class;
        const s = f.properties.subclass;
        if (c === 'wood' || c === 'forest' || s === 'scrub' || s === 'heath') out.pinhal.push(conv(f));
        else if (c === 'sand' || s === 'beach' || s === 'sand') out.areia.push(conv(f));
        else if (c === 'rock' || s === 'bare_rock' || s === 'scree') out.rocha.push(conv(f));
      });
      cada('landuse', (f) => {
        if (f.type === 3 && ['residential', 'suburb', 'neighbourhood', 'commercial', 'industrial', 'retail'].includes(f.properties.class)) out.urbano.push(conv(f));
      });
      cada('transportation', (f) => {
        if (f.type === 2 && ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(f.properties.class) && f.properties.brunnel !== 'tunnel') out.estradas.push(...conv(f));
      });
      // limites administrativos em terra (concelho e acima: admin_level 4–7; OpenMapTiles `boundary`, sem os marítimos)
      cada('boundary', (f) => {
        const lv = Number(f.properties.admin_level);
        if (f.type === 2 && !f.properties.maritime && lv >= 4 && lv <= 7) out.limites.push(...conv(f));
      });
      cada('place', (f) => {
        const c = f.properties.class;
        if (['town', 'village', 'city', 'suburb', 'hamlet'].includes(c) && f.properties.name) {
          const p = conv(f)[0][0];
          out.lugares.push({ n: f.properties.name, ll: p, c, r: f.properties.rank ?? 99 });
        }
      });
      cada('mountain_peak', (f) => {
        if (f.properties.name && f.properties.ele) out.picos.push({ n: f.properties.name, ll: conv(f)[0][0], ele: Math.round(f.properties.ele) });
      });
    }
  return out;
}

/* oceano OSM em z14 (o zoom máximo do OpenFreeMap, o mesmo da maquete) só na área visível: a costa fina */
function oceanoZ14(bbox) {
  const z = 14;
  const [x0, y0] = tileXY(bbox[0], bbox[3], z);
  const [x1, y1] = tileXY(bbox[2], bbox[1], z);
  const out = [];
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const b = baixa(URL_VT.replace('{z}', z).replace('{x}', x).replace('{y}', y), path.join(CACHE, `v${z}_${x}_${y}.pbf`));
      if (!b) return null; // sem a área completa fica o z13
      const l = new VectorTile(new Pbf(b)).layers.water;
      if (!l) continue;
      for (let i = 0; i < l.length; i++) {
        const f = l.feature(i);
        if (f.properties.class === 'ocean' && f.type === 3) out.push(f.loadGeometry().map((a) => a.map((p) => tile2ll(x + p.x / f.extent, y + p.y / f.extent, z))));
      }
    }
  return out;
}

/* anéis de polígonos de tile: cada feature MVT é uma lista de anéis (exteriores e buracos por sinal) */
const ar = (a) => {
  let s = 0;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) s += (a[j][0] - a[i][0]) * (a[j][1] + a[i][1]);
  return s / 2;
};
function rasterizaOceano(polis, grade) {
  // máscara de oceano por scanline (even-odd por feature) na grelha da geografia
  const { nx, ny, w, n, dlon, dlat } = grade;
  const m = new Uint8Array(nx * ny);
  for (const aneis of polis) {
    for (let j = 0; j < ny; j++) {
      const lat = n - j * dlat;
      const xs = [];
      for (const a of aneis)
        for (let i = 0, k = a.length - 1; i < a.length; k = i++) {
          const [x1, y1] = a[k];
          const [x2, y2] = a[i];
          if (y1 > lat !== y2 > lat) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
        }
      xs.sort((p, q) => p - q);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil((xs[q] - w) / dlon));
        const i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - w) / dlon));
        for (let i = i0; i <= i1; i++) m[j * nx + i] = 1;
      }
    }
  }
  return m;
}

/* camada OSM por rasterização na grelha de 40 m e novo contorno: une os pedaços dos tiles e suaviza (como o buffer/union da maquete) */
function camadaRaster(polis, grade, minCel = 6, so = null) {
  if (!polis.length) return [];
  const m = rasterizaOceano(polis, grade);
  const f = new Float32Array(m.length);
  for (let k = 0; k < m.length; k++) f[k] = so && !so[k] ? 0 : m[k];
  const b = desfoca(f, grade.nx, grade.ny, 1, 1);
  for (let k = 0; k < b.length; k++) b[k] -= 0.5;
  return aneisGrelha(b, grade.nx, grade.ny)
    .filter((a) => Math.abs(areaAnel(a)) >= minCel)
    .map((a) => alisa(a, 0.6, 1))
    .filter((a) => a.length >= 3)
    .map((a) => a.map(([x, y]) => [r5(grade.w + x * grade.dlon), r5(grade.n - y * grade.dlat)]));
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;
/*
 * Terra (linha de costa) directamente do oceano OSM, numa grelha fina de
 * RES_COSTA m: como a maquete (`land = bbox − oceano OSM`, fecho de 3 m,
 * ilhéus < 2e-7 °² fora, simplify 0,00006° ≈ 5 m). Antes a costa saía da
 * grelha de 40 m suavizada (Chaikin) e ficava mais lisa que a da maquete.
 * Na área visível (AREA_OSM) usa o oceano do z14, como a maquete; fora dela
 * o do z13. Grelha de 5 m sem desfocagem (os recortes da rocha ficam) e
 * Douglas–Peucker com a tolerância da maquete (0,00006°), sem Chaikin.
 */
const RES_COSTA = 5;
function terraOSM(polis, grade, polis14, lim) {
  const k = grade.dlon / AREA.res;
  const fina = {
    nx: Math.ceil((grade.nx - 1) * (AREA.res / RES_COSTA)) + 1,
    ny: Math.ceil((grade.ny - 1) * (AREA.res / RES_COSTA)) + 1,
    w: grade.w,
    n: grade.n,
    dlon: k * RES_COSTA,
    dlat: (grade.dlat / AREA.res) * RES_COSTA,
  };
  const oc = rasterizaOceano(polis, fina);
  if (polis14 && polis14.length) {
    // na área visível (AREA_OSM) a costa vem do z14
    const oc14 = rasterizaOceano(polis14, fina);
    for (let j = 0; j < fina.ny; j++) {
      const lat = fina.n - j * fina.dlat;
      if (lat < lim[1] || lat > lim[3]) continue;
      for (let i = 0; i < fina.nx; i++) {
        const lon = fina.w + i * fina.dlon;
        if (lon >= lim[0] && lon <= lim[2]) oc[j * fina.nx + i] = oc14[j * fina.nx + i];
      }
    }
  }
  const b = new Float32Array(oc.length);
  for (let i = 0; i < oc.length; i++) b[i] = oc[i] ? -0.5 : 0.5;
  const minCel = 2e-7 / (fina.dlon * fina.dlat); // ilhéus < 2e-7 °² fora (como a maquete)
  const tolCel = 0.00006 / fina.dlon; // simplify 0,00006° da maquete, em células
  return aneisGrelha(b, fina.nx, fina.ny)
    .filter((a) => Math.abs(areaAnel(a)) >= minCel)
    .map((a) => alisa(a, tolCel, 0))
    .filter((a) => a.length >= 3)
    .map((a) => a.map(([x, y]) => [r5(fina.w + x * fina.dlon), r5(fina.n - y * fina.dlat)]));
}


const arred = (a) => a.map((p) => [r5(p[0]), r5(p[1])]);
function simplPolis(polis, tolGraus, minArea) {
  const out = [];
  for (const aneis of polis)
    for (const a of aneis) {
      if (Math.abs(ar(a)) < minArea) continue;
      const s = alisa(a.slice(0, -1).length > 2 ? a.slice(0, -1) : a, tolGraus, 0);
      if (s.length >= 3) out.push(arred(s));
    }
  return out;
}
function simplLinhas(ls, tol) {
  const dp = (p) => {
    if (p.length < 3) return p;
    const keep = new Uint8Array(p.length);
    keep[0] = keep[p.length - 1] = 1;
    const st = [[0, p.length - 1]];
    while (st.length) {
      const [a, b] = st.pop();
      let mx = -1;
      let mi = -1;
      for (let i = a + 1; i < b; i++) {
        const [ax, ay] = p[a];
        const [bx, by] = p[b];
        const dx = bx - ax;
        const dy = by - ay;
        const L2 = dx * dx + dy * dy || 1e-18;
        const t = Math.max(0, Math.min(1, ((p[i][0] - ax) * dx + (p[i][1] - ay) * dy) / L2));
        const d = (ax + t * dx - p[i][0]) ** 2 + (ay + t * dy - p[i][1]) ** 2;
        if (d > mx) {
          mx = d;
          mi = i;
        }
      }
      if (mx > tol * tol) {
        keep[mi] = 1;
        st.push([a, mi], [mi, b]);
      }
    }
    return p.filter((_, i) => keep[i]);
  };
  return ls.map((l) => arred(dp(l))).filter((l) => l.length >= 2);
}

/* ---------- por spot ---------- */
const AREA = { meiaLon: 0.12, meiaLat: 0.09, res: 40 };
const AREA_OSM = { meiaLon: 0.075, meiaLat: 0.06 };
for (const id of ids) {
  const ll = coordsDe(id);
  const bbox = [ll[0] - AREA.meiaLon, ll[1] - AREA.meiaLat, ll[0] + AREA.meiaLon, ll[1] + AREA.meiaLat];
  const fino = amostradorTerr(12, bbox);
  const largo = amostradorTerr(10, bbox);
  const o = osm(bbox);
  // grelha igual à de construirGeo, para a máscara de oceano OSM
  const mx = 111320 * Math.cos((ll[1] * Math.PI) / 180);
  const dlon = AREA.res / mx;
  const dlat = AREA.res / 110540;
  const grade = {
    nx: Math.ceil((2 * AREA.meiaLon) / dlon) + 1,
    ny: Math.ceil((2 * AREA.meiaLat) / dlat) + 1,
    w: ll[0] - AREA.meiaLon,
    n: ll[1] + AREA.meiaLat,
    dlon,
    dlat,
  };
  const oceano = o.oceano.length ? rasterizaOceano(o.oceano, grade) : null;
  // relevo com a costa do OSM: no oceano 0 m; em terra pelo menos 0,5 m
  const elevOSM = (lon, lat) => {
    const e = fino(lon, lat) ?? 0;
    if (!oceano) return e;
    const i = Math.round((lon - grade.w) / dlon);
    const j = Math.round((grade.n - lat) / dlat);
    if (i < 0 || j < 0 || i >= grade.nx || j >= grade.ny) return e;
    return oceano[j * grade.nx + i] ? Math.min(e, 0) : Math.max(e, 0.5);
  };
  const terraM = oceano ? oceano.map((v) => 1 - v) : null;
  const g = construirGeo(ll, { ...AREA, tol: 0.6, iter: 1 }, elevOSM, largo);
  const lim = [ll[0] - AREA_OSM.meiaLon, ll[1] - AREA_OSM.meiaLat, ll[0] + AREA_OSM.meiaLon, ll[1] + AREA_OSM.meiaLat];
  const dentro = (p) => p[0] >= lim[0] && p[0] <= lim[2] && p[1] >= lim[1] && p[1] <= lim[3];
  const corta = (polis) => polis.filter((aneis) => aneis.some((a) => a.some(dentro)));
  const tol = 0.00004;
  // ondas: grelha grossa codificada (Uint8 profundidade em m, 255 = terra; Uint8 distância em 20 m)
  const on = g.ondas;
  const p8 = new Uint8Array(on.nx * on.ny);
  const d8 = new Uint8Array(on.nx * on.ny);
  for (let k = 0; k < p8.length; k++) {
    p8[k] = Number.isNaN(on.prof[k]) ? 255 : Math.min(254, Math.round(on.prof[k]));
    d8[k] = Math.min(255, Math.round(on.dist[k] / 20));
  }
  const lugares = o.lugares
    .filter((l) => dentro(l.ll))
    .sort((a, b) => a.r - b.r)
    .filter((l, i, arr) => arr.findIndex((q) => q.n === l.n) === i)
    .slice(0, 8)
    .map((l) => ({ n: l.n, ll: arred([l.ll])[0] }));
  const picos = o.picos
    .filter((p) => dentro(p.ll))
    .sort((a, b) => b.ele - a.ele)
    .slice(0, 2)
    .map((p) => ({ n: p.n, ll: arred([p.ll])[0], ele: p.ele }));
  const saida = {
    v: 1,
    id,
    fonte: '© OpenStreetMap contributors (ODbL), OpenFreeMap; AWS Terrain Tiles',
    bbox: g.bbox.map(r5),
    faixas: g.faixas.map((f) => f.map(arred)),
    terra: oceano ? terraOSM(o.oceano, grade, oceanoZ14(lim), lim) : g.terra.map(arred),
    relevo: g.relevo.map((f) => f.map(arred)),
    areia: o.areia.length ? camadaRaster(corta(o.areia), grade, 2, terraM) : g.areia.map(arred),
    pinhal: camadaRaster(corta(o.pinhal), grade, 8, terraM),
    urbano: camadaRaster(corta(o.urbano), grade, 8, terraM),
    rocha: camadaRaster(corta(o.rocha), grade, 4, terraM),
    estradas: simplLinhas(o.estradas.filter((l) => l.some(dentro)), tol * 2.5),
    limites: simplLinhas(o.limites.filter((l) => l.some(dentro)), tol),
    lugares,
    picos,
    ondas: {
      nx: on.nx,
      ny: on.ny,
      w: r5(on.w),
      n: r5(on.n),
      dlon: on.dlon,
      dlat: on.dlat,
      res: on.res,
      prof: Buffer.from(p8.buffer).toString('base64'),
      dist: Buffer.from(d8.buffer).toString('base64'),
    },
  };
  const txt = JSON.stringify(saida);
  fs.writeFileSync(path.join(OUT, `${id}.json`), txt);
  console.log(
    `${id}: ${(txt.length / 1024).toFixed(0)} KB (gzip ${(zlib.gzipSync(txt).length / 1024).toFixed(0)} KB) · oceano OSM ${oceano ? 'sim' : 'não'} · pinhal ${saida.pinhal.length} · urbano ${saida.urbano.length} · estradas ${saida.estradas.length} · limites ${saida.limites.length} · costa ${saida.terra.reduce((n, a) => n + a.length, 0)} pts · lugares ${lugares.map((l) => l.n).join(', ')}`,
  );
}
fs.rmSync(tmp, { recursive: true, force: true });
