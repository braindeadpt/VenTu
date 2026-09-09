/**
 * Lisbon-hour stale thresholds, aligned with the pipeline schedule
 * (2h day 06:00–20:00 / 4h night). A fixed 2.5h threshold made the badge
 * report "stale" all night: data lands every 4h, so it is always older
 * than 2.5h. The threshold follows the cadence instead — 2.5h by day,
 * 5h at night (4h cadence + 1h margin).
 */
export const STALE_THRESHOLD_HOURS = 2.5; // daytime value (kept for compat)
export const NIGHT_STALE_THRESHOLD_HOURS = 5;
export const VERY_STALE_THRESHOLD_HOURS = 12;

export type DataFreshness = 'fresh' | 'stale' | 'very-stale';

/** Current hour in Lisbon (0–23), in the viewer's frame — pure, testable. */
export function lisbonHour(nowMs?: number): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: 'Europe/Lisbon',
  }).format(new Date(nowMs ?? Date.now()));
  return Number(hour);
}

/** Freshness gate matching the pipeline cadence at the given instant. */
export function staleThresholdHours(nowMs?: number): number {
  const h = lisbonHour(nowMs);
  return h >= 6 && h < 20 ? STALE_THRESHOLD_HOURS : NIGHT_STALE_THRESHOLD_HOURS;
}

export function getAgeHours(
  updatedAt?: string | number | null,
  nowMs?: number,
): number | null {
  if (updatedAt === null || updatedAt === undefined) return null;
  const ts = typeof updatedAt === 'number' ? updatedAt : new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return null;
  return ((nowMs ?? Date.now()) - ts) / 3600000;
}

export function getDataFreshness(updatedAt?: string | number | null, nowMs?: number): DataFreshness | null {
  const ageHours = getAgeHours(updatedAt, nowMs);
  if (ageHours === null) return null;
  if (ageHours < staleThresholdHours(nowMs)) return 'fresh';
  if (ageHours < VERY_STALE_THRESHOLD_HOURS) return 'stale';
  return 'very-stale';
}

export type ForecastUpdatedParts = {
  prefix: string;
  datePart: string;
  timePart: string;
  combined: string;
};

/** Date + clock time for trust surfaces (hero ticker, tooltips). */
export function formatForecastUpdatedParts(ts: number, locale: string): ForecastUpdatedParts {
  const isPt = locale === 'pt';
  const date = new Date(ts);
  const loc = isPt ? 'pt-PT' : 'en-GB';
  const datePart = new Intl.DateTimeFormat(loc, {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Lisbon',
  }).format(date);
  const timePart = new Intl.DateTimeFormat(loc, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(date);
  const prefix = isPt ? 'Actualizado' : 'Updated';

  return {
    prefix,
    datePart,
    timePart,
    combined: `${prefix} ${datePart}, ${timePart}`,
  };
}

/** Clock time (and short date if not today) of the last pipeline update. */
export function formatForecastUpdatedAt(ts: number, locale: string, nowMs?: number): string {
  const isPt = locale === 'pt';
  const date = new Date(ts);
  const loc = isPt ? 'pt-PT' : 'en-GB';
  // nowMs pin: the isToday check is baked at build — the client must
  // reproduce it on first paint (React #418 guard), then live after mount.
  const isToday = date.toDateString() === new Date(nowMs ?? Date.now()).toDateString();
  // timeZone pinned: this label is baked at build time and re-rendered during
  // hydration — without it the clock differs per viewer tz and React throws #418.
  const time = new Intl.DateTimeFormat(loc, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(date);

  if (isToday) {
    return isPt ? `Actualizado ${time}` : `Updated ${time}`;
  }

  const day = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'Europe/Lisbon' }).format(date);
  return isPt ? `Actualizado ${day}, ${time}` : `Updated ${day}, ${time}`;
}

export function formatStaleAge(updatedAt: string, isPt: boolean, nowMs?: number): string {
  const ageHours = getAgeHours(updatedAt, nowMs);
  if (ageHours === null) return isPt ? 'Data desconhecida' : 'Unknown date';

  if (ageHours < 1) {
    const mins = Math.max(1, Math.round(ageHours * 60));
    return isPt ? `Há ${mins} min` : `${mins}m ago`;
  }

  const hours = Math.round(ageHours);
  if (hours < 24) {
    return isPt ? `Há ${hours}h` : `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return isPt ? `Há ${days}d` : `${days}d ago`;
}

export function isDawnPatrolStale(dateStr: string, maxAgeHours = 24): boolean {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return true;
  return (Date.now() - d.getTime()) / 3600000 > maxAgeHours;
}
