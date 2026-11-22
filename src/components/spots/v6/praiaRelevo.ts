/**
 * Relevo da praia no browser (#184): carrega tiles AWS Terrain Tiles
 * (terrarium) e devolve amostradores bilineares e a geografia vectorial da
 * cena (`construirGeo`), partilhada pelo mapa 3D e pela vista plana. Os tiles
 * e a geografia ficam em cache por spot (o mapa e a vista plana não os pedem
 * duas vezes; o browser reutiliza os PNG que o MapLibre já pediu).
 */
import { getAssetPath } from '@/lib/paths';
import {
  amostradorDeGrade,
  construirGeo,
  geoDeEstatico,
  type Amostrador,
  type GeoEstatico,
  type GeoPraia,
  type GradeTiles,
  type OpcoesGeo,
} from '@/lib/praiaGeo';

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

/** Grade serializável de tiles Terrarium no zoom `z` para a área [W, S, E, N]; null se nenhum tile chegou. */
async function gradeTiles(z: number, bbox: [number, number, number, number]): Promise<GradeTiles | null> {
  const n = TILE * 2 ** z;
  const x0 = Math.floor(mercX(bbox[0], n) / TILE);
  const x1 = Math.floor(mercX(bbox[2], n) / TILE);
  const y0 = Math.floor(mercY(bbox[3], n) / TILE);
  const y1 = Math.floor(mercY(bbox[1], n) / TILE);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const arr: Array<Float32Array | null> = new Array(w * h).fill(null);
  await Promise.all(
    Array.from({ length: w * h }, (_, k) => {
      const tx = x0 + (k % w);
      const ty = y0 + Math.floor(k / w);
      return tile(z, tx, ty).then((d) => {
        arr[k] = d;
      });
    }),
  );
  if (arr.every((t) => !t)) return null;
  return { z, x0, y0, w, h, tiles: arr };
}

/** Amostrador bilinear do terrarium no zoom `z` para a área [W, S, E, N]; null se nenhum tile chegou. */
export async function amostrador(z: number, bbox: [number, number, number, number]): Promise<Amostrador | null> {
  const g = await gradeTiles(z, bbox);
  return g ? amostradorDeGrade(g) : null;
}

/* ---------- Web Worker opcional para construirGeo fora da main thread ---------- */
let geoWorker: Worker | null = null;
let geoWorkerFalhou = false;
let nextReqId = 1;
const pendentes = new Map<number, { ok: (g: GeoPraia) => void; err: () => void }>();

function obterWorker(): Worker | null {
  if (geoWorkerFalhou || typeof Worker === 'undefined') return null;
  if (!geoWorker) {
    try {
      geoWorker = new Worker(new URL('./praiaGeo.worker.ts', import.meta.url), { type: 'module' });
      geoWorker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; geo?: Omit<GeoPraia, 'ondas'> & { ondas: Omit<GeoPraia['ondas'], 'campos'> } }>) => {
        const p = pendentes.get(ev.data.id);
        if (!p) return;
        pendentes.delete(ev.data.id);
        if (ev.data.ok && ev.data.geo) {
          p.ok({ ...ev.data.geo, ondas: { ...ev.data.geo.ondas, campos: new Map() } });
        } else {
          p.err();
        }
      };
      geoWorker.onerror = () => {
        geoWorkerFalhou = true;
        geoWorker?.terminate();
        geoWorker = null;
        for (const p of pendentes.values()) p.err();
        pendentes.clear();
      };
    } catch {
      geoWorkerFalhou = true;
      return null;
    }
  }
  return geoWorker;
}

function construirGeoForaMain(ll: [number, number], o: OpcoesGeo, fino: GradeTiles, largo: GradeTiles | null): Promise<GeoPraia> {
  const w = obterWorker();
  if (!w) return Promise.resolve(construirGeo(ll, o, amostradorDeGrade(fino), largo ? amostradorDeGrade(largo) : null));
  return new Promise<GeoPraia>((resolve) => {
    const id = nextReqId++;
    const fallback = () => resolve(construirGeo(ll, o, amostradorDeGrade(fino), largo ? amostradorDeGrade(largo) : null));
    pendentes.set(id, { ok: resolve, err: fallback });
    try {
      w.postMessage({ id, ll, o, fino, largo });
    } catch {
      pendentes.delete(id);
      fallback();
    }
  });
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
    p = fetch(getAssetPath(`/geo/praia/${encodeURIComponent(idEstatico)}.json`))
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
    p = Promise.all([gradeTiles(12, bbox), gradeTiles(10, bbox)])
      .then(([fino, largo]) => (fino ? construirGeoForaMain(ll, AREA_GEO, fino, largo) : null))
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
