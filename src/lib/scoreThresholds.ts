/**
 * Single source of truth for score → colour tier (UI, map markers, popups).
 * Must match getScoreTokens() in sportScore.ts.
 */
import type { ScoreTier } from '@/lib/sportScore';
import { SCORE_TIER_THRESHOLDS } from '@/lib/sportScore';

export { SCORE_TIER_THRESHOLDS };

const TIER_CSS_VARS: Record<ScoreTier, string> = {
  epic: '--score-epic',
  good: '--score-good',
  fair: '--score-fair',
  poor: '--score-poor',
  closed: '--score-closed',
};

export function getScoreTier(score: number): ScoreTier {
  if (score >= SCORE_TIER_THRESHOLDS.epic) return 'epic';
  if (score >= SCORE_TIER_THRESHOLDS.good) return 'good';
  if (score >= SCORE_TIER_THRESHOLDS.fair) return 'fair';
  if (score >= SCORE_TIER_THRESHOLDS.poor) return 'poor';
  return 'closed';
}

export function getScoreCssVar(score: number): string {
  return TIER_CSS_VARS[getScoreTier(score)];
}

export function getScoreRgb(score: number): string {
  return `rgb(var(${getScoreCssVar(score)}))`;
}

/** Ordered high→low for map legend. */
export const SCORE_THRESHOLD_STEPS: { min: number; cssVar: string }[] = [
  { min: SCORE_TIER_THRESHOLDS.epic, cssVar: '--score-epic' },
  { min: SCORE_TIER_THRESHOLDS.good, cssVar: '--score-good' },
  { min: SCORE_TIER_THRESHOLDS.fair, cssVar: '--score-fair' },
  { min: SCORE_TIER_THRESHOLDS.poor, cssVar: '--score-poor' },
  { min: 0, cssVar: '--score-closed' },
];
