/**
 * WMO/ES buoy observation archive — persistent, keyless.
 *
 * The Puertos del Estado buoys report to the Copernicus NRT bucket only in
 * `latest/<day>/` (no dated history on the public S3), so a single run has at
 * most ~19 hourly readings per buoy — far below MIN_BIAS_N=30. This archive
 * accumulates those readings run after run (dedupe by UTC hour, keep latest),
 * so the ERA5-vs-buoy bias for the Galiza/Cantábrico coverage grows to a
 * usable sample within a few days. Same pattern as forecast-skill.json.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT_PATH = path.join(__dirname, '../../public/data/wmo-bias-archive.json');

/** Readings older than this many days are dropped (matches BIAS_WINDOW_DAYS). */
const ARCHIVE_WINDOW_DAYS = 13;

function emptyArchive() {
  return { fetchedAt: null, buoys: {} };
}

/** Read the archive (missing/corrupt → empty). */
function readArchive(outputPath = DEFAULT_OUTPUT_PATH) {
  try {
    if (fs.existsSync(outputPath)) {
      const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      return {
        ...emptyArchive(),
        ...raw,
        buoys:
          raw.buoys && typeof raw.buoys === 'object' && !Array.isArray(raw.buoys)
            ? raw.buoys
            : {},
      };
    }
  } catch {
    /* corrupt archive — start fresh */
  }
  return emptyArchive();
}

/** Write the archive atomically. */
function writeArchive(archive, outputPath = DEFAULT_OUTPUT_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(archive, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, outputPath);
}

/** UTC hour bucket of a reading date ('YYYY-MM-DDTHH'). */
function hourKey(dateIso) {
  const hour = String(dateIso).slice(0, 13);
  return /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hour) ? hour : null;
}

/**
 * Merge a buoy's readings into the archive — one reading per UTC hour (the
 * latest wins). `meta` (name/area/lat/lon) is refreshed from the newest file.
 * @param {object} archive
 * @param {string} code WMO platform code
 * @param {{ name?: string, area?: string, lat?: number, lon?: number }} meta
 * @param {Array<{ date: string, hs: number }>} readings from surfaceSeries
 * @returns {number} readings added/updated
 */
function mergeBuoyReadings(archive, code, meta, readings) {
  if (!Array.isArray(readings) || readings.length === 0) return 0;
  const entry = archive.buoys[code] ?? { code, readings: [] };
  if (meta) {
    if (meta.name) entry.name = meta.name;
    if (meta.area) entry.area = meta.area;
    if (Number.isFinite(meta.lat)) entry.lat = meta.lat;
    if (Number.isFinite(meta.lon)) entry.lon = meta.lon;
  }

  const byHour = new Map();
  for (const r of entry.readings) {
    const h = hourKey(r.date);
    if (h) byHour.set(h, r);
  }
  let touched = 0;
  for (const r of readings) {
    const h = hourKey(r.date);
    if (!h || !Number.isFinite(r.hs) || r.hs < 0) continue;
    const prev = byHour.get(h);
    if (!prev || new Date(r.date) > new Date(prev.date)) {
      byHour.set(h, { date: r.date, hm0: r.hs });
      touched += 1;
    }
  }
  if (touched === 0) return 0; // nada novo — não criar/manter entrada vazia
  entry.readings = [...byHour.values()].sort((a, b) => a.date.localeCompare(b.date));
  archive.buoys[code] = entry;
  return touched;
}

/** Drop readings older than the rolling window. */
function pruneArchive(archive, nowMs = Date.now(), windowDays = ARCHIVE_WINDOW_DAYS) {
  const cutoff = nowMs - windowDays * 86_400_000;
  for (const entry of Object.values(archive.buoys)) {
    entry.readings = (entry.readings ?? []).filter((r) => {
      const t = new Date(r.date).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }
}

/**
 * Geographic nearest-buoy mapping (stable — not freshness-gated, unlike the
 * merge's mapSpotsToWmoBuoys): which ES buoy each spot is physically closest
 * to, for attributing the per-buoy bias to spot regions.
 * @param {Array<{ id: string, lat: number, lon: number }>} spots
 * @param {Record<string, { lat: number, lon: number }>} buoys keyed by code
 * @param {number} [maxKm]
 * @returns {Record<string, { idEst: string, distanceKm: number }>}
 */
function mapSpotsToNearestBuoy(spots, buoys, maxKm = 250) {
  const R = 6371;
  const dist = (lat1, lon1, lat2, lon2) => {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const live = Object.entries(buoys).filter(
    ([, b]) => Number.isFinite(b.lat) && Number.isFinite(b.lon),
  );
  const mapping = {};
  for (const spot of spots) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const [code, b] of live) {
      const d = dist(spot.lat, spot.lon, b.lat, b.lon);
      if (d < nearestDist && d <= maxKm) {
        nearestDist = d;
        nearest = code;
      }
    }
    if (nearest) {
      mapping[spot.id] = {
        idEst: nearest,
        distanceKm: Math.round(nearestDist * 10) / 10,
      };
    }
  }
  return mapping;
}

module.exports = {
  ARCHIVE_WINDOW_DAYS,
  DEFAULT_OUTPUT_PATH,
  emptyArchive,
  readArchive,
  writeArchive,
  hourKey,
  mergeBuoyReadings,
  pruneArchive,
  mapSpotsToNearestBuoy,
};
