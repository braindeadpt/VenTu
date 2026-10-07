/** Tipos partilhados do protótipo «Mar vivo» (lab, não usado fora daqui). */

/** Spot continental usado como semente da interpolação IDW. */
export interface SeedSpot {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Spot de mar aberto (não lago/albufeira/wake park) — entra na grelha de ondulação. */
  sea: boolean;
}

/**
 * Direcção (de onde vem, °) e período (s) da ondulação primária por spot,
 * tirados de `forecasts.json` no build (passos de 3 h). `map-hours.json` ainda
 * não tem estes campos — ver «Próximos passos» no PR.
 */
export interface SwellSnapshot {
  /** Chaves horárias Lisboa `YYYY-MM-DDTHH`. */
  times: string[];
  dir: Record<string, number[]>;
  per: Record<string, number[]>;
}

export interface ScoreThresholds {
  epic: number;
  good: number;
  fair: number;
  poor: number;
}

export type MarVivoMode = 'both' | 'wind' | 'swell';
