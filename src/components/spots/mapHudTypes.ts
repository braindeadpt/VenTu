import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapDifficultyFilter } from '@/lib/mapDifficulty';

export interface MapHudSportOption {
  id: GridSportFilter;
  label: string;
  icon: React.ReactNode;
  color: string;
}

export interface MapFullscreenHudProps {
  visible?: boolean;
  isPt: boolean;
  sports: MapHudSportOption[];
  regions: readonly string[];
  selectedSport: GridSportFilter;
  selectedRegion: string;
  spotCount: number;
  onSportChange: (sport: GridSportFilter) => void;
  onRegionChange: (region: string) => void;
  onResetFilters: () => void;
  clearFiltersLabel: string;
  showClearFilters: boolean;
  difficulties: { id: MapDifficultyFilter; label: string }[];
  selectedDifficulty: MapDifficultyFilter;
  onDifficultyChange: (difficulty: MapDifficultyFilter) => void;
  difficultyGroupLabel: string;
}
