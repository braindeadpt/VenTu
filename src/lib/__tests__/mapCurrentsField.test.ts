import { describe, expect, it } from 'vitest';
import {
  currentFill,
  dirFromUv,
  idwCurrent,
  uvFromSpdDir,
  collectCurrentSamples,
  collectCurrentParticles,
  currentParticleStepDeg,
  currentTickMetrics,
  currentTickOnWater,
  isOpenOceanCurrentSpot,
  type CurrentFieldGrid,
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

  it('skips Tagus/river spots so ticks stay on open ocean', () => {
    const file = {
      generatedAt: '2026-09-03T07:00:00.000Z',
      stepHours: 3,
      times: ['2026-09-03T08:00'],
      sports: ['surf'],
      spots: {},
      currents: {
        'seixal-bay': { spd: [0.2], dir: [90] },
        guincho: { spd: [0.2], dir: [180] },
      },
    } as unknown as MapHoursFile;
    const samples = collectCurrentSamples(
      file,
      [
        { id: 'seixal-bay', lat: 38.746, lon: -8.978, type: 'kitesurf', bestSwell: 'Rio' },
        { id: 'guincho', lat: 38.73, lon: -9.47, type: 'surf', bestSwell: 'NW' },
      ],
      0,
    );
    expect(samples).toHaveLength(1);
    expect(samples[0].dir).toBe(180);
    expect(isOpenOceanCurrentSpot({ type: 'kitesurf', bestSwell: 'Rio' })).toBe(false);
    expect(isOpenOceanCurrentSpot({ type: 'surf', bestSwell: 'NW' })).toBe(true);
  });

  it('currentParticleStepDeg is coarser at country zoom than close-up', () => {
    expect(currentParticleStepDeg(6)).toBeGreaterThan(currentParticleStepDeg(10));
    expect(currentParticleStepDeg(6)).toBeLessThanOrEqual(0.18);
    expect(currentParticleStepDeg(12)).toBeGreaterThanOrEqual(0.018);
  });

  it('currentTickMetrics grows with speed', () => {
    expect(currentTickMetrics(0.4).length).toBeGreaterThan(currentTickMetrics(0.08).length);
    expect(currentTickMetrics(0.4).alpha).toBeGreaterThan(currentTickMetrics(0.08).alpha);
  });

  it('collectCurrentParticles places ticks on flowing cells and skips slack', () => {
    const flowing: CurrentFieldGrid = {
      id: 'mainland',
      south: 38.6,
      west: -9.6,
      north: 38.8,
      east: -9.3,
      cols: 6,
      rows: 6,
      grid: Array.from({ length: 36 }, () => ({
        u: 0,
        v: 0.2,
        spd: 0.2,
        falloff: 1,
        nlat: 38.73,
        nlon: -9.47,
      })),
    };
    const pts = collectCurrentParticles(
      [flowing],
      { south: 38.62, west: -9.55, north: 38.78, east: -9.35 },
      0.04,
    );
    expect(pts.length).toBeGreaterThan(8);
    expect(pts[0].dir).toBeCloseTo(0, 0);

    const slack: CurrentFieldGrid = {
      ...flowing,
      grid: Array.from({ length: 36 }, () => ({
        u: 0,
        v: 0,
        spd: 0,
        falloff: 1,
        nlat: 38.73,
        nlon: -9.47,
      })),
    };
    expect(
      collectCurrentParticles(
        [slack],
        { south: 38.62, west: -9.55, north: 38.78, east: -9.35 },
        0.04,
      ),
    ).toEqual([]);
  });

  it('currentTickOnWater keeps west-coast ocean and drops Lisbon inland', () => {
    const guincho = { lat: 38.73, lon: -9.47 };
    expect(currentTickOnWater(38.73, -9.55, guincho, 0.9, 'mainland')).toBe(true);
    expect(currentTickOnWater(38.72, -9.14, guincho, 0.9, 'mainland')).toBe(false);
    expect(currentTickOnWater(38.94, -9.33, { lat: 38.96, lon: -9.42 }, 0.9, 'mainland')).toBe(false);
    expect(currentTickOnWater(38.73, -9.55, guincho, 0.2, 'mainland')).toBe(false);
  });
});
