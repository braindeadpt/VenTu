import type { ConfidenceDetail, ConfidenceTier, DailyConfidence } from '@/lib/forecastConfidenceCore';
import type { ObservedConditions } from '@/lib/observations';

export type { ConfidenceDetail, ConfidenceTier, DailyConfidence } from '@/lib/forecastConfidenceCore';

/** Shared marine condition fields (static JSON + map + drawer). */
export interface MarineConditionsFields {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
  swellHeight?: number;
  swellPeriod?: number;
  swellDirection?: number;
  secondarySwellHeight?: number;
  secondarySwellPeriod?: number;
  secondarySwellDirection?: number;
  windWaveHeight?: number;
  wavePowerKw?: number;
  updatedAt?: string;
  source?: 'real' | 'mock';
  tideHeight?: number;
  tideStatus?: string;
  tideLabel?: string;
  tideObservedHeight?: number;
  tideObservedAt?: string;
  tideStation?: string;
  /** Multi-model forecast agreement (does not affect score). */
  confidence?: ConfidenceTier;
  confidenceDetail?: ConfidenceDetail;
  dailyConfidence?: DailyConfidence[];
  /** Ground-truth snapshot (IPMA station); does not affect score. */
  observed?: ObservedConditions;
}

const MARINE_DISPLAY_KEYS = [
  'swellHeight',
  'swellPeriod',
  'swellDirection',
  'secondarySwellHeight',
  'secondarySwellPeriod',
  'secondarySwellDirection',
  'windWaveHeight',
  'wavePowerKw',
] as const satisfies readonly (keyof MarineConditionsFields)[];

/** Snapshot fields for index / drawer (not used in sport score). */
export function pickMarineDisplayFields(
  raw: Record<string, unknown>,
): Partial<Pick<MarineConditionsFields, (typeof MARINE_DISPLAY_KEYS)[number]>> {
  const out: Partial<Pick<MarineConditionsFields, (typeof MARINE_DISPLAY_KEYS)[number]>> = {};
  for (const key of MARINE_DISPLAY_KEYS) {
    const v = raw[key];
    if (v != null && Number.isFinite(Number(v))) {
      (out as Record<string, number>)[key] = Number(v);
    }
  }
  return out;
}

/** Pass observed layer through index / client loaders. */
export function pickObservedField(
  raw: Record<string, unknown>,
): ObservedConditions | undefined {
  const o = raw.observed;
  if (!o || typeof o !== 'object') return undefined;
  const obs = o as Record<string, unknown>;
  if (
    typeof obs.windSpeedKt !== 'number' ||
    typeof obs.windDirDeg !== 'number' ||
    typeof obs.windCardinal !== 'string' ||
    typeof obs.stationName !== 'string' ||
    typeof obs.distanceKm !== 'number' ||
    typeof obs.observedAt !== 'string' ||
    (obs.source !== 'ipma' && obs.source !== 'ecowitt')
  ) {
    return undefined;
  }
  return {
    windSpeedKt: obs.windSpeedKt,
    windDirDeg: obs.windDirDeg,
    windCardinal: obs.windCardinal,
    windCardinalEn:
      typeof obs.windCardinalEn === 'string' ? obs.windCardinalEn : undefined,
    tempC: typeof obs.tempC === 'number' ? obs.tempC : undefined,
    stationName: obs.stationName,
    distanceKm: obs.distanceKm,
    observedAt: obs.observedAt,
    source: obs.source as 'ipma' | 'ecowitt',
  };
}
