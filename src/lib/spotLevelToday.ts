import type { Spot } from '@/types';

export type SpotLevelTodayTone = 'good' | 'warn';

/**
 * Resolve o tom da pill «nível do dia» no hero — a copy vive no dicionário
 * (spotPageVerdict.levelToday{Good,Warn}{,Short}): a versão curta é usada
 * na linha do score em <sm.
 */
export function resolveSpotLevelToday(
  difficulty: Spot['difficulty'],
  score: number,
): SpotLevelTodayTone | null {
  const isBeginnerSpot = difficulty === 'beginner' || difficulty === 'all';
  const isHardSpot = difficulty === 'advanced' || difficulty === 'expert';

  if (isBeginnerSpot && score >= 55) return 'good';
  if (isHardSpot || score < 40 || (difficulty === 'intermediate' && score < 50)) {
    return 'warn';
  }
  return null;
}
