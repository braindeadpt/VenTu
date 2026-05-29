import type { ReactNode } from 'react';
import { Star, Waves, Wind, Zap, Mountain } from 'lucide-react';
import type { GridSportFilter } from '@/lib/sportRatings';

export const MAP_SPORT_FILTERS: {
  id: GridSportFilter;
  labelPt: string;
  labelEn: string;
  icon: ReactNode;
  color: string;
}[] = [
  { id: 'all', labelPt: 'Todos', labelEn: 'All', icon: <Star className="w-4 h-4" />, color: 'text-fg' },
  { id: 'surf', labelPt: 'Surf', labelEn: 'Surf', icon: <Waves className="w-4 h-4" />, color: 'text-sport-surf' },
  { id: 'bodyboard', labelPt: 'Bodyboard', labelEn: 'Bodyboard', icon: <Waves className="w-4 h-4" />, color: 'text-sport-bodyboard' },
  { id: 'kitesurf', labelPt: 'Kitesurf', labelEn: 'Kitesurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-kitesurf' },
  { id: 'windsurf', labelPt: 'Windsurf', labelEn: 'Windsurf', icon: <Wind className="w-4 h-4" />, color: 'text-sport-windsurf' },
  { id: 'big-wave', labelPt: 'Big Wave', labelEn: 'Big Wave', icon: <Mountain className="w-4 h-4" />, color: 'text-windDir-offshore' },
  { id: 'foil', labelPt: 'Foil', labelEn: 'Foil', icon: <Zap className="w-4 h-4" />, color: 'text-sport-foil' },
];
