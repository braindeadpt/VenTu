import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapDifficultyFilter } from '@/lib/mapDifficulty';
import type { MapPele } from '@/lib/mapPele';

export interface MapHudSportOption {
  id: GridSportFilter;
  label: string;
  icon: React.ReactNode;
  color: string;
}

export interface MapFullscreenHudProps {
  visible?: boolean;
  /** Locale do site — toda a copy dos painéis vem do dicionário. */
  locale: string;
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
  /** Rótulo «Camadas» — usado por superfícies que agrupam as camadas de dados. */
  layersLabel?: string;
  /** Pele v6 da fase B (`?pele=v6`): só copy/atributos; `null`/ausente = o /mapa de hoje. */
  pele?: MapPele | null;
  /** B6: recolor da base «Mapa» (`?pele=v6&pelebase=v6`); só conta com a pele. */
  peleBase?: boolean;
}
