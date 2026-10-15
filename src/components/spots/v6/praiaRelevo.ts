/**
 * Relevo da praia no browser (#184): carrega tiles AWS Terrain Tiles
 * (terrarium) e devolve amostradores bilineares e a geografia vectorial da
 * cena (`construirGeo`), partilhada pelo mapa 3D e pela vista plana. Os tiles
 * e a geografia ficam em cache por spot (o mapa e a vista plana não os pedem
 * duas vezes; o browser reutiliza os PNG que o MapLibre já pediu).
 */
import { construirGeo, geoDeEstatico, type Amostrador, type GeoEstatico, type GeoPraia } from '@/lib/praiaGeo';

export const URL_TERRARIUM = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const TILE = 256;

/** Área da geografia à volta do spot (cobre a vista plana e a câmara 3D). */
export const AREA_GEO = { meiaLon: 0.12, meiaLat: 0.09, res: 40 } as const;

const tiles = new Map<string, Promise<Float32Array | null>>();
const geos = new Map<string, Promise<GeoPraia | null>>();

async function decode(blob: Blob): Promise<ImageData | null> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  }
  return null;
}

function tile(z: number, x: number, y: number): Promise<Float32Array | null> {
  const k = `${z}/${x}/${y}`;
  let p = tiles.get(k);
  if (!p) {
    p = fetch(URL_TERRARIUM(z, x, y))
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? decode(b) : null))
      .then((im) => {
        if (!im || im.width !== TILE) return null;
        const e = new Float32Array(TILE * TILE);
        const d = im.data;
        for (let i = 0, o = 0; i < e.length; i++, o += 4) e[i] = d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768;
        return e;
      })
      .catch(() => null);
    tiles.set(k, p);
    // não guardar falhas (offline): permite tentar de novo noutra visita
    void p.then((v) => {
      if (!v) tiles.delete(k);
    });
  }
  return p;
}

const mercX = (lon: number, n: number) => ((lon + 180) / 360) * n;
const mercY = (lat: number, n: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
};

/** Amostrador bilinear do terrarium no zoom `z` para a área [W, S, E, N]; null se nenhum tile chegou. */
export async function amostrador(z: number, bbox: [number, number, number, number]): Promise<Amostrador | null> {
  const n = TILE * 2 ** z;
  const x0 = Math.floor(mercX(bbox[0], n) / TILE);
  const x1 = Math.floor(mercX(bbox[2], n) / TILE);
  const y0 = Math.floor(mercY(bbox[3], n) / TILE);
  const y1 = Math.floor(mercY(bbox[1], n) / TILE);
  const mapa = new Map<string, Float32Array | null>();
  await Promise.all(
    Array.from({ length: (x1 - x0 + 1) * (y1 - y0 + 1) }, (_, k) => {
      const tx = x0 + (k % (x1 - x0 + 1));
      const ty = y0 + Math.floor(k / (x1 - x0 + 1));
      return tile(z, tx, ty).then((d) => mapa.set(`${tx}/${ty}`, d));
    }),
  );
  if ([...mapa.values()].every((t) => !t)) return null;
  const px = (gx: number, gy: number): number | null => {
    const tx = Math.floor(gx / TILE);
    const ty = Math.floor(gy / TILE);
    const t = mapa.get(`${tx}/${ty}`);
    if (!t) return null;
    return t[(gy - ty * TILE) * TILE + (gx - tx * TILE)];
  };
  return (lon, lat) => {
    const gx = mercX(lon, n) - 0.5;
    const gy = mercY(lat, n) - 0.5;
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

/**
 * Geografia vectorial da praia (costa, faixas de profundidade, areia, cotas),
 * em cache por spot. Spots curados (`idEstatico`): lê primeiro o ficheiro
 * pré-gerado da mesma origem (`/geo/praia/<id>.json`, com a costa e as
 * camadas básicas do OpenStreetMap); se faltar, calcula a partir do relevo.
 */
export function geoDaPraia(ll: [number, number], idEstatico?: string): Promise<GeoPraia | null> {
  const k = ll.join(',');
  let p = geos.get(k);
  if (!p && idEstatico) {
    p = fetch(`/geo/praia/${encodeURIComponent(idEstatico)}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<GeoEstatico>) : null))
      .then((j) => (j ? geoDeEstatico(j) : null))
      .catch(() => null)
      .then((g) => g ?? geoDoRelevo(ll));
    geos.set(k, p);
    return p;
  }
  if (!p) p = geoDoRelevo(ll);
  return p;
}

function geoDoRelevo(ll: [number, number]): Promise<GeoPraia | null> {
  const k = ll.join(',');
  let p = geos.get(k + ':dem');
  if (!p) {
    const bbox: [number, number, number, number] = [
      ll[0] - AREA_GEO.meiaLon,
      ll[1] - AREA_GEO.meiaLat,
      ll[0] + AREA_GEO.meiaLon,
      ll[1] + AREA_GEO.meiaLat,
    ];
    p = Promise.all([amostrador(12, bbox), amostrador(10, bbox)])
      .then(([fino, largo]) => (fino ? construirGeo(ll, AREA_GEO, fino, largo) : null))
      .catch(() => null);
    geos.set(k + ':dem', p);
    geos.set(k, p);
    void p.then((g) => {
      if (!g) {
        geos.delete(k + ':dem');
        geos.delete(k);
      }
    });
  }
  return p;
}
