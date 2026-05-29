/**
 * Ground-truth observations layer (IPMA today; Ecowitt/APDL later).
 * Independent from sport score and multi-model confidence.
 */

export type ObservedSource = 'ipma';

export interface ObservedConditions {
  windSpeedKt: number;
  windDirDeg: number;
  windCardinal: string;
  windCardinalEn?: string;
  tempC?: number;
  stationName: string;
  distanceKm: number;
  observedAt: string;
  source: ObservedSource;
}

export type WindVerificationAgreement = 'match' | 'near' | 'off';

export interface WindVerification {
  deltaKt: number;
  agreement: WindVerificationAgreement;
  forecastWindKt: number;
  observedWindKt: number;
}

const MATCH_KT = 3;
const NEAR_KT = 6;

export function verifyWind(
  forecastWindKt: number,
  observedWindKt: number,
): WindVerification {
  const deltaKt = Math.round(observedWindKt - forecastWindKt);
  const abs = Math.abs(deltaKt);
  let agreement: WindVerificationAgreement = 'off';
  if (abs <= MATCH_KT) agreement = 'match';
  else if (abs <= NEAR_KT) agreement = 'near';

  return {
    deltaKt,
    agreement,
    forecastWindKt: Math.round(forecastWindKt),
    observedWindKt: Math.round(observedWindKt),
  };
}

export function verificationBadge(
  agreement: WindVerificationAgreement,
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

/** Human-readable age since IPMA snapshot. */
export function formatObservedAge(observedAt: string, locale: string): string {
  const ms = Date.now() - new Date(observedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return locale === 'pt' ? 'agora' : 'just now';

  const mins = Math.floor(ms / 60_000);
  if (mins < 60) {
    return locale === 'pt' ? `há ${mins} min` : `${mins} min ago`;
  }
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (locale === 'pt') {
    return rem > 0 ? `há ${hours}h${rem}m` : `há ${hours}h`;
  }
  return rem > 0 ? `${hours}h ${rem}m ago` : `${hours}h ago`;
}

export function forecastWindKtFromMs(windSpeedMs: number): number {
  return Math.round(windSpeedMs * 1.94384);
}
