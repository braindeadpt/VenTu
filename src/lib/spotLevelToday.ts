import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { WindSafetyLevel } from '@/lib/sportScore';

export type SpotLevelTodayTone = 'good' | 'warn';

export type SpotLevelTodayCopy = {
  tone: SpotLevelTodayTone;
  messagePt: string;
  messageEn: string;
};

export interface SpotLevelTodayContext {
  /** Altura significativa da onda (m). Acima de 1.6 m em surf/bodyboard não é dia para iniciantes (#459). */
  waveHeight?: number | null;
  sport?: SportType;
  /** Vento forte «Só profissionais» (kite ≥ 30 kt). */
  soProfissionais?: boolean;
  /** Segurança de direcção do vento (offshore / side-offshore). */
  seguranca?: WindSafetyLevel | null;
}

export const MAX_WAVE_BEGINNER_M = 1.6;

/** Onda acima do limite seguro de aprendizagem (1,6 m em surf/bodyboard, #459). */
export function ondaExcedeLimiteIniciante(
  waveHeight: number | null | undefined,
  sport?: SportType,
): boolean {
  const isWaveSport = !sport || sport === 'surf' || sport === 'bodyboard';
  return isWaveSport && typeof waveHeight === 'number' && Number.isFinite(waveHeight) && waveHeight > MAX_WAVE_BEGINNER_M;
}

export function resolveSpotLevelToday(
  difficulty: Spot['difficulty'],
  score: number,
  ctx?: SpotLevelTodayContext,
): SpotLevelTodayCopy | null {
  const isBeginnerSpot = difficulty === 'beginner' || difficulty === 'all';
  const isHardSpot = difficulty === 'advanced' || difficulty === 'expert';
  const bigWave = ondaExcedeLimiteIniciante(ctx?.waveHeight, ctx?.sport);
  const windHazard = Boolean(ctx?.soProfissionais) || ctx?.seguranca === 'offshore';

  if (bigWave || windHazard) {
    return {
      tone: 'warn',
      messagePt: 'Hoje não é dia para iniciantes aqui',
      messageEn: 'Not a beginner day here today',
    };
  }

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
