import type { Spot } from '@/types';

export const MAP_DIFFICULTY_LS_KEY = 'ventu:map:difficulty';

export type MapDifficultyFilter = 'all' | 'beginner' | 'intermediate' | 'advanced';

export const MAP_DIFFICULTY_OPTIONS: {
  id: MapDifficultyFilter;
  labelPt: string;
  labelEn: string;
}[] = [
  { id: 'all', labelPt: 'Todos', labelEn: 'All levels' },
  { id: 'beginner', labelPt: 'Iniciante', labelEn: 'Beginner' },
  { id: 'intermediate', labelPt: 'Intermédio', labelEn: 'Intermediate' },
  { id: 'advanced', labelPt: 'Avançado', labelEn: 'Advanced' },
];

export function readMapDifficultyFromStorage(): MapDifficultyFilter {
  if (typeof window === 'undefined') return 'all';
  try {
    const v = localStorage.getItem(MAP_DIFFICULTY_LS_KEY);
    if (v && MAP_DIFFICULTY_OPTIONS.some((o) => o.id === v)) {
      return v as MapDifficultyFilter;
    }
  } catch {
    /* noop */
  }
  return 'all';
}

export function spotMatchesDifficultyFilter(
  spot: Pick<Spot, 'difficulty'>,
  filter: MapDifficultyFilter,
): boolean {
  if (filter === 'all') return true;
  if (spot.difficulty === 'all') return true;
  if (filter === 'beginner') return spot.difficulty === 'beginner';
  if (filter === 'intermediate') return spot.difficulty === 'intermediate';
  if (filter === 'advanced') {
    return spot.difficulty === 'advanced' || spot.difficulty === 'expert';
  }
  return true;
}

/** Marker ring colour for difficulty badge. */
export function getDifficultyMarkerColor(difficulty: Spot['difficulty']): string {
  switch (difficulty) {
    case 'beginner':
      return 'rgb(var(--score-good))';
    case 'intermediate':
      return 'rgb(var(--score-fair))';
    case 'advanced':
    case 'expert':
      return 'rgb(var(--score-poor))';
    default:
      return 'rgb(var(--fg-muted))';
  }
}

export function getDifficultyLabel(
  difficulty: Spot['difficulty'],
  isPt: boolean,
): string {
  const labels: Record<Spot['difficulty'], { pt: string; en: string }> = {
    beginner: { pt: 'Iniciante', en: 'Beginner' },
    intermediate: { pt: 'Intermédio', en: 'Intermediate' },
    advanced: { pt: 'Avançado', en: 'Advanced' },
    expert: { pt: 'Expert', en: 'Expert' },
    all: { pt: 'Todos os níveis', en: 'All levels' },
  };
  return labels[difficulty]?.[isPt ? 'pt' : 'en'] ?? difficulty;
}
