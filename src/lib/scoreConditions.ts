import type { Conditions } from '@/lib/sportScore';
import type { ObservedConditions } from '@/lib/observations';
import { isObservedFresh } from '@/lib/observations';
import { pickObservedField } from '@/lib/marineConditions';

const MS_PER_KT = 1 / 1.94384;

/** Knots → m/s (Open-Meteo uses m/s). */
export function ktToMs(kt: number): number {
  return kt * MS_PER_KT;
}

/** m/s → knots. */
export function msToKt(ms: number): number {
  return ms * 1.94384;
}

/**
 * Prefer fresh IPMA/Ecowitt wind for sport scores when available.
 * Waves and water temp stay from forecast; gust uses max(forecast, observed × 1.1).
 */
export function applyObservedWindForScore(
  conditions: Conditions,
  observed?: ObservedConditions | null,
): Conditions {
  if (!observed || !isObservedFresh(observed.observedAt)) {
    return conditions;
  }

  const windSpeedMs = ktToMs(observed.windSpeedKt);
  const gustMs = Math.max(conditions.windGust, windSpeedMs * 1.1);

  return {
    ...conditions,
    windSpeed: windSpeedMs,
    windDirection: observed.windDirDeg,
    windGust: gustMs,
  };
}

/** Parse pipeline JSON row into score input, applying fresh observed wind when present. */
export function rawToScoreInput(raw: Record<string, unknown>): Conditions {
  const base: Conditions = {
    waveHeight: Number(raw.waveHeight) || 0,
    wavePeriod: Number(raw.wavePeriod) || 0,
    waveDirection: Number(raw.waveDirection) || 0,
    windSpeed: Number(raw.windSpeed) || 0,
    windDirection: Number(raw.windDirection) || 0,
    windGust: Number(raw.windGust) || 0,
    waterTemp: Number(raw.waterTemp) || 0,
  };
  return applyObservedWindForScore(base, pickObservedField(raw));
}
