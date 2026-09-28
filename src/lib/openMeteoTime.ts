/**
 * Open-Meteo hourly timestamps are naive local wall time (no offset) — since
 * the Azores fix (data/fusos-acores), the pipeline requests `timezone=` in
 * EACH spot's zone: Europe/Lisbon for mainland/Madeira, Atlantic/Azores for
 * the Azores (`spotTimeZone`). Never feed them to `new Date(iso)`: the parse
 * is host-local, so a browser outside the spot's zone reads a wrong instant
 * and hydration breaks (React #418).
 */

import { LISBON_TZ, type SpotTimeZone } from '@/lib/spotTimeZone';

/** 'YYYY-MM-DDTHH' of `date` on the wall clock of `timeZone`. */
export function hourKeyFromDateInTz(date: Date, timeZone: string = LISBON_TZ): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
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

/** @deprecated alias kept for Lisbon-axis callers (map grid, compare). */
export function lisbonHourKeyFromDate(date: Date): string {
  return hourKeyFromDateInTz(date, LISBON_TZ);
}

export function hourKeyFromOpenMeteo(iso: string): string {
  return iso.slice(0, 13);
}

/** 'YYYY-MM-DD' of `date` on the wall clock of `timeZone` — never browser-local. */
export function dateKeyInTz(date: Date, timeZone: string = LISBON_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function hourKeyToMinuteOffset(key: string): number {
  const [date, hour] = key.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const h = Number(hour);
  return (y * 372 + m) * 31 * 24 + d * 24 + h;
}

/**
 * Index of the hourly slot closest to `now` on the wall clock of `timeZone`
 * (the zone the `times` strings are written in — the spot's own).
 */
export function findCurrentHourIndex(
  times: string[],
  now = new Date(),
  timeZone: string = LISBON_TZ,
): number {
  if (!times.length) return 0;

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
function wallMsAt(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? '0');
  return Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second'));
}

/**
 * Real instant (epoch ms) of a naive local wall time `iso` in `timeZone`.
 * Iterative offset refine (guess the wall as UTC, read back the zone's wall,
 * correct) — converges in ≤3 iterations across DST edges; ambiguous autumn
 * hours resolve to the first occurrence, matching Intl/Temporal semantics.
 * Returns NaN for malformed input.
 */
export function wallTimeToInstantMs(iso: string, timeZone: string = LISBON_TZ): number {
  const m = WALL_ISO.exec(iso);
  if (!m) return NaN;
  const wallMs = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
  let utc = wallMs;
  for (let i = 0; i < 3; i += 1) {
    const offset = wallMsAt(timeZone, utc) - utc;
    const next = wallMs - offset;
    if (next === utc) return utc;
    utc = next;
  }
  return utc;
}

/** 'YYYY-MM-DDTHH' wall key of an instant in `timeZone` (inverse of wallTimeToInstantMs). */
export function hourKeyFromInstantInTz(ms: number, timeZone: string): string {
  return hourKeyFromDateInTz(new Date(ms), timeZone);
}
