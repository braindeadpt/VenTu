import { getScoreTokens } from './sportScore';
import type { SportType } from './sportRatings';
import type { BestWindowToday } from './bestWindowToday';

/** @deprecated Use BestWindowToday from bestWindowToday.ts */
export type BestWindow = BestWindowToday & {
  tier: 'epic' | 'good' | 'fair' | 'poor' | 'closed';
};

export function toBestWindowWithTier(window: BestWindowToday): BestWindow {
  return {
    ...window,
    tier: getScoreTokens(window.score).tier,
  };
}

/**
 * Format a window as "10h–14h". When the window crosses midnight
 * (end < start — e.g. "23h–19h") a "(amanhã)"/"(tomorrow)" suffix keeps it
 * from reading as a backwards range — same convention as MagicWindows.
 */
export function formatBestWindowHours(
  window: Pick<BestWindowToday, 'start' | 'end'>,
  locale?: string,
): string {
  const hours = `${String(window.start).padStart(2, '0')}h–${String(window.end).padStart(2, '0')}h`;
  if (window.end < window.start) {
    return `${hours} (${locale === 'pt' ? 'amanhã' : 'tomorrow'})`;
  }
  return hours;
}

/** Return the sport with the highest score from a record. */
export function topSportFromScores(
  scores: Record<SportType, { score: number }>,
): SportType {
  let best: SportType = 'surf';
  let bestScore = -1;
  for (const [sport, s] of Object.entries(scores) as [SportType, { score: number }][]) {
    if (s.score > bestScore) {
      bestScore = s.score;
      best = sport;
    }
  }
  return best;
}
