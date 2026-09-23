import type { ReactNode } from 'react';
import { getTranslation } from '@/lib/i18n';
import { Star, Waves, Wind, Zap, Mountain } from 'lucide-react';
import type { GridSportFilter } from '@/lib/sportRatings';

export const MAP_SPORT_FILTERS: {
  id: GridSportFilter;
  label: string;
  icon: ReactNode;
  color: string;
}[] = [
  { id: 'all', label: 'All', icon: <Star className="w-4 h-4" />, color: 'text-fg' },
  { id: 'surf', label: 'Surf', icon: <Waves className="w-4 h-4" />, color: 'text-sport-surf' },
  { id: 'bodyboard', label: 'Bodyboard', icon: <Waves className="w-4 h-4" />, color: 'text-sport-bodyboard' },
  { id: 'kitesurf', label: 'Kitesurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-kitesurf' },
  { id: 'windsurf', label: 'Windsurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-windsurf' },
  { id: 'big-wave', label: 'Big Wave', icon: <Mountain className="w-4 h-4" />, color: 'text-windDir-offshore' },
  { id: 'foil', label: 'Foil', icon: <Zap className="w-4 h-4" />, color: 'text-sport-foil' },
];

/**
 * Rótulo do filtro: os desportos são nomes próprios (iguais em todas as
 * línguas); só «Todos» vem do dicionário.
 */
export function getMapSportFilterLabel(
  id: GridSportFilter,
  locale: string,
  fallback?: string,
): string {
  if (id === 'all') return getTranslation(locale).homepage.sportAll;
  return fallback ?? MAP_SPORT_FILTERS.find((f) => f.id === id)?.label ?? id;
}
