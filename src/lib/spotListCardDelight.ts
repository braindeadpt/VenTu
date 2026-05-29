import { tierPhrase } from '@/lib/voice';

/** Micro-copy on SpotListCard hover (inclusive PT-PT tone). */
export function getSpotListCardHoverLine(score: number, isPt: boolean): string | null {
  const phrase = tierPhrase(score, isPt);
  if (score >= 80) {
    return isPt ? `${phrase} 🤙` : `${phrase} 🤙`;
  }
  if (score >= 60) {
    return isPt ? `${phrase} — vale a pena` : `${phrase} — worth a look`;
  }
  if (score < 40) {
    return phrase;
  }
  return isPt ? 'ver condições' : 'see conditions';
}
