/**
 * Fetch measured surface currents from the IH HF-radar network via EMODnet
 * Physics ERDDAP (griddap, keyless):
 *
 *   HFRADAR_LISBOA_Totals — Sines→Peniche, ~1.4 km, hourly (IH)
 *
 * The grid is downloaded once per run; each coastal spot inside the
 * footprint adopts the nearest valid radar cell (shadow zones have holes).
 * update-conditions.js merges `currentMeasured*` into conditions when the
 * file is fresh (< MAX_AGE_HOURS). An outage never blocks the pipeline.
 *
 * Output: public/data/hfr-currents.json
 */

const path = require('path');
const { atomicWriteJson } = require('./lib/atomicWriteJson.js');
const hfr = require('./lib/hfrCurrents.js');
const { spots } = require('./update-conditions.js');

const ERDDAP = 'https://erddap.emodnet-physics.eu/erddap/griddap';
const DATASET = 'HFRADAR_LISBOA_Totals';
// Footprint medido do dataset (lat 37.90–38.90, lon −10.60→−8.70).
const LAT_MIN = 37.9;
// ERDDAP valida constraints contra o eixo exacto (máx 38.898182) — um
// stop acima do máximo dá 404 mesmo com margem a sobrar.
const LAT_MAX = 38.898;
const LON_MIN = -10.59;
const LON_MAX = -8.71;
const OUTPUT_PATH =
  process.env.HFR_OUTPUT_PATH || path.join(__dirname, '../public/data/hfr-currents.json');
/** Margem para admitir spots (a célula válida pode ficar até MAX_DIST_KM). */
const SPOT_MARGIN = 0.15;
/** Stride do campo gravado — resolução suficiente para overlay (~3 km). */
const GRID_STRIDE = 2;

function gridUrl() {
  // ERDDAP griddap: os [] dos constraints têm de ir percent-encodados —
  // literais são rejeitados (400) antes do parser.
  const sel = `%5B0:1:0%5D%5B(${LAT_MIN}):${GRID_STRIDE}:(${LAT_MAX})%5D%5B(${LON_MIN}):${GRID_STRIDE}:(${LON_MAX})%5D`;
  return (
    `${ERDDAP}/${DATASET}.csv?` +
    `EWCT%5B(last):1:(last)%5D${sel},NSCT%5B(last):1:(last)%5D${sel}`
  );
}

async function fetchCsv(url, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  console.log('🌊 VenTu — HFR-Lisboa correntes medidas (EMODnet ERDDAP)');
  const csv = await fetchCsv(gridUrl());
  const { time, cells } = hfr.parseGridCsv(csv);
  const ageH = hfr.gridAgeHours(time);
  if (ageH > hfr.MAX_AGE_HOURS) {
    throw new Error(`grid ${ageH.toFixed(1)}h old (> ${hfr.MAX_AGE_HOURS}h) — stale feed, file not written`);
  }
  console.log(`📡 grid ${cells.length} células válidas · time ${time} (${ageH.toFixed(1)}h)`);

  const outSpots = {};
  for (const spot of spots) {
    if (
      spot.lat < LAT_MIN - SPOT_MARGIN || spot.lat > LAT_MAX + SPOT_MARGIN ||
      spot.lon < LON_MIN - SPOT_MARGIN || spot.lon > LON_MAX + SPOT_MARGIN
    ) continue;
    const cell = hfr.nearestCell(cells, spot.lat, spot.lon);
    if (!cell) continue;
    const cur = hfr.currentFromUV(cell.u, cell.v);
    outSpots[spot.id] = { spd: cur.spd, dir: cur.dir, distKm: cell.distKm };
  }

  // Campo dizimado para overlay futura — lat/lon deduzidos das células.
  const lats = [...new Set(cells.map((c) => c.lat))].sort((a, b) => a - b);
  const lons = [...new Set(cells.map((c) => c.lon))].sort((a, b) => a - b);
  const idx = new Map(cells.map((c) => [`${c.lat},${c.lon}`, c]));
  const u = [];
  const v = [];
  for (const lat of lats) {
    for (const lon of lons) {
      const c = idx.get(`${lat},${lon}`);
      u.push(c ? c.u : null);
      v.push(c ? c.v : null);
    }
  }

  atomicWriteJson(OUTPUT_PATH, {
    generatedAt: new Date().toISOString(),
    source: 'EMODnet Physics ERDDAP · HFRADAR_LISBOA_Totals (HF radar, Instituto Hidrográfico)',
    network: 'hfr-lisboa',
    time,
    bbox: { latMin: LAT_MIN, latMax: LAT_MAX, lonMin: LON_MIN, lonMax: LON_MAX },
    field: { lats, lons, u, v },
    spots: outSpots,
  });
  console.log(
    `✅ ${Object.keys(outSpots).length} spots com corrente medida → ${path.relative(process.cwd(), OUTPUT_PATH)}`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
