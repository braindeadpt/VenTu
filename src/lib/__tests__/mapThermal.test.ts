import { describe, expect, it } from 'vitest';
import {
  detectThermal,
  thermalCode,
  thermalFromCode,
  thermalHudAt,
  THERMAL_HUD_MIN_SPOTS,
  THERMAL_SEA,
  THERMAL_LAND,
} from '@/lib/mapThermal';
import type { MapHoursFile } from '@/lib/mapHours';

const guinchoCoast = 270;

describe('mapThermal', () => {
  it('badges sea breeze only with afternoon ΔT + onshore wind', () => {
    expect(
      detectThermal({
        lisbonHour: 17,
        airTemp: 28,
        sst: 18,
        windSpeedMs: 8,
        windDirection: 270,
        coastOrientation: guinchoCoast,
      }),
    ).toBe('sea');
  });

  it('does not badge térmico from wind and hour alone', () => {
    expect(
      detectThermal({
        lisbonHour: 17,
        airTemp: 18.5,
        sst: 18,
        windSpeedMs: 8,
        windDirection: 270,
        coastOrientation: guinchoCoast,
      }),
    ).toBeNull();
  });

  it('rejects sea breeze when the wind is offshore', () => {
    expect(
      detectThermal({
        lisbonHour: 17,
        airTemp: 28,
        sst: 18,
        windSpeedMs: 8,
        windDirection: 90,
        coastOrientation: guinchoCoast,
      }),
    ).toBeNull();
  });

  it('badges land breeze at night with reverse ΔT + offshore wind', () => {
    expect(
      detectThermal({
        lisbonHour: 6,
        airTemp: 14,
        sst: 18,
        windSpeedMs: 4,
        windDirection: 90,
        coastOrientation: guinchoCoast,
      }),
    ).toBe('land');
  });

  it('needs finite air temperature', () => {
    expect(
      detectThermal({
        lisbonHour: 17,
        airTemp: Number.NaN,
        sst: 18,
        windSpeedMs: 8,
        windDirection: 270,
        coastOrientation: guinchoCoast,
      }),
    ).toBeNull();
  });

  it('HUD chip waits for a cluster of agreeing spots', () => {
    expect(thermalFromCode(thermalCode('sea'))).toBe('sea');
    const ones = Array.from({ length: THERMAL_HUD_MIN_SPOTS - 1 }, () => [THERMAL_SEA]);
    const few: Record<string, number[]> = {};
    ones.forEach((series, i) => {
      few[`s${i}`] = series;
    });
    const file = { thermal: few } as unknown as MapHoursFile;
    expect(thermalHudAt(file, 0)).toBeNull();

    few.sN = [THERMAL_SEA];
    expect(thermalHudAt(file, 0)).toEqual({ kind: 'sea', count: THERMAL_HUD_MIN_SPOTS });

    const land: Record<string, number[]> = {};
    for (let i = 0; i < THERMAL_HUD_MIN_SPOTS; i++) land[`l${i}`] = [THERMAL_LAND];
    expect(thermalHudAt({ thermal: land } as unknown as MapHoursFile, 0)).toEqual({
      kind: 'land',
      count: THERMAL_HUD_MIN_SPOTS,
    });
  });
});
