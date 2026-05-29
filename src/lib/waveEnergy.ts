/**
 * Approximate wave power flux (kW/m) from significant height and period.
 * Deep-water simplification used for map display — not a full spectral model.
 */
export function wavePowerKwPerM(heightM: number, periodS: number): number {
  if (!Number.isFinite(heightM) || !Number.isFinite(periodS) || heightM <= 0 || periodS <= 0) {
    return 0;
  }
  return 0.5 * heightM * heightM * periodS;
}

export const SWELL_TRAIN_MIN_HEIGHT_M = 0.1;

export type SwellTrainKey = 'primary' | 'secondary';

export interface SwellTrain {
  key: SwellTrainKey;
  height: number;
  period: number;
  direction: number;
  powerKw: number;
  isDominant: boolean;
}

export interface SwellTrainConditions {
  swellHeight?: number | null;
  swellPeriod?: number | null;
  swellDirection?: number | null;
  secondarySwellHeight?: number | null;
  secondarySwellPeriod?: number | null;
  secondarySwellDirection?: number | null;
  waveHeight?: number | null;
  wavePeriod?: number | null;
  wavePowerKw?: number | null;
}

function isValidTrain(height?: number | null, period?: number | null): boolean {
  return (
    height != null &&
    period != null &&
    height > SWELL_TRAIN_MIN_HEIGHT_M &&
    period > 0
  );
}

/** Prefer swell components for surf relevance; fall back to total sea state. */
export function wavePowerFromMarine(params: {
  swellHeight?: number | null;
  swellPeriod?: number | null;
  waveHeight?: number | null;
  wavePeriod?: number | null;
}): number {
  const swellH = params.swellHeight ?? 0;
  const swellT = params.swellPeriod ?? 0;
  if (swellH > SWELL_TRAIN_MIN_HEIGHT_M && swellT > 0) {
    return wavePowerKwPerM(swellH, swellT);
  }
  return wavePowerKwPerM(params.waveHeight ?? 0, params.wavePeriod ?? 0);
}

/** Ordered swell trains (dominant first); empty when flat. */
export function buildSwellTrains(conditions: SwellTrainConditions): SwellTrain[] {
  const candidates: Omit<SwellTrain, 'isDominant'>[] = [];

  if (isValidTrain(conditions.swellHeight, conditions.swellPeriod)) {
    const height = conditions.swellHeight!;
    const period = conditions.swellPeriod!;
    candidates.push({
      key: 'primary',
      height,
      period,
      direction: conditions.swellDirection ?? 0,
      powerKw: wavePowerKwPerM(height, period),
    });
  }

  if (isValidTrain(conditions.secondarySwellHeight, conditions.secondarySwellPeriod)) {
    const height = conditions.secondarySwellHeight!;
    const period = conditions.secondarySwellPeriod!;
    candidates.push({
      key: 'secondary',
      height,
      period,
      direction: conditions.secondarySwellDirection ?? 0,
      powerKw: wavePowerKwPerM(height, period),
    });
  }

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => b.powerKw - a.powerKw);
  const topPower = candidates[0].powerKw;

  return candidates.map((t) => ({
    ...t,
    isDominant: t.powerKw === topPower && topPower > 0,
  }));
}

/** Sum of kW/m across active swell trains. */
export function totalSwellPowerKw(conditions: SwellTrainConditions): number {
  return buildSwellTrains(conditions).reduce((sum, t) => sum + t.powerKw, 0);
}

export const MS_TO_KNOTS = 1.94384;

/** Prefer stored kW/m; otherwise derive from primary swell only (retrocompat). */
export function resolveWavePowerKw(params: {
  wavePowerKw?: number | null;
  swellHeight?: number | null;
  swellPeriod?: number | null;
  waveHeight: number;
  wavePeriod: number;
}): number {
  if (params.wavePowerKw != null && Number.isFinite(params.wavePowerKw)) {
    return params.wavePowerKw;
  }
  return wavePowerFromMarine(params);
}
