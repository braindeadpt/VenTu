/**
 * Open-Meteo hourly timestamps are naive local wall time (no offset) — since
 * the Azores fix the pipeline requests `timezone=` in EACH spot's zone
 * (scripts/lib/spotTimeZone.js): Europe/Lisbon for mainland/Madeira,
 * Atlantic/Azores for the Azores. Never feed them to `new Date(iso)`:
 * the parse is host-local and breaks on UTC CI runners.
 *
 * Twin of src/lib/openMeteoTime.ts — keep signatures in sync.
 */

const { LISBON_TZ } = require('./spotTimeZone');

/** 'YYYY-MM-DDTHH' of `date` on the wall clock of `timeZone`. */
function hourKeyFromDateInTz(date, timeZone = LISBON_TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const pick = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}`;
}

/** @deprecated alias kept for Lisbon-axis callers. */
function lisbonHourKeyFromDate(date) {
  return hourKeyFromDateInTz(date, LISBON_TZ);
}

/** @param {string} iso e.g. 2026-05-31T14:00 */
function hourKeyFromOpenMeteo(iso) {
  return iso.slice(0, 13);
}

/** Monotonic minute offset for comparing wall-time hour keys. */
function hourKeyToMinuteOffset(key) {
  const [date, hour] = key.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const h = Number(hour);
  return (((y * 372 + m) * 31 + d) * 24 + h);
}

/**
 * Index of the hourly slot closest to "now" on the wall clock of `timeZone`
 * (the zone the `times` strings are written in — the spot's own).
 * @param {string[]} times
 */
function findCurrentHourIndex(times, now = new Date(), timeZone = LISBON_TZ) {
  if (!times?.length) return 0;

  const nowKey = hourKeyFromDateInTz(now, timeZone);
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

const WALL_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2}))?(?::(\d{2}))?/;

/** Wall-time read-back of `utcMs` in `timeZone`, expressed as a fake UTC ms. */
function wallMsAt(timeZone, utcMs) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(utcMs));
  const pick = (t) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second'));
}

/**
 * Real instant (epoch ms) of a naive local wall time `iso` in `timeZone`.
 * Iterative offset refine — converges in ≤3 iterations across DST edges.
 */
function wallTimeToInstantMs(iso, timeZone = LISBON_TZ) {
  const m = WALL_ISO.exec(iso);
  if (!m) return NaN;
  const wallMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5] ?? 0), Number(m[6] ?? 0));
  let utc = wallMs;
  for (let i = 0; i < 3; i += 1) {
    const offset = wallMsAt(timeZone, utc) - utc;
    const next = wallMs - offset;
    if (next === utc) return utc;
    utc = next;
  }
  return utc;
}

function hourKeyFromInstantInTz(ms, timeZone) {
  return hourKeyFromDateInTz(new Date(ms), timeZone);
}

module.exports = {
  LISBON_TZ,
  findCurrentHourIndex,
  hourKeyFromOpenMeteo,
  hourKeyFromDateInTz,
  lisbonHourKeyFromDate,
  wallTimeToInstantMs,
  hourKeyFromInstantInTz,
};
