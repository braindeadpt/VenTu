/**
 * Shared loader for the spots catalog — `src/lib/spots.json` is the single
 * source of truth for both the site (`src/lib/spots.ts` is generated from it
 * by scripts/build-spots-catalog.js) and the pipeline scripts.
 *
 * Replaces the per-script regex parsers that read `src/lib/spots.ts`.
 */
const fs = require('fs');
const path = require('path');

const SPOTS_CATALOG_PATH =
  process.env.SPOTS_CATALOG_PATH || path.join(__dirname, '../../src/lib/spots.json');

/** @returns {Array<object>} the full spot entries (every field, in catalog order). */
function loadSpotsCatalog() {
  const catalog = JSON.parse(fs.readFileSync(SPOTS_CATALOG_PATH, 'utf-8'));
  if (!catalog || !Array.isArray(catalog.spots)) {
    throw new Error(`spots catalog at ${SPOTS_CATALOG_PATH} has no "spots" array`);
  }
  return catalog.spots;
}

/**
 * The fields the conditions pipeline needs (id/lat/lon plus the
 * conditionsSource alias link and region for bias/grouping). Mirrors the
 * shape the old regex parser produced.
 */
function loadConditionsSpots() {
  const seen = new Set();
  return loadSpotsCatalog().filter((spot) => {
    if (seen.has(spot.id)) return false;
    seen.add(spot.id);
    return typeof spot.lat === 'number' && typeof spot.lon === 'number';
  });
}

module.exports = { SPOTS_CATALOG_PATH, loadSpotsCatalog, loadConditionsSpots };
