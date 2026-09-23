import { tierPhrase } from '@/lib/voice';
import { getTranslation } from '@/lib/i18n';

/** Micro-copy on SpotListCard hover (inclusive PT-PT tone). */
export function getSpotListCardHoverLine(score: number, locale: string): string | null {
  const phrase = tierPhrase(score, locale);
  if (score >= 80) {
    return `${phrase} 🤙`;
  }
  if (score >= 60) {
    return `${phrase} ${getTranslation(locale).mapNarrative.delightWorth}`;
  }
  if (score < 40) {
    return phrase;
  }
  return getTranslation(locale).mapNarrative.delightSee;
}
