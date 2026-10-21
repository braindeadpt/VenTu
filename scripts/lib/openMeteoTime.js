/**
 * Etiquetas horárias das séries do pipeline: desde a auditoria M1 vêm de pedidos
 * em UTC convertidos para a hora de parede do spot COM desvio
 * (`2026-10-25T01:00+01:00`, `2026-10-25T01:00+00:00`, Açores `…-01:00`) —
 * ver `openMeteoUtc.js`. Etiquetas antigas sem desvio continuam a ser lidas
 * como hora de parede de Lisboa.
 * Never use Date.getHours() on the server — it breaks on UTC runners and picks wrong slots.
 */

const { seriesTimeMs } = require('./openMeteoUtc');

const LISBON_TZ = 'Europe/Lisbon';
const HOUR_MS = 3_600_000;

function lisbonHourKeyFromDate(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const pick = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}`;
}

/** @param {string} iso e.g. 2026-05-31T14:00 */
function hourKeyFromOpenMeteo(iso) {
  return iso.slice(0, 13);
}

/** Monotonic minute offset for comparing Lisbon hour keys. */
function hourKeyToMinuteOffset(key) {
  const [date, hour] = key.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const h = Number(hour);
  return (((y * 372 + m) * 31 + d) * 24 + h);
}

/**
 * Index of the hourly slot that contains "now" (by instant, so the repeated
 * 01:00 of the autumn change and the Azores labels resolve to the right hour),
 * or the closest slot when the series does not cover now.
 * @param {string[]} times
 * @param {Date} [now]
 */
function findCurrentHourIndex(times, now = new Date()) {
  if (!times?.length) return 0;

  const nowMs = now.getTime();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = seriesTimeMs(times[i]);
    if (!Number.isFinite(t)) continue;
    if (nowMs >= t && nowMs < t + HOUR_MS) return i;
    const diff = Math.abs(t - nowMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  if (bestDiff === Infinity) {
    // etiquetas ilegíveis: comportamento antigo por chave de Lisboa
    const nowKey = lisbonHourKeyFromDate(now);
    const exact = times.findIndex((t) => hourKeyFromOpenMeteo(String(t)) === nowKey);
    if (exact >= 0) return exact;
    const nowOff = hourKeyToMinuteOffset(nowKey);
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(hourKeyToMinuteOffset(hourKeyFromOpenMeteo(String(times[i]))) - nowOff);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
  }
  return best;
}

module.exports = {
  LISBON_TZ,
  seriesTimeMs,
  findCurrentHourIndex,
  hourKeyFromOpenMeteo,
  lisbonHourKeyFromDate,
};
