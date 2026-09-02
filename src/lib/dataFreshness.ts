/** Thresholds aligned with Lisbon schedule (2h day / 4h night). */
export const STALE_THRESHOLD_HOURS = 2.5;
export const VERY_STALE_THRESHOLD_HOURS = 12;

export type DataFreshness = 'fresh' | 'stale' | 'very-stale';

export function getAgeHours(updatedAt?: string | number | null): number | null {
  if (updatedAt === null || updatedAt === undefined) return null;
  const ts = typeof updatedAt === 'number' ? updatedAt : new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return null;
  return (Date.now() - ts) / 3600000;
}

export function getDataFreshness(updatedAt?: string | number | null): DataFreshness | null {
  const ageHours = getAgeHours(updatedAt);
  if (ageHours === null) return null;
  if (ageHours < STALE_THRESHOLD_HOURS) return 'fresh';
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
export function formatForecastUpdatedAt(ts: number, locale: string): string {
  const isPt = locale === 'pt';
  const date = new Date(ts);
  const loc = isPt ? 'pt-PT' : 'en-GB';
  const isToday = date.toDateString() === new Date().toDateString();
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

export function formatStaleAge(updatedAt: string, isPt: boolean): string {
  const ageHours = getAgeHours(updatedAt);
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
