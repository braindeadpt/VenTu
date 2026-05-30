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

const LABELS: Record<ConfidenceTier, { pt: string; en: string }> = {
  alta: { pt: 'Alta', en: 'High' },
  média: { pt: 'Média', en: 'Medium' },
  baixa: { pt: 'Baixa', en: 'Low' },
};

const EXPLAIN: Record<ConfidenceTier, { pt: string; en: string }> = {
  alta: {
    pt: 'Modelos concordam — boa confiança na previsão.',
    en: 'Models agree — good forecast confidence.',
  },
  média: {
    pt: 'Alguma divergência entre modelos — usa com contexto.',
    en: 'Some model divergence — use with context.',
  },
  baixa: {
    pt: 'Modelos divergem — leva margem de segurança.',
    en: 'Models diverge — allow a safety margin.',
  },
};

const TOOLTIP: Record<'pt' | 'en', string> = {
  pt: 'Confiança baseada na diferença entre modelos meteorológicos (ondas e vento). Não altera o score.',
  en: 'Confidence from spread between weather models (waves and wind). Does not change the score.',
};

export function getConfidenceLabel(tier: ConfidenceTier, isPt: boolean): string {
  return LABELS[tier][isPt ? 'pt' : 'en'];
}

export function getConfidenceExplain(tier: ConfidenceTier, isPt: boolean): string {
  return EXPLAIN[tier][isPt ? 'pt' : 'en'];
}

export function getConfidenceTooltip(isPt: boolean): string {
  return TOOLTIP[isPt ? 'pt' : 'en'];
}

export function getConfidenceTokenClass(tier: ConfidenceTier): string {
  switch (tier) {
    case 'alta':
      return 'text-score-good border-score-good/30 bg-score-good/10';
    case 'baixa':
      return 'text-score-poor border-score-poor/30 bg-score-poor/10';
    default:
      return 'text-score-fair border-score-fair/30 bg-score-fair/10';
  }
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
