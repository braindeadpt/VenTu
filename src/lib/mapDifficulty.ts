import { getTranslation } from '@/lib/i18n';
import type { SportType } from '@/lib/sportRatings';
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

/** Nível escolhido pelo utilizador («Todos» não é um nível — é a ausência de filtro). */
export type NivelUtilizador = Exclude<MapDifficultyFilter, 'all'>;

/**
 * Nível do spot para um desporto: a ficha pode sobrepor a `difficulty` por
 * desporto (`difficultyBySport` — ex.: Guincho é avançado em kite mas
 * intermédio em surf). Sem desporto ou sem entrada para ele, vale a
 * `difficulty` da ficha.
 */
export function nivelDoSpot(
  spot: Pick<Spot, 'difficulty' | 'difficultyBySport'>,
  sport?: SportType,
): Spot['difficulty'] {
  return (sport && spot.difficultyBySport?.[sport]) ?? spot.difficulty;
}

/** «expert» conta como avançado na regra de tecto. */
const ORDEM_NIVEL: Partial<Record<Spot['difficulty'], number>> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  expert: 2,
};
const TETO_NIVEL: Record<NivelUtilizador, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/**
 * Regra de tecto (filtro de nível, #nivel-logica): «Iniciante» mostra
 * iniciante; «Intermédio» mostra iniciante + intermédio; «Avançado» mostra
 * tudo; «Todos» = sem filtro. Um spot com nível 'all', em falta ou
 * desconhecido cabe sempre.
 */
export function spotDentroDoNivel(
  nivelSpot: Spot['difficulty'] | null | undefined,
  filtro: MapDifficultyFilter,
): boolean {
  if (filtro === 'all') return true;
  const n = nivelSpot != null ? ORDEM_NIVEL[nivelSpot] : undefined;
  if (n === undefined) return true;
  return n <= TETO_NIVEL[filtro];
}

export function spotMatchesDifficultyFilter(
  spot: Pick<Spot, 'difficulty' | 'difficultyBySport'>,
  filter: MapDifficultyFilter,
  sport?: SportType,
): boolean {
  return spotDentroDoNivel(nivelDoSpot(spot, sport), filter);
}

/**
 * O nível escolhido guardado em `ventu:map:difficulty`, como
 * `readMapDifficultyFromStorage` mas com `null` para 'all' ou chave ausente
 * («sem nível»).
 */
export function lerNivelEscolhido(): NivelUtilizador | null {
  const v = readMapDifficultyFromStorage();
  return v === 'all' ? null : v;
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
  locale: string,
): string {
  const t = getTranslation(locale).spotMeta;
  const labels: Record<Spot['difficulty'], string> = {
    beginner: t.diffBeginner,
    intermediate: t.diffIntermediate,
    advanced: t.diffAdvanced,
    expert: t.diffExpert,
    all: t.diffAllLevels,
  };
  return labels[difficulty] ?? difficulty;
}

/** Spot classification label — the raw `spot.type` token must never render. */
export function getSpotTypeLabel(type: Spot['type'], locale: string): string {
  const t = getTranslation(locale).spotMeta;
  const labels: Record<Spot['type'], string> = {
    surf: 'Surf',
    kitesurf: 'Kitesurf',
    windsurf: 'Windsurf',
    'big-wave': t.typeBigWave,
    foil: 'Foil',
    multisport: t.typeMultisport,
    wakeboard: 'Wakeboard',
  };
  return labels[type] ?? type;
}
