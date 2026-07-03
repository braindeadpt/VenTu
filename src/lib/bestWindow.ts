import { getScoreTokens, type SportScore } from './sportScore';
import type { SportType } from './sportRatings';

export interface BestWindow {
  /** Hour of day in Europe/Lisbon, 0–23. */
  startHour: number;
  /** Inclusive end hour. */
  endHour: number;
  /** Hour with the highest score in the window. */
  peakHour: number;
  /** Best score inside the window. */
  score: number;
  /** Sport used for the calculation. */
  sport: SportType;
  /** Tier label ('epic' | 'good' | 'fair' | 'poor' | 'closed'). */
  tier: 'epic' | 'good' | 'fair' | 'poor' | 'closed';
}

/**
 * Heuristic "best window" for the rest of today.
 *
 * We don't have per-hour forecast data on the public bundle (the runtime
 * Open-Meteo client keeps it local). This function returns an approximate
 * window based on the current score, hour-of-day and typical surf/wind
 * diurnal patterns in Portugal. The label "Estimativa" in the UI keeps this
 * honest.
 *
 * Heuristic: daytime windows tend to be wider because the wind regime is
 * more settled; dawn / dusk are tighter peaks. Score tier dictates how
 * confidently we report a window.
 */
export function estimateBestWindow(
  score: number,
  sport: SportType,
  now: Date = new Date(),
  timeZone = 'Europe/Lisbon',
): BestWindow | null {
  if (score <= 0) return null;
  if (score < 40) return null;

  const lisbonHour = Number(
    new Intl.DateTimeFormat('pt-PT', { hour: 'numeric', hour12: false, timeZone }).format(now),
  );

  const tier = getScoreTokens(score).tier;

  // Picked by tier. Dawn → 2h window, mid-day → 5h, marginal → 3h.
  let startHour: number;
  let endHour: number;
  let peakHour: number;

  if (tier === 'epic' || tier === 'good') {
    // Best surf: dawn / late afternoon, peak around now.
    if (lisbonHour < 8) {
      startHour = Math.max(5, lisbonHour);
      endHour = Math.min(11, lisbonHour + 4);
      peakHour = Math.min(endHour, Math.max(startHour, lisbonHour + 1));
    } else if (lisbonHour < 14) {
      startHour = Math.max(8, lisbonHour - 1);
      endHour = Math.min(19, lisbonHour + 4);
      peakHour = lisbonHour;
    } else if (lisbonHour < 20) {
      startHour = lisbonHour;
      endHour = Math.min(22, lisbonHour + 3);
      peakHour = lisbonHour;
    } else {
      // Night — push to tomorrow morning.
      startHour = 7;
      endHour = 11;
      peakHour = 9;
    }
  } else if (tier === 'fair') {
    // Marginal: tighter window centred on the best diurnal moment.
    if (lisbonHour < 12) {
      startHour = 10;
      endHour = 15;
      peakHour = 13;
    } else {
      startHour = 14;
      endHour = 18;
      peakHour = 16;
    }
  } else {
    return null;
  }

  return {
    startHour,
    endHour,
    peakHour,
    score,
    sport,
    tier,
  };
}

/** Format a window as "10h–14h" (PT/EN locale-agnostic). */
export function formatBestWindowHours(window: BestWindow): string {
  return `${String(window.startHour).padStart(2, '0')}h–${String(window.endHour).padStart(2, '0')}h`;
}

/** Return the sport with the highest score from a record. */
export function topSportFromScores(scores: Record<SportType, SportScore>): SportType {
  let best: SportType = 'surf';
  let bestScore = -1;
  for (const [sport, s] of Object.entries(scores) as [SportType, SportScore][]) {
    if (s.score > bestScore) {
      bestScore = s.score;
      best = sport;
    }
  }
  return best;
}
