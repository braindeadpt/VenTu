import type { TideHourPoint } from '@/lib/tideSchedule';
import { parseEnsemble, type EnsembleBand } from '@/lib/ensembleBand';

/**
 * Leitura de uma hora para os instrumentos — normalizada a partir de uma
 * linha de `forecasts/{id}.json` (Record<string, unknown>) ou, em fallback,
 * das `SpotDashboardConditions` actuais (mesmos nomes de campo, m/s).
 */
export interface InstrumentHour {
  windSpeedMs?: number;
  windGustMs?: number;
  windDirectionDeg?: number;
  waveHeightM?: number;
  wavePeriodS?: number;
  waveDirectionDeg?: number;
  swellHeightM?: number;
  swellPeriodS?: number;
  swellDirectionDeg?: number;
  /** Componente de mar de vento — a 2.ª perna de buildSwellTrains. */
  windWaveHeightM?: number;
  tideHeightM?: number;
  waterTempC?: number;
  /**
   * Banda ensemble P10/P50/P90 da hora (`ens` da linha de forecast) — só
   * existe nas horas multi-modelo. Null/ausente = o slot não mostra banda.
   */
  ensemble?: EnsembleBand | null;
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function rowToInstrumentHour(
  row: Record<string, unknown> | null | undefined,
): InstrumentHour | null {
  if (!row) return null;
  return {
    windSpeedMs: num(row.windSpeed),
    windGustMs: num(row.windGust),
    windDirectionDeg: num(row.windDirection),
    waveHeightM: num(row.waveHeight),
    wavePeriodS: num(row.wavePeriod),
    waveDirectionDeg: num(row.waveDirection),
    swellHeightM: num(row.swellHeight),
    swellPeriodS: num(row.swellPeriod),
    swellDirectionDeg: num(row.swellDirection),
    windWaveHeightM: num(row.windWaveHeight),
    tideHeightM: num(row.tideHeight),
    waterTempC: num(row.waterTemp),
    ensemble: parseEnsemble(row.ens),
  };
}

/**
 * Snapshot `conditions` (SpotDashboardConditions) → InstrumentHour.
 * Usado enquanto o ficheiro de previsão não chega e para «agora».
 */
export function conditionsToInstrumentHour(
  c: {
    windSpeed?: number;
    windGust?: number;
    windDirection?: number;
    waveHeight?: number;
    wavePeriod?: number;
    waveDirection?: number;
    swellHeight?: number;
    swellPeriod?: number;
    swellDirection?: number;
    secondarySwellHeight?: number;
    tideHeight?: number;
    waterTemp?: number;
  },
): InstrumentHour {
  return {
    windSpeedMs: c.windSpeed,
    windGustMs: c.windGust,
    windDirectionDeg: c.windDirection,
    waveHeightM: c.waveHeight,
    wavePeriodS: c.wavePeriod,
    waveDirectionDeg: c.waveDirection,
    swellHeightM: c.swellHeight,
    swellPeriodS: c.swellPeriod,
    swellDirectionDeg: c.swellDirection,
    windWaveHeightM: c.secondarySwellHeight,
    tideHeightM: c.tideHeight,
    waterTempC: c.waterTemp,
  };
}

/** Série de maré a partir das linhas quando a prop `tideHourly` não vem. */
export function tidePointsFromRows(
  hours: readonly string[],
  rows: Map<string, Record<string, unknown>> | null,
): TideHourPoint[] {
  if (!rows) return [];
  return hours.map((time) => ({
    time,
    tideHeight: num(rows.get(time)?.tideHeight),
  }));
}
