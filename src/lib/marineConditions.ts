/** Shared marine condition fields (static JSON + map + drawer). */
export interface MarineConditionsFields {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
  swellHeight?: number;
  swellPeriod?: number;
  swellDirection?: number;
  windWaveHeight?: number;
  wavePowerKw?: number;
  updatedAt?: string;
  source?: 'real' | 'mock';
  tideHeight?: number;
  tideStatus?: string;
  tideLabel?: string;
  tideObservedHeight?: number;
  tideObservedAt?: string;
  tideStation?: string;
}
