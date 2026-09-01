/**
 * Observed wave layer — ground truth for wave height/period/direction, kept
 * clearly separate from the model forecast.
 *
 * Two ingestion routes, merged by scripts/merge-observations.mjs:
 * - 'ih-buoy'  — IH Datawell Waverider via the keyed IH REST API (primary);
 * - 'wmo-buoy' — same-class buoys via Copernicus Marine S3, keyless
 *   (independent WMO/GTS route; falls back when the IH layer is stale/down).
 *
 * The payload is baked into conditions.json[spot].observedWave; the frontend
 * only renders it. The freshness gate is shared with the wind observations
 * (isObservedFresh, 3h).
 */

export interface ObservedWave {
  waveHeight: number;
  wavePeriod?: number;
  waveDirection?: number;
  maxWaveHeight?: number;
  waterTemp?: number;
  stationName: string;
  stationArea?: string;
  distanceKm: number;
  observedAt: string;
  source: 'ih-buoy' | 'wmo-buoy';
  /**
   * Keyless ES bridge (Costa de Prata ← Cabo Silleiro, scripts/lib/
   * copernicusBuoys.js): a long-range Spanish proxy attached ONLY while the
   * national Fugro route (IH key or WMO 6200199) has no fresh reading. The
   * UI labels it honestly so it never passes for a local measurement.
   */
  bridge?: boolean;
  /** WMO platform code the reading came from (e.g. '6200084' for the bridge). */
  stationCode?: string;
  /**
   * Accumulated real forecast skill at this buoy (from forecast-skill.json,
   * attached by the merge step): ME/MAE/RMSE (m) + sample size n (+ lead).
   * Lets the UI show the bias correction transparently («corrigido pela boia
   * X · ME +0.2 m (n=47)» and the card's «Skill desta boia» line).
   */
  skill?: {
    me: number;
    n: number;
    mae?: number;
    rmse?: number;
    corr?: number;
    meanLeadHours?: number;
    /** Platform the skill was accumulated against: IH Datawell vs WMO-ES (Copernicus). */
    origin?: 'ih' | 'wmo-pt' | 'wmo-es';
    /** Buoy name the skill belongs to (allows highlighting Spanish buoys like Silleiro). */
    buoyName?: string;
  };
  /**
   * Cross-border ES→PT calibration (applied by the merge when a Spanish
   * Puertos del Estado buoy reading is attached to a PT spot): the displayed
   * height was shifted by the pair's systematic ME to estimate the local PT
   * buoy value. The raw measured height + delta are kept so the UI can show
   * the correction transparently instead of hiding the adjustment.
   */
  calibration?: {
    me: number;
    n: number;
    verdict?: string;
    /** Pair label from buoy-coherence.json (e.g. «Cabo Silleiro × Faro»). */
    from?: string;
    /** Measured value before calibration (m). */
    rawHeight: number;
    /** Applied shift (m) — calibrated = rawHeight + deltaM. */
    deltaM: number;
  };
}

/**
 * Why the winning observedWave source was chosen, so the UI can show the
 * IH vs WMO side by side with the honest reason (freshness/distance).
 */
export interface ObservedWaveMeta {
  winner: 'ih' | 'wmo';
  /**
   * - 'ih-fresh' — IH reading fresh (stricter 3h gate): primary wins;
   * - 'ih-only'  — no WMO reading (stale/missing);
   * - 'wmo-only' — IH stale/missing, WMO fresh (fallback).
   */
  reason: 'ih-fresh' | 'ih-only' | 'wmo-only';
  /** Reading age (h) at merge time — null when the source had no reading. */
  ihAgeHours?: number;
  wmoAgeHours?: number;
  /** Distance to the mapped buoy (km). */
  ihDistanceKm?: number;
  wmoDistanceKm?: number;
}

/**
 * Max reading age per source. The WMO/Copernicus route is wider (6h) because
 * the NRT ingestion lags several hours; the IH API serves near-real-time rows.
 */
export const OBSERVED_WAVE_MAX_AGE_HOURS: Record<ObservedWave['source'], number> = {
  'ih-buoy': 3,
  'wmo-buoy': 6,
};

/** Source-aware freshness gate for a buoy reading (mirrors the data layer). */
export function isObservedWaveFresh(
  wave: Pick<ObservedWave, 'observedAt' | 'source'>,
  nowMs = Date.now(),
): boolean {
  const t = new Date(wave.observedAt).getTime();
  if (!Number.isFinite(t)) return false;
  const ageHours = (nowMs - t) / 3_600_000;
  if (ageHours < 0) return false;
  return ageHours <= OBSERVED_WAVE_MAX_AGE_HOURS[wave.source];
}

/** Honest label: «boia Leixões a 60 km» / «buoy Leixões, 60 km away». */
export function observedWaveLabel(
  wave: Pick<ObservedWave, 'stationName' | 'stationArea' | 'distanceKm'>,
  locale: string,
): string {
  const isPt = locale === 'pt';
  const name = wave.stationName?.trim() || wave.stationArea?.trim() || '';
  const dist = Math.round(wave.distanceKm);
  if (isPt) {
    return name ? `boia ${name} a ${dist} km` : `boia a ${dist} km`;
  }
  return name ? `buoy ${name}, ${dist} km away` : `buoy, ${dist} km away`;
}

/**
 * Compact cross-border calibration tag for use in the hero/sticky compact
 * chip — the card already shows the full raw→calibrated breakdown. Returns
 * null when the reading was not recalibrated (no calibration attached).
 */
export function waveCalibrationTag(
  wave: Pick<ObservedWave, 'calibration' | 'waveHeight'> | null | undefined,
  locale: string,
): { label: string; title: string } | null {
  const cal = wave?.calibration;
  if (!cal || !Number.isFinite(cal.me) || !Number.isFinite(cal.n)) return null;
  const isPt = locale === 'pt';
  const fmtMe = `${cal.me >= 0 ? '+' : ''}${cal.me.toFixed(1)}`;
  const from = cal.from ?? (isPt ? 'par ES×PT' : 'ES×PT pair');
  return {
    label: isPt
      ? `🔧 ref. PT (${fmtMe} m · n=${cal.n})`
      : `🔧 PT ref (${fmtMe} m · n=${cal.n})`,
    title: isPt
      ? `Leitura espanhola recalibrada para a referência PT (${from}) · ME ${fmtMe} m (n=${cal.n}): altura = ${cal.rawHeight.toFixed(1)} m → ${wave?.waveHeight?.toFixed(1) ?? '…'} m.`
      : `Spanish reading recalibrated to the PT reference (${from}) · ME ${fmtMe} m (n=${cal.n}): height = ${cal.rawHeight.toFixed(1)} m → ${wave?.waveHeight?.toFixed(1) ?? '…'} m.`,
  };
}

export function observedWaveDisclaimer(
  locale: string,
  source: ObservedWave['source'] = 'ih-buoy',
): string {
  const isPt = locale === 'pt';
  if (source === 'wmo-buoy') {
    return isPt
      ? 'Boia ondógrafo (WMO/Copernicus Marine) — altura/período/direcção medidos ao largo; a onda na praia pode diferir.'
      : 'WMO waverider buoy (Copernicus Marine) — height/period/direction measured offshore; the wave at the beach may differ.';
  }
  return isPt
    ? 'Boia ondógrafo do IH (Instituto Hidrográfico) — altura/período/direcção medidos ao largo; a onda na praia pode diferir.'
    : 'IH waverider buoy (Instituto Hidrográfico) — height/period/direction measured offshore; the wave at the beach may differ.';
}

export type WaveVerificationAgreement = 'match' | 'near' | 'off';

export interface WaveVerification {
  deltaM: number;
  agreement: WaveVerificationAgreement;
  forecastM: number;
  observedM: number;
}

const MATCH_M = 0.3;
const NEAR_M = 0.7;

/** Compare the model wave height against the buoy reading (m). */
export function verifyWave(forecastM: number, observedM: number): WaveVerification {
  const rounded = (n: number) => Math.round(n * 10) / 10;
  const deltaM = rounded(observedM - forecastM);
  const abs = Math.abs(deltaM);
  let agreement: WaveVerificationAgreement = 'off';
  if (abs <= MATCH_M) agreement = 'match';
  else if (abs <= NEAR_M) agreement = 'near';
  return { deltaM, agreement, forecastM, observedM: rounded(observedM) };
}

export function waveVerificationBadge(
  agreement: WaveVerificationAgreement,
  locale: string,
): { label: string; className: string; symbol: string } {
  const isPt = locale === 'pt';
  switch (agreement) {
    case 'match':
      return {
        symbol: '✓',
        label: isPt ? 'Converge' : 'Match',
        className: 'border-score-good/40 bg-score-good/10 text-score-good',
      };
    case 'near':
      return {
        symbol: '~',
        label: isPt ? 'Próximo' : 'Near',
        className: 'border-score-fair/40 bg-score-fair/10 text-score-fair',
      };
    default:
      return {
        symbol: '⚠',
        label: isPt ? 'Diverge' : 'Off',
        className: 'border-score-poor/40 bg-score-poor/10 text-score-poor',
      };
  }
}
