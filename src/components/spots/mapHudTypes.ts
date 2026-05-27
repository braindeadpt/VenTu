import type { GridSportFilter } from '@/lib/sportRatings';

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
}
