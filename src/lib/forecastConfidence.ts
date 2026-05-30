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

const LABELS: Record<
  import('@/lib/forecastConfidenceCore').ConfidenceTier,
  { pt: string; en: string }
> = {
  alta: { pt: 'Alta', en: 'High' },
  média: { pt: 'Média', en: 'Medium' },
  baixa: { pt: 'Baixa', en: 'Low' },
};

const EXPLAIN: Record<
  import('@/lib/forecastConfidenceCore').ConfidenceTier,
  { pt: string; en: string }
> = {
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

export function getConfidenceLabel(
  tier: import('@/lib/forecastConfidenceCore').ConfidenceTier,
  isPt: boolean,
): string {
  return LABELS[tier][isPt ? 'pt' : 'en'];
}

export function getConfidenceExplain(
  tier: import('@/lib/forecastConfidenceCore').ConfidenceTier,
  isPt: boolean,
): string {
  return EXPLAIN[tier][isPt ? 'pt' : 'en'];
}

export function getConfidenceTooltip(isPt: boolean): string {
  return TOOLTIP[isPt ? 'pt' : 'en'];
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
