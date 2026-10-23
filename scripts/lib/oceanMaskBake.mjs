// Helpers puros do bake da máscara do oceano (scripts/bake-ocean-mask.mjs).
// Sem rede, sem ficheiros — testados em scripts/lib/__tests__/oceanMaskBake.test.js.
//
// Convenções
//   - Coordenadas de trabalho: píxeis-mundo Web Mercator inteiros ao zoom WZ
//     (EPSG:3857, 256·2^WZ — a convenção do Leaflet). WZ = 17 → ~0,92 m por
//     unidade à latitude de Portugal (39,5°N).
//   - Anéis/linhas de saída: inteiros [x0, y0, dx1, dy1, …] (deltas a partir do
//     2.º vértice) — o mesmo formato de public/geo/land-clip/ (src/lib/landClip.ts).

export const WZ = 17;

/** Píxel-mundo (fraccionário) ao zoom z. */
export function lonToWorld(lon, z) {
  return ((lon + 180) / 360) * 256 * 2 ** z;
}
export function latToWorld(lat, z) {
  const la = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return (0.5 - Math.log(Math.tan(Math.PI / 4 + la / 2)) / (2 * Math.PI)) * 256 * 2 ** z;
}
export function worldToLon(x, z) {
  return (x / (256 * 2 ** z)) * 360 - 180;
}
export function worldToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / (256 * 2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Metros por unidade de píxel-mundo ao zoom z, à latitude lat. */
export function metersPerUnit(z, lat) {
  return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

/** Caixa lon/lat → caixa em píxeis-mundo inteiros ao zoom z (y cresce para sul). */
export function bboxToWorld([west, south, east, north], z) {
  return {
    minX: Math.round(lonToWorld(west, z)),
    maxX: Math.round(lonToWorld(east, z)),
    minY: Math.round(latToWorld(north, z)),
    maxY: Math.round(latToWorld(south, z)),
  };
}

// ── Descodificador MVT mínimo (só o necessário para a camada de polígonos) ──

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    b = buf[pos.i++];
    result += (b & 0x7f) * 2 ** shift;
    shift += 7;
  } while (b & 0x80);
  return result;
}

function skip(buf, pos, wire) {
  if (wire === 0) readVarint(buf, pos);
  else if (wire === 1) pos.i += 8;
  else if (wire === 2) {
    const n = readVarint(buf, pos);
    pos.i += n;
  }
  else if (wire === 5) pos.i += 4;
  else throw new Error(`mvt: wire type ${wire} não suportado`);
}

function readString(buf, pos) {
  const len = readVarint(buf, pos);
  const s = new TextDecoder().decode(buf.subarray(pos.i, pos.i + len));
  pos.i += len;
  return s;
}

function readPacked(buf, pos) {
  const len = readVarint(buf, pos);
  const end = pos.i + len;
  const out = [];
  while (pos.i < end) out.push(readVarint(buf, pos));
  return out;
}

function readValue(buf, pos) {
  const len = readVarint(buf, pos);
  const end = pos.i + len;
  let v = null;
  while (pos.i < end) {
    const tag = readVarint(buf, pos);
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (field === 1) v = readString(buf, pos);
    else if (field === 2) {
      v = new DataView(buf.buffer, buf.byteOffset + pos.i, 4).getFloat32(0, true);
      pos.i += 4;
    } else if (field === 3) {
      v = new DataView(buf.buffer, buf.byteOffset + pos.i, 8).getFloat64(0, true);
      pos.i += 8;
    } else if (field === 4 || field === 5) v = readVarint(buf, pos);
    else if (field === 6) {
      const n = readVarint(buf, pos);
      v = n % 2 ? -(n + 1) / 2 : n / 2;
    } else if (field === 7) v = readVarint(buf, pos) === 1;
    else skip(buf, pos, wire);
  }
  return v;
}

const zz = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);

/** Comandos de geometria MVT → anéis [[x, y], …] (tile coords, y para baixo). */
export function decodeGeometry(cmds) {
  const rings = [];
  let ring = null;
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < cmds.length) {
    const c = cmds[i++];
    const id = c & 7;
    const count = c >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < count; k++) {
        x += zz(cmds[i++]);
        y += zz(cmds[i++]);
        if (id === 1) {
          if (ring && ring.length) rings.push(ring);
          ring = [];
        }
        ring.push([x, y]);
      }
    } else if (id === 7) {
      if (ring && ring.length) rings.push(ring);
      ring = null;
    }
  }
  if (ring && ring.length) rings.push(ring);
  return rings;
}

/**
 * Descodifica uma camada de um tile MVT (Uint8Array, não comprimido).
 * Devolve { extent, features: [{ type, props, rings }] } ou null sem a camada.
 */
export function decodeMvtLayer(buf, layerName) {
  const pos = { i: 0 };
  while (pos.i < buf.length) {
    const tag = readVarint(buf, pos);
    if (Math.floor(tag / 8) !== 3 || (tag & 7) !== 2) {
      skip(buf, pos, tag & 7);
      continue;
    }
    const llen = readVarint(buf, pos);
    const end = pos.i + llen;
    const start = pos.i;
    // 1.ª passagem: nome; só a camada pedida é descodificada a fundo.
    let name = null;
    while (pos.i < end) {
      const t = readVarint(buf, pos);
      if (Math.floor(t / 8) === 1) name = readString(buf, pos);
      else skip(buf, pos, t & 7);
    }
    if (name !== layerName) continue;
    pos.i = start;
    const keys = [];
    const values = [];
    const rawFeatures = [];
    let extent = 4096;
    while (pos.i < end) {
      const t = readVarint(buf, pos);
      const field = Math.floor(t / 8);
      if (field === 2) {
        const flen = readVarint(buf, pos);
        const fend = pos.i + flen;
        const f = { tags: [], type: 0, geom: [] };
        while (pos.i < fend) {
          const ft = readVarint(buf, pos);
          const ff = Math.floor(ft / 8);
          if (ff === 2) f.tags = readPacked(buf, pos);
          else if (ff === 3) f.type = readVarint(buf, pos);
          else if (ff === 4) f.geom = readPacked(buf, pos);
          else skip(buf, pos, ft & 7);
        }
        rawFeatures.push(f);
      } else if (field === 3) keys.push(readString(buf, pos));
      else if (field === 4) values.push(readValue(buf, pos));
      else if (field === 5) extent = readVarint(buf, pos);
      else skip(buf, pos, t & 7);
    }
    const features = rawFeatures.map((f) => {
      const props = {};
      for (let k = 0; k + 1 < f.tags.length; k += 2) props[keys[f.tags[k]]] = values[f.tags[k + 1]];
      return { type: f.type, props, rings: decodeGeometry(f.geom) };
    });
    return { extent, features };
  }
  return null;
}

// ── Geometria simples ──

/** Área com sinal (fórmula do laço) de um anel [[x,y],…] ou [{X,Y},…]. */
export function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[i];
    const q = ring[j];
    const px = p.X ?? p[0];
    const py = p.Y ?? p[1];
    const qx = q.X ?? q[0];
    const qy = q.Y ?? q[1];
    a += (qx + px) * (qy - py);
  }
  return a / 2;
}

function segDist2(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return x * x + y * y;
}

/** Douglas–Peucker iterativo sobre uma polilinha aberta [[x,y],…]. */
export function simplifyLine(pts, tol) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const tol2 = tol * tol;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[i], pts[a], pts[b]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Douglas–Peucker sobre um anel fechado (sem repetir o 1.º ponto no fim). */
export function simplifyRing(ring, tol) {
  if (ring.length <= 4) return ring.slice();
  // âncora no ponto mais afastado do 1.º — evita colapsar o anel inteiro
  let far = 0;
  let fd = -1;
  for (let i = 1; i < ring.length; i++) {
    const dx = ring[i][0] - ring[0][0];
    const dy = ring[i][1] - ring[0][1];
    const d = dx * dx + dy * dy;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = simplifyLine(ring.slice(0, far + 1), tol);
  const b = simplifyLine([...ring.slice(far), ring[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

/**
 * Chaikin (corte de cantos) — `iter` passagens. Linhas abertas mantêm as
 * pontas; `closed` trata a polilinha como anel.
 */
export function chaikin(pts, iter = 2, closed = false) {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    if (p.length < 3) return p;
    const out = [];
    const n = p.length;
    if (!closed) out.push(p[0]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

/** Comprimento de uma polilinha. */
export function lineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/**
 * Parte um anel em polilinhas, descartando os segmentos que estão em cima de
 * uma aresta da moldura `box` (os dois vértices na mesma aresta) — a moldura é
 * um corte artificial do processamento, não costa. Um anel sem segmentos na
 * moldura sai como polilinha fechada (1.º ponto repetido no fim).
 */
export function ringToShoreLines(ring, box) {
  const n = ring.length;
  if (n < 2) return [];
  const onEdge = (a, b) =>
    (a[0] === box.minX && b[0] === box.minX) ||
    (a[0] === box.maxX && b[0] === box.maxX) ||
    (a[1] === box.minY && b[1] === box.minY) ||
    (a[1] === box.maxY && b[1] === box.maxY);
  const bad = [];
  for (let i = 0; i < n; i++) bad.push(onEdge(ring[i], ring[(i + 1) % n]));
  const firstBad = bad.indexOf(true);
  if (firstBad < 0) return [[...ring, ring[0]]];
  const lines = [];
  let cur = null;
  for (let k = 1; k <= n; k++) {
    const i = (firstBad + k) % n; // segmento i: ring[i] → ring[i+1]
    if (bad[i]) {
      if (cur && cur.length > 1) lines.push(cur);
      cur = null;
    } else {
      if (!cur) cur = [ring[i]];
      cur.push(ring[(i + 1) % n]);
    }
  }
  if (cur && cur.length > 1) lines.push(cur);
  return lines;
}

/** Sutherland–Hodgman de um anel contra uma caixa (regra even-odd preservada dentro da caixa). */
export function clipRingToBox(ring, box) {
  const edges = [
    (p) => p[0] >= box.minX,
    (p) => p[0] <= box.maxX,
    (p) => p[1] >= box.minY,
    (p) => p[1] <= box.maxY,
  ];
  const cut = [
    (a, b) => [box.minX, a[1] + ((b[1] - a[1]) * (box.minX - a[0])) / (b[0] - a[0])],
    (a, b) => [box.maxX, a[1] + ((b[1] - a[1]) * (box.maxX - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (box.minY - a[1])) / (b[1] - a[1]), box.minY],
    (a, b) => [a[0] + ((b[0] - a[0]) * (box.maxY - a[1])) / (b[1] - a[1]), box.maxY],
  ];
  let out = ring;
  for (let e = 0; e < 4 && out.length; e++) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const ci = edges[e](cur);
      const pi = edges[e](prev);
      if (ci) {
        if (!pi) out.push(cut[e](prev, cur));
        out.push(cur);
      } else if (pi) out.push(cut[e](prev, cur));
    }
  }
  return out.length >= 3 ? out : [];
}

/** Recorte de uma polilinha a uma caixa (Liang–Barsky por segmento, troços contíguos fundidos). */
export function clipLineToBox(pts, box) {
  const out = [];
  let cur = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    let t0 = 0;
    let t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [a[0] - box.minX, box.maxX - a[0], a[1] - box.minY, box.maxY - a[1]];
    let ok = true;
    for (let k = 0; k < 4; k++) {
      if (p[k] === 0) {
        if (q[k] < 0) ok = false;
      } else {
        const r = q[k] / p[k];
        if (p[k] < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    if (!ok || t0 > t1) {
      if (cur && cur.length > 1) out.push(cur);
      cur = null;
      continue;
    }
    const s = [a[0] + t0 * dx, a[1] + t0 * dy];
    const e = [a[0] + t1 * dx, a[1] + t1 * dy];
    if (!cur || t0 > 0) {
      if (cur && cur.length > 1) out.push(cur);
      cur = [s];
    }
    cur.push(e);
    if (t1 < 1) {
      if (cur.length > 1) out.push(cur);
      cur = null;
    }
  }
  if (cur && cur.length > 1) out.push(cur);
  return out;
}

/**
 * Quantiza (divide por `div` e arredonda), remove vértices repetidos e codifica
 * em deltas [x0, y0, dx1, dy1, …]. `minPts` = vértices mínimos depois da
 * limpeza (3 para anéis, 2 para linhas); devolve null abaixo disso.
 */
export function encodePath(pts, div, minPts) {
  const q = [];
  for (const p of pts) {
    const x = Math.round(p[0] / div);
    const y = Math.round(p[1] / div);
    const l = q[q.length - 1];
    if (!l || l[0] !== x || l[1] !== y) q.push([x, y]);
  }
  if (minPts >= 3 && q.length > 1) {
    const f = q[0];
    const l = q[q.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) q.pop();
  }
  if (q.length < minPts) return null;
  const out = [q[0][0], q[0][1]];
  for (let i = 1; i < q.length; i++) out.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
  return out;
}

/** Inverso de encodePath (testes / validação). */
export function decodePath(enc) {
  const out = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < enc.length; i += 2) {
    x = i === 0 ? enc[0] : x + enc[i];
    y = i === 0 ? enc[1] : y + enc[i + 1];
    out.push([x, y]);
  }
  return out;
}

/**
 * Regiões de detalhe (z ≥ REGION_MIN_ZOOM) — faixas de latitude da costa
 * continental, todas de oeste a leste da moldura. Ordem = norte → sul.
 */
export const OCEAN_MASK_FRAME = [-12.5, 35.5, -5.0, 44.0];
export const OCEAN_MASK_REGIONS = [
  { id: 'norte', bbox: [-12.5, 41.35, -5.0, 44.0] },
  { id: 'aveiro', bbox: [-12.5, 40.25, -5.0, 41.35] },
  { id: 'centro', bbox: [-12.5, 39.05, -5.0, 40.25] },
  { id: 'lisboa', bbox: [-12.5, 38.2, -5.0, 39.05] },
  { id: 'alentejo', bbox: [-12.5, 37.25, -5.0, 38.2] },
  { id: 'algarve', bbox: [-12.5, 35.5, -5.0, 37.25] },
];
