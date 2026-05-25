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

/** Prefer swell components for surf relevance; fall back to total sea state. */
export function wavePowerFromMarine(params: {
  swellHeight?: number | null;
  swellPeriod?: number | null;
  waveHeight?: number | null;
  wavePeriod?: number | null;
}): number {
  const swellH = params.swellHeight ?? 0;
  const swellT = params.swellPeriod ?? 0;
  if (swellH > 0 && swellT > 0) {
    return wavePowerKwPerM(swellH, swellT);
  }
  return wavePowerKwPerM(params.waveHeight ?? 0, params.wavePeriod ?? 0);
}

export const MS_TO_KNOTS = 1.94384;

/** Prefer stored kW/m; otherwise derive from swell or total sea state. */
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
