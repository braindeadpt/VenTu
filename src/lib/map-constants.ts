import type { SportType } from './sportRatings';

export const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
} as const;

export const TILE_ATTRIBUTIONS = {
  carto:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  esri:
    '&copy; <a href="https://www.esri.com/">Esri</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const;

export const DEFAULT_CENTER: [number, number] = [39.5, -8.0];
export const DEFAULT_ZOOM = 6;
export const MAX_ZOOM = 19;

export const MAP_CLUSTER_LS_KEY = 'ventu.map.cluster';

export const CLUSTER_CONFIG = {
  chunkedLoading: true,
  chunkInterval: 100,
  chunkDelay: 50,
  maxClusterRadius: 60,
  spiderfyOnMaxZoom: true,
  zoomToBoundsOnClick: true,
  showCoverageOnHover: false,
} as const;

export const SCORE_THRESHOLDS: { min: number; cssVar: string }[] = [
  { min: 85, cssVar: '--score-epic' },
  { min: 70, cssVar: '--score-good' },
  { min: 50, cssVar: '--score-fair' },
  { min: 30, cssVar: '--score-poor' },
  { min: 0, cssVar: '--score-closed' },
];

export function getScoreThreshold(score: number): { min: number; cssVar: string } {
  for (const t of SCORE_THRESHOLDS) {
    if (score >= t.min) return t;
  }
  return SCORE_THRESHOLDS[SCORE_THRESHOLDS.length - 1];
}

export function getScoreRgb(score: number): string {
  const threshold = getScoreThreshold(score);
  return `rgb(var(${threshold.cssVar}))`;
}

export const SPORT_CSS_VARS: Record<SportType, string> = {
  surf: '--sport-surf',
  bodyboard: '--sport-bodyboard',
  kitesurf: '--sport-kitesurf',
  windsurf: '--sport-windsurf',
  foil: '--sport-foil',
  sup: '--sport-sup',
  wakeboard: '--sport-wakeboard',
};

export function getSportRgb(sport: SportType): string {
  return `rgb(var(${SPORT_CSS_VARS[sport]}))`;
}

const LEGEND_SCALE_PT = [
  { label: 'Fechado', color: 'rgb(var(--score-closed))' },
  { label: 'Fraco', color: 'rgb(var(--score-poor))' },
  { label: 'Razoável', color: 'rgb(var(--score-fair))' },
  { label: 'Bom', color: 'rgb(var(--score-good))' },
  { label: 'Épico', color: 'rgb(var(--score-epic))' },
];

const LEGEND_SCALE_EN = [
  { label: 'Closed', color: 'rgb(var(--score-closed))' },
  { label: 'Poor', color: 'rgb(var(--score-poor))' },
  { label: 'Fair', color: 'rgb(var(--score-fair))' },
  { label: 'Good', color: 'rgb(var(--score-good))' },
  { label: 'Epic', color: 'rgb(var(--score-epic))' },
];

export function getLegendLabels(locale: string): { label: string; color: string }[] {
  return locale === 'pt' ? LEGEND_SCALE_PT : LEGEND_SCALE_EN;
}
