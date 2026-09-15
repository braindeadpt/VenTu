/**
 * Land mask for the map field layers.
 *
 * `landRings.ts` carries GADM 4.1 level-0 coastlines (PT + ES) simplified to
 * ~0.4 km. At module init the rings are scanline-rasterized into a coarse
 * lat/lon bitmap (~1.8 km cells) so `pointOnLand` is an O(1) lookup — the
 * same path used per grid cell (Hs/SST) and per particle frame (wind/
 * currents), where a ray-cast against ~4k vertices would be too slow.
 *
 * Coverage: MAP_HS_BOUNDS region only — mainland Iberia west strip, Azores
 * and Madeira boxes. Points outside the raster domain count as sea (fields
 * never render there anyway).
 */
import { LAND_RINGS } from './landRings';

const LAT_S = 32.0;
const LAT_N = 43.0;
const LON_W = -32.0;
const LON_E = -6.0;
const STEP = 0.006; // ~600 m — blocos visíveis ficam abaixo da leitura a zoom regional

const COLS = Math.ceil((LON_E - LON_W) / STEP);
const ROWS = Math.ceil((LAT_N - LAT_S) / STEP);
const LAND = new Uint8Array(COLS * ROWS);

for (const ring of LAND_RINGS) {
  for (let row = 0; row < ROWS; row++) {
    const y = LAT_S + (row + 0.5) * STEP;
    const xs: number[] = [];
    for (let i = 0, n = ring.length - 1; i < n; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      if (y1 <= y !== y2 <= y) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // Centro da célula dentro do polígono — simétrico (~±1 km de erro de
      // borda, absorvido pelo blur do tile).
      const c0 = Math.max(0, Math.ceil((xs[k] - LON_W) / STEP - 0.5));
      const c1 = Math.min(COLS - 1, Math.floor((xs[k + 1] - LON_W) / STEP - 0.5));
      LAND.fill(1, row * COLS + c0, row * COLS + c1 + 1);
    }
  }
}

/** True when the point sits on land (per the baked GADM coastline raster). */
export function pointOnLand(lat: number, lon: number): boolean {
  if (lat < LAT_S || lat >= LAT_N || lon < LON_W || lon >= LON_E) return false;
  const col = Math.floor((lon - LON_W) / STEP);
  const row = Math.floor((lat - LAT_S) / STEP);
  return LAND[row * COLS + col] === 1;
}
