import type { Spot } from '@/types';

export type SpotLevelTodayTone = 'good' | 'warn';

export type SpotLevelTodayCopy = {
  tone: SpotLevelTodayTone;
  messagePt: string;
  messageEn: string;
};

export function resolveSpotLevelToday(
  difficulty: Spot['difficulty'],
  score: number,
): SpotLevelTodayCopy | null {
  const isBeginnerSpot = difficulty === 'beginner' || difficulty === 'all';
  const isHardSpot = difficulty === 'advanced' || difficulty === 'expert';

  if (isBeginnerSpot && score >= 55) {
    return {
      tone: 'good',
      messagePt: 'Bom para aprender hoje',
      messageEn: 'Good day to learn here',
    };
  }

  if (isHardSpot || score < 40 || (difficulty === 'intermediate' && score < 50)) {
    return {
      tone: 'warn',
      messagePt: 'Hoje não é dia para iniciantes aqui',
      messageEn: 'Not a beginner day here today',
    };
  }

  return null;
}
