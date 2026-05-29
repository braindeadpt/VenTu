import { SCORE_TIER_THRESHOLDS } from '@/lib/scoreThresholds';

/** Micro-copy on SpotListCard hover (PT-PT tone). */
export function getSpotListCardHoverLine(score: number, isPt: boolean): string | null {
  if (score >= SCORE_TIER_THRESHOLDS.epic) {
    return isPt ? 'a bombar 🤙' : 'firing 🤙';
  }
  if (score >= SCORE_TIER_THRESHOLDS.good) {
    return isPt ? 'vale a pena' : 'worth a look';
  }
  if (score < SCORE_TIER_THRESHOLDS.fair) {
    return isPt ? 'mar calmo' : 'calm day';
  }
  return isPt ? 'ver condições' : 'see conditions';
}
