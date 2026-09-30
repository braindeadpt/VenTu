/** Open-Meteo hourly timestamps use timezone=Europe/Lisbon (local wall time, no offset). */

const LISBON_TZ = 'Europe/Lisbon';

export function lisbonHourKeyFromDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}`;
}

export function hourKeyFromOpenMeteo(iso: string): string {
  return iso.slice(0, 13);
}

function hourKeyToHourOffset(key: string): number {
  const [date, hour] = key.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const h = Number(hour);
  // Compare wall-time keys using the real calendar, without interpreting
  // offset-less Open-Meteo timestamps in the device's timezone.
  return Date.UTC(y, m - 1, d, h) / 3_600_000;
}

/** Exact current hour, or -1 when the series does not cover now. */
export function findCoveredHourIndex(times: readonly string[], now = new Date()): number {
  const key = lisbonHourKeyFromDate(now);
  return times.findIndex((time) => hourKeyFromOpenMeteo(time) === key);
}

/** Index of the hourly slot closest to `now` in Europe/Lisbon. */
export function findCurrentHourIndex(times: string[], now = new Date()): number {
  if (!times.length) return 0;

  const nowKey = lisbonHourKeyFromDate(now);
  const exact = times.findIndex((t) => hourKeyFromOpenMeteo(t) === nowKey);
  if (exact >= 0) return exact;

  const nowOff = hourKeyToHourOffset(nowKey);
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(hourKeyToHourOffset(hourKeyFromOpenMeteo(times[i])) - nowOff);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}
