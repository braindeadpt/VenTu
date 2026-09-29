'use strict';
/**
 * Archipelago spots (Açores/Madeira) — detected by geo-box, not region
 * strings (region names drift: 'São Miguel' vs 'Açores' vs 'Santa Maria').
 *
 * The archipelagos have at most ONE live national wave buoy (BOND5
 * Graciosa while BOND2 São Miguel / BOND6 Santa Maria are inactive).
 * For island spots the only honest national reading sits 230–280 km
 * away — the same order as the explicit Cabo Silleiro bridge
 * (~280–300 km), so island spots get a wider buoy radius while the
 * mainland keeps the stricter caps. Distance always stays in the
 * payload — the UI shows «a 276 km» as the disclosure.
 */
const ISLAND_BUOY_MAP_KM = 280;
const ISLAND_BUOY_ATTACH_KM = 280;

/**
 * @param {{ lat?: number, lon?: number }} spot
 * @returns {boolean}
 */
function isIslandSpot(spot) {
  const lat = Number(spot?.lat);
  const lon = Number(spot?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  // Açores: ~36.9–39.8 N, 24.6–31.3 W (flores a santa maria)
  const azores = lat >= 36.5 && lat <= 40.2 && lon >= -31.6 && lon <= -24.4;
  // Madeira/Desertas/Selvagens: ~32.3–33.3 N, 15.8–17.7 W
  const madeira = lat >= 32.2 && lat <= 33.4 && lon >= -17.7 && lon <= -15.8;
  return azores || madeira;
}

/**
 * Per-spot map radius: wider for islands, `fallbackKm` (the lib's
 * MAX_BUOY_MAP_KM) otherwise.
 */
function buoyMapKmFor(spot, fallbackKm) {
  return isIslandSpot(spot) ? ISLAND_BUOY_MAP_KM : fallbackKm;
}

/**
 * Per-mapping attach radius: the persisted `island` flag (written by the
 * mapper) relaxes the cap — the merge doesn't need to know the spot.
 */
function buoyAttachKmForMapping(mapping, fallbackKm) {
  return mapping?.island === true ? ISLAND_BUOY_ATTACH_KM : fallbackKm;
}

module.exports = {
  ISLAND_BUOY_MAP_KM,
  ISLAND_BUOY_ATTACH_KM,
  isIslandSpot,
  buoyMapKmFor,
  buoyAttachKmForMapping,
};
