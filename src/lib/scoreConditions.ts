import type { Conditions } from '@/lib/sportScore';
import type { ObservedConditions } from '@/lib/observations';
import { isObservedFresh } from '@/lib/observations';
import type { ObservedWave } from '@/lib/observedWave';
import { isObservedWaveFresh } from '@/lib/observedWave';
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
 * Prefer a fresh measured buoy reading for the score's wave inputs. This is a
 * real-time bias correction: instead of trusting the forecast wave height at
 * the beach line-up, use the actual measured hm0 (plus period/direction when
 * the buoy reports them). Deep-water caveat: the reading is offshore, so we
 * keep the forecast as fallback for missing fields and let the UI label the
 * source honestly (ScoreWaveSourceBadge).
 */
export function applyObservedWaveForScore(
  conditions: Conditions,
  observedWave?: ObservedWave | null,
): Conditions {
  if (!observedWave || !isObservedWaveFresh(observedWave)) {
    return conditions;
  }
  return {
    ...conditions,
    waveHeight: observedWave.waveHeight,
    wavePeriod:
      typeof observedWave.wavePeriod === 'number' ? observedWave.wavePeriod : conditions.wavePeriod,
    waveDirection:
      typeof observedWave.waveDirection === 'number'
        ? observedWave.waveDirection
        : conditions.waveDirection,
  };
}

export type ScoreWaveSource = 'observed' | 'bias-corrected' | 'forecast';

/**
 * Whether the score's wave height was corrected by a buoy:
 * - 'observed'       — fresh measured hm0 replaced the forecast in real time;
 * - 'bias-corrected' — the regional ME from wave-bias.json was applied to the
 *                      forecast by the pipeline (VENTU_WAVE_BIAS_CORRECTION=1);
 * - 'forecast'       — raw model value, no correction.
 */
export function resolveScoreWaveSource(raw: Record<string, unknown>): ScoreWaveSource {
  const observedWave = raw.observedWave as ObservedWave | undefined;
  if (observedWave && isObservedWaveFresh(observedWave)) return 'observed';
  const waveBias = raw.waveBias;
  if (waveBias && typeof waveBias === 'object') return 'bias-corrected';
  return 'forecast';
}

/** Everything the UI needs to explain a wave correction honestly. */
export interface ScoreWaveCorrection {
  source: ScoreWaveSource;
  /** Buoy name (real-time route). */
  buoyName?: string;
  /** Mean error of the calibration (m). */
  me?: number;
  /** Sample size of the calibration. */
  n?: number;
  /** Actual correction applied to the height shown (m). */
  deltaM?: number;
  /**
   * Cross-border ES→PT calibration (attached by the merge when a Spanish
   * buoy reading wins): the reading was shifted to the PT reference. Raw
   * height + delta kept so the tooltip can show the adjustment.
   */
  calibration?: {
    me: number;
    n: number;
    from?: string;
    verdict?: string;
    rawHeight: number;
    deltaM: number;
  };
  /**
   * True when the regional bias was applied at runtime by the client-side
   * fallback (wave-bias.json fetched by the UI) instead of being baked by the
   * pipeline. Lets the badge tooltip distinguish «correcção em tempo real»
   * from «meta da pipeline» honestly.
   */
  fallback?: boolean;
}

/**
 * Suffix for the score-factor stat chip (e.g. hero «Ondas 1.8m (boia)») so
 * the measured/corrected input is visible in the factor itself, beyond the
 * source badge: fresh buoy → «(boia)»; regional bias fallback → «(viés
 * regional)»; raw forecast → no suffix.
 */
export function waveFactorSuffix(source: ScoreWaveSource, locale: string): string {
  const isPt = locale === 'pt';
  if (source === 'observed') return isPt ? ' (boia)' : ' (buoy)';
  if (source === 'bias-corrected') return isPt ? ' (viés regional)' : ' (regional bias)';
  return '';
}

/**
 * Resolve the correction details for the badge tooltip:
 * - real-time: buoy name + per-buoy skill (ME/n) attached by the merge step;
 * - regional bias: ME/n/deltaM from the waveBias meta baked into the row.
 * Returns null when the score used the raw forecast.
 */
export function resolveScoreWaveCorrection(
  raw: Record<string, unknown>,
): ScoreWaveCorrection | null {
  const observedWave = raw.observedWave as ObservedWave | undefined;
  if (observedWave && isObservedWaveFresh(observedWave)) {
    const skill = observedWave.skill;
    const me = skill && Number.isFinite(skill.me) ? skill.me : undefined;
    const n = skill && Number.isFinite(skill.n) ? skill.n : undefined;
    const calibration = observedWave.calibration;
    const hasCal =
      calibration &&
      Number.isFinite(calibration.me) &&
      Number.isFinite(calibration.n);
    return {
      source: 'observed',
      buoyName: observedWave.stationName?.trim() || observedWave.stationArea?.trim() || undefined,
      ...(me !== undefined ? { me } : {}),
      ...(n !== undefined ? { n } : {}),
      ...(hasCal ? { calibration: calibration as NonNullable<typeof calibration> } : {}),
    };
  }
  const waveBias = raw.waveBias as
    | { me?: unknown; n?: unknown; deltaM?: unknown; fallback?: unknown }
    | undefined;
  if (waveBias && typeof waveBias === 'object') {
    const me = Number(waveBias.me);
    const n = Number(waveBias.n);
    const deltaM = Number(waveBias.deltaM);
    return {
      source: 'bias-corrected',
      ...(Number.isFinite(me) ? { me } : {}),
      ...(Number.isFinite(n) ? { n } : {}),
      ...(Number.isFinite(deltaM) ? { deltaM } : {}),
      ...(waveBias.fallback === true ? { fallback: true } : {}),
    };
  }
  return null;
}

/**
 * Regional-bias fallback — wave-bias.json (when available) as the correction
 * fallback when the buoy is NOT fresh but the region has historical bias.
 *
 * The pipeline (update-conditions + VENTU_WAVE_BIAS_CORRECTION=1) bakes the
 * corrected waveHeight + `waveBias` meta into the row, but only when the flag
 * is on at build time. This client-side fallback mirrors the same gates
 * (buoyBias.applyWaveBias) so the spot page can still show «Corrigido (viés
 * regional)» — and actually apply the correction — when the row has no meta.
 * Honesty rules:
 *  - a FRESH buoy reading always wins (never bias over real-time);
 *  - a row already corrected by the pipeline is never double-corrected;
 *  - the badge only renders when the correction is actually applied.
 */

/** Pipeline gates mirrored from scripts/lib/buoyBias.js. */
export const WAVE_BIAS_MIN_N = 30;
export const WAVE_BIAS_MIN_M = 0.15;
export const WAVE_BIAS_MAX_M = 1.5;

/** Raw wave-bias.json regions shape (regions keyed by spot.region). */
export interface WaveBiasRegionsFile {
  fetchedAt?: string | null;
  regions?: Record<
    string,
    { n?: unknown; me?: unknown; mae?: unknown; rmse?: unknown; corr?: unknown }
  >;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Resolve the regional bias for a spot's region with the pipeline gates:
 * sample n ≥ 30 and |ME| within [0.15, 1.5] m. Returns the region stats or
 * null — pure, never throws.
 */
export function resolveRegionBias(
  region: string | undefined,
  waveBiasFile: WaveBiasRegionsFile | null | undefined,
): { region: string; me: number; n: number; mae?: number; rmse?: number } | null {
  if (!region || !waveBiasFile?.regions) return null;
  const bias = waveBiasFile.regions[region];
  if (!bias || typeof bias !== 'object') return null;
  const me = Number(bias.me);
  const n = Number(bias.n);
  if (!Number.isFinite(me) || !Number.isInteger(n)) return null;
  if (n < WAVE_BIAS_MIN_N) return null;
  const meAbs = Math.abs(me);
  if (meAbs < WAVE_BIAS_MIN_M || meAbs > WAVE_BIAS_MAX_M) return null;
  const out: { region: string; me: number; n: number; mae?: number; rmse?: number } = {
    region,
    me,
    n,
  };
  const mae = Number(bias.mae);
  const rmse = Number(bias.rmse);
  if (Number.isFinite(mae)) out.mae = mae;
  if (Number.isFinite(rmse)) out.rmse = rmse;
  return out;
}

/**
 * Apply the regional bias as a fallback correction to a spot row (pure).
 * Returns the patch ({ waveHeight corrected + waveBias meta }) or null when
 * nothing should be corrected (fresh reading, pipeline already corrected, or
 * region without usable bias). Mirrors the pipeline arithmetic exactly
 * (round1(raw + me), deltaM ≥ 0.05).
 */
export function applyRegionalBiasFallback(
  spotCond: Record<string, unknown>,
  region: string | undefined,
  waveBiasFile: WaveBiasRegionsFile | null | undefined,
): { waveHeight: number; waveBias: { region: string; me: number; n: number; deltaM: number; fallback: true } } | null {
  // A correcção em tempo real ganha — nunca aplicar o viés com leitura fresca.
  const observedWave = spotCond.observedWave as ObservedWave | undefined;
  if (observedWave && isObservedWaveFresh(observedWave)) return null;
  // Já corrigida pela pipeline (meta na row) — nunca corrigir duas vezes.
  if (spotCond.waveBias && typeof spotCond.waveBias === 'object') return null;
  const bias = resolveRegionBias(region, waveBiasFile);
  if (!bias) return null;
  const raw = Number(spotCond.waveHeight);
  if (!Number.isFinite(raw) || raw < 0) return null;
  const corrected = Math.max(0.1, round1(raw + bias.me));
  const deltaM = round1(corrected - raw);
  if (Math.abs(deltaM) < 0.05) return null;
  // `fallback: true` marca que esta correcção foi aplicada em runtime pelo
  // client (wave-bias.json) — distingue o tooltip da correcção baked pela
  // pipeline, que não carrega o campo.
  return {
    waveHeight: corrected,
    waveBias: { region: bias.region, me: bias.me, n: bias.n, deltaM, fallback: true },
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

/** Everything the UI needs to explain a wind bias correction honestly. */
export interface ScoreWindCorrection {
  /** Station name (IPMA / Ecowitt / METAR). */
  station?: string;
  source?: 'ipma' | 'ecowitt' | 'metar';
  /** Mean error of observed − forecast (kt). */
  me?: number;
  mae?: number;
  rmse?: number;
  /** Sample size of the calibration. */
  n?: number;
}

/**
 * Resolve the wind bias details for the badge tooltip. Returns the station
 * ME/n baked by the merge (wind-bias.json accumulation) when present — the
 * caller only renders it when the score actually used observed wind.
 */
export function resolveScoreWindCorrection(
  raw: Record<string, unknown>,
): ScoreWindCorrection | null {
  const wb = raw.windBias as
    | { station?: unknown; source?: unknown; me?: unknown; mae?: unknown; rmse?: unknown; n?: unknown }
    | undefined;
  if (!wb || typeof wb !== 'object') return null;
  const me = Number(wb.me);
  const n = Number(wb.n);
  if (!Number.isFinite(me) || !Number.isFinite(n)) return null;
  const out: ScoreWindCorrection = {
    ...(typeof wb.station === 'string' && wb.station ? { station: wb.station } : {}),
    ...(wb.source === 'ipma' || wb.source === 'ecowitt' || wb.source === 'metar'
      ? { source: wb.source }
      : {}),
    me,
    n,
  };
  if (Number.isFinite(Number(wb.mae))) out.mae = Number(wb.mae);
  if (Number.isFinite(Number(wb.rmse))) out.rmse = Number(wb.rmse);
  return out;
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

/**
 * Parse pipeline JSON row into score input.
 * Wind: observed (IPMA/Ecowitt/METAR) > gust session proxy > forecast.
 * Waves: fresh buoy reading (measured hm0) recalibrates the forecast in real
 * time — the surf score then reflects what the waverider actually measured.
 */
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
  let out = base;
  if (observed && isObservedFresh(observed.observedAt)) {
    out = applyObservedWindForScore(out, observed);
  } else {
    out = applyGustSessionProxy(out).conditions;
  }
  return applyObservedWaveForScore(out, raw.observedWave as ObservedWave | undefined);
}
