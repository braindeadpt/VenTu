/** CI/script-safe confidence types + pickers (no React / lucide imports). */

export type ConfidenceTier = 'alta' | 'média' | 'baixa';

export interface ConfidenceDetail {
  waveSpread: number;
  windSpread: number;
  waveSpreadPct?: number;
  windSpreadPct?: number;
  combinedSpreadPct?: number;
  degraded?: boolean;
  waveModelCount?: number;
  windModelCount?: number;
}

export interface DailyConfidence {
  date: string;
  confidence: ConfidenceTier;
  waveSpread: number;
  windSpread: number;
  degraded?: boolean;
}

/** Tunable — keep in sync with scripts/lib/forecastConfidence.js */
export const CONFIDENCE_CONFIG = {
  altaMax: 0.15,
  baixaMin: 0.35,
  minSpreadEpsilon: 0.05,
} as const;

export function getConfidenceTier(
  detail?: ConfidenceDetail | null,
  explicit?: ConfidenceTier | null,
): ConfidenceTier {
  if (explicit) return explicit;
  if (!detail) return 'média';
  if (detail.degraded) return 'média';
  const combined = detail.combinedSpreadPct ?? 0;
  if (combined < CONFIDENCE_CONFIG.altaMax) return 'alta';
  if (combined > CONFIDENCE_CONFIG.baixaMin) return 'baixa';
  return 'média';
}

/** Attach confidence fields from conditions.json without widening every callsite. */
export function pickConfidenceFields(raw: {
  confidence?: ConfidenceTier;
  confidenceDetail?: ConfidenceDetail;
  dailyConfidence?: DailyConfidence[];
}): {
  confidence?: ConfidenceTier;
  confidenceDetail?: ConfidenceDetail;
  dailyConfidence?: DailyConfidence[];
} {
  if (!raw.confidence && !raw.confidenceDetail) return {};
  return {
    confidence: raw.confidence,
    confidenceDetail: raw.confidenceDetail,
    dailyConfidence: raw.dailyConfidence,
  };
}
