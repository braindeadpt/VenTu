import { hourKeyFromOpenMeteo } from '@/lib/openMeteoTime';
import { getWindRelationToCoast } from '@/lib/wind';
import type { MapHoursFile } from '@/lib/mapHours';

export type ThermalKind = 'sea' | 'land';

export const THERMAL_NONE = 0;
export const THERMAL_SEA = 1;
export const THERMAL_LAND = 2;
/** HUD only when a few neighbouring spots agree — one outlier is not a breeze. */
export const THERMAL_HUD_MIN_SPOTS = 3;

export interface ThermalInput {
  lisbonHour: number;
  airTemp: number;
  sst: number;
  windSpeedMs: number;
  windDirection: number;
  coastOrientation: number;
}

/**
 * Classic PT “térmico” is a sea breeze (afternoon, land hotter, sea → land).
 * Night/morning land breeze is the reverse. No ΔT → no badge.
 */
export function detectThermal(input: ThermalInput): ThermalKind | null {
  const { airTemp, sst, windSpeedMs, windDirection, coastOrientation } = input;
  if (!Number.isFinite(airTemp) || !Number.isFinite(sst)) return null;
  if (!Number.isFinite(windSpeedMs) || !Number.isFinite(windDirection)) return null;
  if (!Number.isFinite(coastOrientation)) return null;

  const hour = ((input.lisbonHour % 24) + 24) % 24;
  const relation = getWindRelationToCoast(windDirection, coastOrientation);

  if (hour >= 11 && hour <= 19) {
    if (
      airTemp - sst >= 2 &&
      relation === 'onshore' &&
      windSpeedMs >= 3.1 &&
      windSpeedMs <= 14
    ) {
      return 'sea';
    }
  }

  if (hour >= 20 || hour <= 8) {
    if (
      sst - airTemp >= 1.5 &&
      relation === 'offshore' &&
      windSpeedMs >= 2 &&
      windSpeedMs <= 8
    ) {
      return 'land';
    }
  }

  return null;
}

export function thermalCode(kind: ThermalKind | null): number {
  if (kind === 'sea') return THERMAL_SEA;
  if (kind === 'land') return THERMAL_LAND;
  return THERMAL_NONE;
}

export function thermalFromCode(n: number): ThermalKind | null {
  if (n === THERMAL_SEA) return 'sea';
  if (n === THERMAL_LAND) return 'land';
  return null;
}

export function lisbonHourFromMapTime(time: string): number {
  const h = Number(hourKeyFromOpenMeteo(time).slice(-2));
  return Number.isFinite(h) ? h : 0;
}

export function thermalHudAt(
  file: MapHoursFile | null | undefined,
  index: number,
): { kind: ThermalKind; count: number } | null {
  if (!file?.thermal || index < 0) return null;
  let sea = 0;
  let land = 0;
  for (const series of Object.values(file.thermal)) {
    if (!series || index >= series.length) continue;
    const kind = thermalFromCode(series[index]);
    if (kind === 'sea') sea += 1;
    else if (kind === 'land') land += 1;
  }
  if (sea >= THERMAL_HUD_MIN_SPOTS && sea >= land) return { kind: 'sea', count: sea };
  if (land >= THERMAL_HUD_MIN_SPOTS) return { kind: 'land', count: land };
  return null;
}
