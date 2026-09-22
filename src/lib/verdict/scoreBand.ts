import { getScoreTierLabel, type ScoreTier } from '@/lib/sportScore';
import { getScoreTier } from '@/lib/scoreThresholds';

export interface ScoreBand {
  /** Tier canónico — epic | good | fair | poor | closed. */
  key: ScoreTier;
  labelPt: string;
  labelEn: string;
}

/**
 * Banda do score 0–100 (ÉPICO 80+, BOM 60+, FUN 40+, FLAT 20+, FECHADO <20) —
 * mesmos limites e rótulos que `getScoreTierLabel`/`getScoreTier`, a fonte
 * canónica do produto. Scores fora de 0–100 são clampados aos extremos.
 */
export function scoreBand(score: number): ScoreBand {
  const clamped = Math.max(0, Math.min(100, score));
  const key = getScoreTier(clamped);
  return {
    key,
    labelPt: getScoreTierLabel(key, 'pt'),
    labelEn: getScoreTierLabel(key, 'en'),
  };
}
