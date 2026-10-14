import { getScoreTierLabel, type ScoreTier } from '@/lib/sportScore';
import { getScoreTier } from '@/lib/scoreThresholds';

export interface ScoreBand {
  /** Tier canónico — epic | good | fair | poor | closed. */
  key: ScoreTier;
  labelPt: string;
  labelEn: string;
}

/**
 * Banda de um score 0–100 — a banda da nota /10 que se mostra (`nota.ts`:
 * Não dá < 3 ≤ Fraco < 5 ≤ Dá < 7 ≤ Bom < 9 ≤ Muito bom), com os rótulos de
 * `getScoreTierLabel`. Scores fora de 0–100 são clampados aos extremos.
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
