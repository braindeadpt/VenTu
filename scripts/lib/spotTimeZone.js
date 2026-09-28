'use strict';

/**
 * Twin JS de src/lib/spotTimeZone.ts — os scripts correm em Node puro
 * (update-conditions.js não regista tsx), por isso a regra duplica-se aqui.
 *
 * Açores = Atlantic/Azores (UTC−1 todo o ano, DST nas mesmas datas que
 * Lisboa); Madeira e continente = Europe/Lisbon. Fronteira por longitude:
 * Açores ≤ −25.07, Madeira ≥ −17.3, continente ≥ −9.5.
 */
const LISBON_TZ = 'Europe/Lisbon';
const AZORES_TZ = 'Atlantic/Azores';
const AZORES_LON_CUTOFF = -24;

function spotTimeZone(spotOrLon) {
  const lon = typeof spotOrLon === 'number' ? spotOrLon : spotOrLon?.lon;
  return typeof lon === 'number' && lon < AZORES_LON_CUTOFF
    ? AZORES_TZ
    : LISBON_TZ;
}

module.exports = { LISBON_TZ, AZORES_TZ, spotTimeZone };
