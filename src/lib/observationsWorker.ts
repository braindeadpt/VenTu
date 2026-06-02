import type { ObservedConditions, ObservedSource } from '@/lib/observations';
import { getCardinalLabel } from '@/lib/wind';

/** Payload from `GET {WORKER}/obs?lat=&lon=` */
export type WorkerObservedPayload = {
  windSpeedKt: number;
  windDirDeg: number | null;
  windCardinal: string | null;
  tempC: number | null;
  stationName: string;
  distanceKm: number;
  observedAt: string;
  source: ObservedSource;
};

export function getObsWorkerBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_OBS_WORKER_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

export function buildObsWorkerUrl(lat: number, lon: number): string | null {
  const base = getObsWorkerBaseUrl();
  if (!base || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const u = new URL(`${base}/obs`);
  u.searchParams.set('lat', String(lat));
  u.searchParams.set('lon', String(lon));
  return u.toString();
}

export function normalizeWorkerObserved(raw: WorkerObservedPayload): ObservedConditions {
  const deg = raw.windDirDeg ?? 0;
  const cardinal = raw.windCardinal ?? getCardinalLabel(deg);
  return {
    windSpeedKt: raw.windSpeedKt,
    windDirDeg: deg,
    windCardinal: cardinal,
    tempC: raw.tempC ?? undefined,
    stationName: raw.stationName,
    distanceKm: raw.distanceKm,
    observedAt: raw.observedAt,
    source: raw.source,
  };
}

export function parseWorkerObservedResponse(
  body: unknown,
): WorkerObservedPayload | null {
  if (!body || typeof body !== 'object') return null;
  const observed = (body as { observed?: unknown }).observed;
  if (!observed || typeof observed !== 'object') return null;

  const o = observed as Record<string, unknown>;
  const source = o.source;
  if (source !== 'ipma' && source !== 'ecowitt') return null;

  const windSpeedKt = Number(o.windSpeedKt);
  if (!Number.isFinite(windSpeedKt)) return null;

  const stationName = typeof o.stationName === 'string' ? o.stationName : '';
  const distanceKm = Number(o.distanceKm);
  const observedAt = typeof o.observedAt === 'string' ? o.observedAt : '';
  if (!stationName || !Number.isFinite(distanceKm) || !observedAt) return null;

  const windDirDeg =
    o.windDirDeg === null || o.windDirDeg === undefined
      ? null
      : Number(o.windDirDeg);
  const windCardinal =
    o.windCardinal === null || o.windCardinal === undefined
      ? null
      : typeof o.windCardinal === 'string'
        ? o.windCardinal
        : null;

  const tempC =
    o.tempC === null || o.tempC === undefined ? null : Number(o.tempC);

  return {
    windSpeedKt,
    windDirDeg: windDirDeg !== null && Number.isFinite(windDirDeg) ? windDirDeg : null,
    windCardinal,
    tempC: tempC !== null && Number.isFinite(tempC) ? tempC : null,
    stationName,
    distanceKm,
    observedAt,
    source,
  };
}
