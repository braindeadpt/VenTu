/** Thresholds aligned with update-data.yml cadence (every 3h). */
export const STALE_THRESHOLD_HOURS = 3;
export const VERY_STALE_THRESHOLD_HOURS = 12;

export type DataFreshness = 'fresh' | 'stale' | 'very-stale';

export function getAgeHours(updatedAt?: string | null): number | null {
  if (!updatedAt) return null;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return null;
  return (Date.now() - ts) / 3600000;
}

export function getDataFreshness(updatedAt?: string | null): DataFreshness | null {
  const ageHours = getAgeHours(updatedAt);
  if (ageHours === null) return null;
  if (ageHours < STALE_THRESHOLD_HOURS) return 'fresh';
  if (ageHours < VERY_STALE_THRESHOLD_HOURS) return 'stale';
  return 'very-stale';
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
