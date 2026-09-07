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

type DifficultyLocale = 'pt' | 'en' | 'es' | 'de' | 'fr';

const DIFFICULTY_LABELS: Record<
  Spot['difficulty'],
  Record<DifficultyLocale, string>
> = {
  beginner: {
    pt: 'Iniciante',
    en: 'Beginner',
    es: 'Principiante',
    de: 'Anfänger',
    fr: 'Débutant',
  },
  intermediate: {
    pt: 'Intermédio',
    en: 'Intermediate',
    es: 'Intermedio',
    de: 'Fortgeschritten',
    fr: 'Intermédiaire',
  },
  advanced: {
    pt: 'Avançado',
    en: 'Advanced',
    es: 'Avanzado',
    de: 'Erfahren',
    fr: 'Avancé',
  },
  expert: {
    pt: 'Expert',
    en: 'Expert',
    es: 'Experto',
    de: 'Experte',
    fr: 'Expert',
  },
  all: {
    pt: 'Todos os níveis',
    en: 'All levels',
    es: 'Todos los niveles',
    de: 'Alle Level',
    fr: 'Tous les niveaux',
  },
};

/**
 * Localized difficulty label. Accepts boolean (legacy isPt) or locale string.
 * ES/DE/FR keys mirror `spots.*` in translations/.
 */
export function getDifficultyLabel(
  difficulty: Spot['difficulty'],
  localeOrIsPt: boolean | string = 'pt',
): string {
  const locale: DifficultyLocale =
    typeof localeOrIsPt === 'boolean'
      ? localeOrIsPt
        ? 'pt'
        : 'en'
      : localeOrIsPt === 'es' ||
          localeOrIsPt === 'de' ||
          localeOrIsPt === 'fr' ||
          localeOrIsPt === 'en' ||
          localeOrIsPt === 'pt'
        ? localeOrIsPt
        : 'en';
  return DIFFICULTY_LABELS[difficulty]?.[locale] ?? difficulty;
}

/** Localized map HUD difficulty filter options (id + label). */
export function getMapDifficultyOptions(locale: string): {
  id: MapDifficultyFilter;
  label: string;
}[] {
  const loc =
    locale === 'pt' || locale === 'en' || locale === 'es' || locale === 'de' || locale === 'fr'
      ? locale
      : 'en';
  const allShort: Record<DifficultyLocale, string> = {
    pt: 'Todos',
    en: 'All levels',
    es: 'Todos',
    de: 'Alle',
    fr: 'Tous',
  };
  return MAP_DIFFICULTY_OPTIONS.map((o) => ({
    id: o.id,
    label:
      o.id === 'all'
        ? allShort[loc]
        : DIFFICULTY_LABELS[o.id as Spot['difficulty']][loc],
  }));
}
