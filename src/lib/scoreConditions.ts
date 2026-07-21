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

export type ScoreWindSource = 'observed' | 'session-gust' | 'forecast';

/**
 * When model mean wind is weak but gusts are strong (typical Caparica thermal
 * under-read), use a capped session proxy from Open-Meteo gust — not a fake bias.
 *
 * Applies only if mean < 12 kt, gust ≥ 12 kt, and gust/mean ≥ 2.
 */
export function applyGustSessionProxy(conditions: Conditions): {
  conditions: Conditions;
  applied: boolean;
  sessionKt: number | null;
} {
  const meanKt = msToKt(conditions.windSpeed);
  const gustKt = msToKt(conditions.windGust);
  if (meanKt >= 12 || gustKt < 12) {
    return { conditions, applied: false, sessionKt: null };
  }
  const ratio = gustKt / Math.max(meanKt, 0.4);
  if (ratio < 2) {
    return { conditions, applied: false, sessionKt: null };
  }

  const sessionKt = Math.min(gustKt * 0.8, meanKt + (gustKt - meanKt) * 0.6);
  if (sessionKt <= meanKt + 0.5) {
    return { conditions, applied: false, sessionKt: null };
  }

  return {
    conditions: {
      ...conditions,
      windSpeed: ktToMs(sessionKt),
    },
    applied: true,
    sessionKt: Math.round(sessionKt * 10) / 10,
  };
}

/**
 * Prefer fresh IPMA / Ecowitt / METAR wind for sport scores when available.
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
  const windDirection = observed.windDirMissing
    ? conditions.windDirection
    : observed.windDirDeg;

  return {
    ...conditions,
    windSpeed: windSpeedMs,
    windDirection,
    windGust: gustMs,
  };
}

export function resolveScoreWindSource(raw: Record<string, unknown>): ScoreWindSource {
  const observed = pickObservedField(raw);
  if (observed && isObservedFresh(observed.observedAt)) return 'observed';
  const base: Conditions = {
    waveHeight: Number(raw.waveHeight) || 0,
    wavePeriod: Number(raw.wavePeriod) || 0,
    waveDirection: Number(raw.waveDirection) || 0,
    windSpeed: Number(raw.windSpeed) || 0,
    windDirection: Number(raw.windDirection) || 0,
    windGust: Number(raw.windGust) || 0,
    waterTemp: Number(raw.waterTemp) || 0,
  };
  const { applied } = applyGustSessionProxy(base);
  return applied ? 'session-gust' : 'forecast';
}

/** Parse pipeline JSON row into score input (observed > gust proxy > forecast). */
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
  const observed = pickObservedField(raw);
  if (observed && isObservedFresh(observed.observedAt)) {
    return applyObservedWindForScore(base, observed);
  }
  return applyGustSessionProxy(base).conditions;
}
