import { describe, expect, it } from 'vitest';
import {
  currentFill,
  dirFromUv,
  idwCurrent,
  uvFromSpdDir,
  collectCurrentSamples,
} from '@/lib/mapCurrentsField';
import type { MapHoursFile } from '@/lib/mapHours';

describe('mapCurrentsField', () => {
  it('reconstructs compass-towards from u/v', () => {
    const north = uvFromSpdDir(0.2, 0);
    expect(north.v).toBeGreaterThan(north.u);
    expect(dirFromUv(north.u, north.v)).toBeCloseTo(0, 5);

    const east = uvFromSpdDir(0.2, 90);
    expect(east.u).toBeGreaterThan(east.v);
    expect(dirFromUv(east.u, east.v)).toBeCloseTo(90, 5);
  });

  it('IDW of 350° and 10° stays near north, not south', () => {
    const samples = [
      { lat: 38.73, lon: -9.50, spd: 0.2, dir: 350 },
      { lat: 38.73, lon: -9.44, spd: 0.2, dir: 10 },
    ];
    const mid = idwCurrent(samples, 38.73, -9.47, 80);
    expect(mid).not.toBeNull();
    expect(mid!.spd).toBeGreaterThan(0.15);
    const dir = mid!.dir;
    expect(dir > 340 || dir < 20).toBe(true);
  });

  it('returns null beyond max distance', () => {
    const samples = [{ lat: 38.73, lon: -9.47, spd: 0.2, dir: 180 }];
    expect(idwCurrent(samples, 32.6, -16.9, 80)).toBeNull();
  });

  it('currentFill stays water-cyan and transparent at slack', () => {
    expect(currentFill(0).a).toBe(0);
    const mid = currentFill(0.2);
    expect(mid.r).toBe(34);
    expect(mid.b).toBe(238);
    expect(mid.a).toBeGreaterThan(currentFill(0.05).a);
  });

  it('collectCurrentSamples follows the hour index', () => {
    const file = {
      generatedAt: '2026-09-03T07:00:00.000Z',
      stepHours: 3,
      times: ['2026-09-03T08:00', '2026-09-03T11:00', '2026-09-03T14:00', '2026-09-03T17:00'],
      sports: ['surf'],
      spots: {},
      currents: {
        guincho: { spd: [0.08, 0.12, 0.18, 0.27], dir: [180, 180, 190, 200] },
      },
    } as unknown as MapHoursFile;
    const spots = [{ id: 'guincho', lat: 38.73, lon: -9.47 }];
    expect(collectCurrentSamples(file, spots, 0)[0]?.spd).toBe(0.08);
    expect(collectCurrentSamples(file, spots, 3)[0]?.dir).toBe(200);
  });

  it('skips inland wake spots when collecting currents', () => {
    const file = {
      generatedAt: '2026-09-03T07:00:00.000Z',
      stepHours: 3,
      times: ['2026-09-03T08:00'],
      sports: ['surf'],
      spots: {},
      currents: {
        alqueva: { spd: [0.2], dir: [90] },
        guincho: { spd: [0.2], dir: [180] },
      },
    } as unknown as MapHoursFile;
    const samples = collectCurrentSamples(
      file,
      [
        { id: 'alqueva', lat: 38.2, lon: -7.5, type: 'wakeboard', bestSwell: 'Lagoa' },
        { id: 'guincho', lat: 38.73, lon: -9.47, type: 'surf' },
      ],
      0,
    );
    expect(samples).toHaveLength(1);
    expect(samples[0].dir).toBe(180);
  });
});
