import { getTranslation } from '@/lib/i18n';

export type {
  ConfidenceDetail,
  ConfidenceTier,
  DailyConfidence,
} from '@/lib/forecastConfidenceCore';
export {
  CONFIDENCE_CONFIG,
  getConfidenceTier,
  pickConfidenceFields,
} from '@/lib/forecastConfidenceCore';

export function getConfidenceLabel(
  tier: import('@/lib/forecastConfidenceCore').ConfidenceTier,
  locale: string,
): string {
  const t = getTranslation(locale).confidence;
  return { alta: t.altaLabel, média: t.mediaLabel, baixa: t.baixaLabel }[tier];
}

export function getConfidenceExplain(
  tier: import('@/lib/forecastConfidenceCore').ConfidenceTier,
  locale: string,
): string {
  const t = getTranslation(locale).confidence;
  return { alta: t.altaExplain, média: t.mediaExplain, baixa: t.baixaExplain }[tier];
}

export function getConfidenceTooltip(locale: string): string {
  return getTranslation(locale).confidence.tooltip;
}

export function getConfidenceTokenClass(
  tier: import('@/lib/forecastConfidenceCore').ConfidenceTier,
): string {
  switch (tier) {
    case 'alta':
      return 'text-score-good border-score-good/30 bg-score-good/10';
    case 'baixa':
      return 'text-score-poor border-score-poor/30 bg-score-poor/10';
    default:
      return 'text-score-fair border-score-fair/30 bg-score-fair/10';
  }
}
