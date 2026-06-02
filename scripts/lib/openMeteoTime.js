/**
 * Open-Meteo hourly timestamps use timezone=Europe/Lisbon (local wall time, no offset).
 * Never use Date.getHours() on the server — it breaks on UTC runners and picks wrong slots.
 */

const LISBON_TZ = 'Europe/Lisbon';

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
 * Index of the hourly slot closest to "now" in Europe/Lisbon.
 * @param {string[]} times
 */
function findCurrentHourIndex(times) {
  if (!times?.length) return 0;

  const nowKey = lisbonHourKeyFromDate(new Date());
  const exact = times.findIndex((t) => hourKeyFromOpenMeteo(t) === nowKey);
  if (exact >= 0) return exact;

  const nowOff = hourKeyToMinuteOffset(nowKey);
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(hourKeyToMinuteOffset(hourKeyFromOpenMeteo(times[i])) - nowOff);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

module.exports = {
  LISBON_TZ,
  findCurrentHourIndex,
  hourKeyFromOpenMeteo,
  lisbonHourKeyFromDate,
};
