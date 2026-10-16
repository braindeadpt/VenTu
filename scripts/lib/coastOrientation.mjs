/**
 * Orientação da costa (#178): a direcção para onde a praia está virada, isto
 * é, o rumo da normal da linha de costa que aponta para o MAR (0 = N, 90 = E,
 * 180 = S, 270 = W). É o `coastOrientation` de `src/lib/spots.ts` e o
 * `praiaVirada` dos spots v6 não curados.
 *
 * Fonte: OpenStreetMap `natural=coastline` (© OpenStreetMap contributors,
 * ODbL). Convenção OSM: as linhas de costa estão orientadas com a TERRA à
 * esquerda e a ÁGUA à direita, por isso a normal para o mar de um segmento
 * com rumo `b` é `b + 90°`.
 *
 * Método (puro, sem rede; testado em `src/lib/__tests__/coastOrientation.test.ts`):
 *  1. projecção local equirectangular em metros à volta do spot;
 *  2. ponto P da costa mais próximo do spot (distância `distM`);
 *  3. a cadeia de costa que passa em P é reconstituída ligando as vias OSM pelas
 *     pontas (fim de uma = início da seguinte), nos dois sentidos;
 *  4. suavização de ~500 m: a direcção da costa é a CORDA entre os pontos da
 *     cadeia a 250 m antes e 250 m depois de P (ao longo da costa); a normal
 *     para o mar é essa direcção + 90°. Uma corda ignora rochas, esporões e
 *     pequenos recortes, que viram a normal do segmento mais próximo;
 *  5. controlo: a mesma corda a ±500 m (1 km) e a «dobra» (ângulo entre a
 *     meia-corda de −250 m a P e a de P a +250 m). `ambigua` quando a costa
 *     dobra mais de `dobraMax` (45°: ponta ou enseada), quando as duas escalas
 *     discordam mais de `difEscalasMax` (25°) ou quando a cadeia acaba antes de
 *     ±250 m. (A razão corda/arco, `retidao`, só se reporta: numa costa de
 *     arriba com rochas o arco OSM é muito recortado e a razão cai sem a
 *     orientação ser duvidosa.)
 *  6. outra costa a < 500 m de P que não é a mesma cadeia nessa janela (outra
 *     margem de um rio, ilhéu, molhe) marca `outraMargem` (informativo).
 * O resultado arredonda a 5°.
 */

const RAD = Math.PI / 180;

export const n360 = (x) => ((x % 360) + 360) % 360;

/** Diferença angular mínima, em graus [0, 180]. */
export function difAng(a, b) {
  const d = Math.abs(n360(a) - n360(b));
  return d > 180 ? 360 - d : d;
}

export const arredonda5 = (x) => n360(Math.round(x / 5) * 5);

function projector(lat0, lon0) {
  const kx = Math.cos(lat0 * RAD) * 111320;
  const ky = 110574;
  return ([lat, lon]) => [(lon - lon0) * kx, (lat - lat0) * ky];
}

function pontoMaisProximo(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { q, d: Math.hypot(p[0] - q[0], p[1] - q[1]) };
}

/** Rumo (0 = N, sentido horário) do vector (dx = este, dy = norte). */
const rumo = (dx, dy) => n360(Math.atan2(dx, dy) / RAD);

const chave = ([lat, lon]) => `${lat.toFixed(7)},${lon.toFixed(7)}`;

/** Ponto a uma distância `s` (m) ao longo da polilinha (null fora dela). */
function pontoEm(pl, cum, s) {
  if (s < 0 || s > cum[cum.length - 1]) return null;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const seg = cum[i] - cum[i - 1];
  const t = seg > 0 ? (s - cum[i - 1]) / seg : 0;
  return [pl[i - 1][0] + t * (pl[i][0] - pl[i - 1][0]), pl[i - 1][1] + t * (pl[i][1] - pl[i - 1][1])];
}

/**
 * @param {{lat:number, lon:number}} spot
 * @param {Array<{id?: number|string, coords: Array<[number, number]>}>} vias
 *        linhas de costa OSM (coords = [lat, lon], na ordem da via)
 * @param {{meiaJanelaM?: number, dobraMax?: number, difEscalasMax?: number}} [opts]
 */
export function orientacaoCosta(spot, vias, opts = {}) {
  const meia = opts.meiaJanelaM ?? 250;
  const dobraMax = opts.dobraMax ?? 45;
  const difEscalasMax = opts.difEscalasMax ?? 25;
  const proj = projector(spot.lat, spot.lon);
  const S = [0, 0];

  const ways = (vias || []).filter((v) => v && v.coords && v.coords.length >= 2);
  if (!ways.length) return { ok: false, motivo: 'semCosta' };
  const xy = ways.map((v) => v.coords.map(proj));

  // 2. ponto mais próximo
  let best = { d: Infinity, w: -1, i: -1, q: null };
  xy.forEach((pts, w) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const r = pontoMaisProximo(S, pts[i], pts[i + 1]);
      if (r.d < best.d) best = { d: r.d, w, i, q: r.q };
    }
  });
  const P = best.q;

  // 3. cadeia: liga vias pelas pontas (fim → início), nos dois sentidos
  const porInicio = new Map();
  const porFim = new Map();
  ways.forEach((v, w) => {
    porInicio.set(chave(v.coords[0]), w);
    porFim.set(chave(v.coords[v.coords.length - 1]), w);
  });
  const usadas = new Set([best.w]);
  let pl = xy[best.w].slice();
  let offset = 0; // índice do início da via mais próxima dentro de pl
  for (let w = best.w; ; ) {
    const n = porInicio.get(chave(ways[w].coords[ways[w].coords.length - 1]));
    if (n === undefined || usadas.has(n)) break;
    usadas.add(n);
    pl = pl.concat(xy[n].slice(1));
    w = n;
  }
  for (let w = best.w; ; ) {
    const n = porFim.get(chave(ways[w].coords[0]));
    if (n === undefined || usadas.has(n)) break;
    usadas.add(n);
    pl = xy[n].slice(0, -1).concat(pl);
    offset += xy[n].length - 1;
    w = n;
  }
  const cum = [0];
  for (let i = 1; i < pl.length; i++) cum.push(cum[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
  const iP = offset + best.i;
  const sP = cum[iP] + Math.hypot(P[0] - pl[iP][0], P[1] - pl[iP][1]);

  const corda = (h) => {
    const a = pontoEm(pl, cum, sP - h);
    const b = pontoEm(pl, cum, sP + h);
    if (!a || !b) return null;
    const c = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (c === 0) return null;
    return { normal: n360(rumo(b[0] - a[0], b[1] - a[1]) + 90), retidao: c / (2 * h) };
  };
  /** corda entre dois pontos da cadeia (offsets ao longo da costa em relação a P) */
  const cordaEntre = (h0, h1) => {
    const a = pontoEm(pl, cum, sP + h0);
    const b = pontoEm(pl, cum, sP + h1);
    if (!a || !b || (a[0] === b[0] && a[1] === b[1])) return null;
    return n360(rumo(b[0] - a[0], b[1] - a[1]) + 90);
  };
  const c1 = corda(meia);
  const c2 = corda(2 * meia);
  const pa = pl[iP];
  const pb = pl[iP + 1];
  const local = n360(rumo(pb[0] - pa[0], pb[1] - pa[1]) + 90);

  // 6. outra costa perto de P fora da janela da cadeia
  let outraMargemM = Infinity;
  const fora = (w, i) => {
    if (!usadas.has(w)) return true;
    return false;
  };
  xy.forEach((pts, w) => {
    for (let i = 0; i < pts.length - 1; i++) {
      if (!fora(w, i)) continue;
      const r = pontoMaisProximo(P, pts[i], pts[i + 1]);
      if (r.d < outraMargemM) outraMargemM = r.d;
    }
  });
  // na própria cadeia: troços a < 500 m de P mas a mais de 1,5 km ao longo da costa (a outra margem de uma foz)
  for (let i = 0; i < pl.length - 1; i++) {
    if (Math.abs(cum[i] - sP) < 1500 && Math.abs(cum[i + 1] - sP) < 1500) continue;
    const r = pontoMaisProximo(P, pl[i], pl[i + 1]);
    if (r.d < outraMargemM) outraMargemM = r.d;
  }

  if (!c1) {
    return { ok: true, graus: local, arredondado: arredonda5(local), local: Math.round(local), retidao: null, escala1km: null, distM: Math.round(best.d), outraMargemM: Number.isFinite(outraMargemM) ? Math.round(outraMargemM) : null, ambigua: true, cadeiaCurta: true, outraMargem: outraMargemM < 500 };
  }
  const difEscalas = c2 ? difAng(c1.normal, c2.normal) : null;
  // dobra: ângulo entre a meia-corda antes de P e a meia-corda depois (ponta ou enseada)
  const ant = cordaEntre(-meia, 0);
  const dep = cordaEntre(0, meia);
  const dobra = ant !== null && dep !== null ? difAng(ant, dep) : null;
  const ambigua = (dobra !== null && dobra > dobraMax) || (difEscalas !== null && difEscalas > difEscalasMax);
  return {
    ok: true,
    graus: Math.round(c1.normal * 10) / 10,
    arredondado: arredonda5(c1.normal),
    local: Math.round(local),
    retidao: Math.round(c1.retidao * 1000) / 1000,
    dobra: dobra === null ? null : Math.round(dobra),
    escala1km: c2 ? Math.round(c2.normal) : null,
    escala1kmArredondado: c2 ? arredonda5(c2.normal) : null,
    retidao1km: c2 ? Math.round(c2.retidao * 1000) / 1000 : null,
    difEscalas: difEscalas === null ? null : Math.round(difEscalas),
    distM: Math.round(best.d),
    outraMargemM: Number.isFinite(outraMargemM) ? Math.round(outraMargemM) : null,
    ambigua,
    cadeiaCurta: !c2,
    outraMargem: Number.isFinite(outraMargemM) && outraMargemM < 500,
  };
}

/** Converte a resposta Overpass (`out geom`) em vias `{id, coords}`. */
export function viasDeOverpass(json) {
  return ((json && json.elements) || [])
    .filter((e) => e.type === 'way' && Array.isArray(e.geometry))
    .map((e) => ({ id: e.id, coords: e.geometry.map((g) => [g.lat, g.lon]) }));
}
