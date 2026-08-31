/**
 * Observed-wave winner selection — IH Datawell primary, WMO/Copernicus
 * fallback — with the reason, so the UI can show both sources side by side
 * honestly (distances + freshness) instead of hiding the runner-up.
 *
 * The payloads are the ones built by observedWaveForSpot in ihBuoys.js /
 * copernicusBuoys.js (both already gated by their own freshness + distance):
 * the IH gate is stricter (3 h) than the WMO one (6 h), so when both are
 * present the IH reading is the freshest trustworthy national source.
 */

/**
 * @param {object | null} ihWave IH observedWave payload (null when stale/missing)
 * @param {object | null} wmoWave WMO/Copernicus payload
 * @param {{ nowMs?: number }} [opts]
 * @returns {{ wave: object | null, alt: object | null, meta: object | null }}
 */
function selectObservedWave(ihWave, wmoWave, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const ageHours = (iso) => {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.round(((nowMs - t) / 3_600_000) * 10) / 10;
  };

  const meta = (winner, reason) => ({
    winner,
    reason,
    ihAgeHours: ihWave ? ageHours(ihWave.observedAt) : null,
    wmoAgeHours: wmoWave ? ageHours(wmoWave.observedAt) : null,
    ihDistanceKm: ihWave ? Math.round(ihWave.distanceKm * 10) / 10 : null,
    wmoDistanceKm: wmoWave ? Math.round(wmoWave.distanceKm * 10) / 10 : null,
  });

  if (ihWave && wmoWave) {
    return { wave: ihWave, alt: wmoWave, meta: meta('ih', 'ih-fresh') };
  }
  if (ihWave) {
    return { wave: ihWave, alt: null, meta: meta('ih', 'ih-only') };
  }
  if (wmoWave) {
    return { wave: wmoWave, alt: null, meta: meta('wmo', 'wmo-only') };
  }
  return { wave: null, alt: null, meta: null };
}

module.exports = { selectObservedWave };
