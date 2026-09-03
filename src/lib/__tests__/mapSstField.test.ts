import { describe, expect, it } from 'vitest';
import {
  sstFill,
  sstNorm,
  idwSst,
  collectSstSamples,
  MAP_SST_MIN,
  MAP_SST_MAX,
} from '@/lib/mapSstField';
import { landAwareFalloff, isOceanFieldSpot } from '@/lib/mapHsField';
import type { MapHoursFile } from '@/lib/mapHours';

describe('mapSstField', () => {
  it('IDW is closer to the nearer sample', () => {
    const samples = [
      { lat: 38.73, lon: -9.47, sst: 22 },
      { lat: 41.15, lon: -8.68, sst: 14 },
    ];
    const nearGuincho = idwSst(samples, 38.74, -9.48, 80);
    expect(nearGuincho).not.toBeNull();
    expect(nearGuincho!).toBeGreaterThan(19);
    expect(nearGuincho!).toBeLessThan(22.1);
  });

  it('returns null beyond max distance', () => {
    const samples = [{ lat: 38.73, lon: -9.47, sst: 18 }];
    expect(idwSst(samples, 32.6, -16.9, 80)).toBeNull();
  });

  it('sstFill goes cyan → amber on the PT scale', () => {
    expect(sstFill(0).a).toBe(0);
    const cold = sstFill(MAP_SST_MIN);
    const warm = sstFill(MAP_SST_MAX);
    expect(cold.r).toBe(34);
    expect(cold.b).toBe(238);
    expect(warm.r).toBe(251);
    expect(warm.b).toBe(36);
    expect(warm.a).toBeGreaterThan(cold.a);
    const mid = sstFill(18);
    expect(mid.r).toBeLessThan(80);
    expect(mid.b).toBeGreaterThan(180);
    expect(sstNorm(18)).toBeCloseTo(0.5, 5);
  });

  it('collectSstSamples follows the hour index', () => {
    const file = {
      generatedAt: '2026-09-03T07:00:00.000Z',
      stepHours: 3,
      times: ['2026-09-03T08:00', '2026-09-03T11:00', '2026-09-03T14:00', '2026-09-03T17:00'],
      sports: ['surf'],
      spots: {},
      sst: { guincho: [14, 16, 18, 22] },
    } as unknown as MapHoursFile;
    const spots = [{ id: 'guincho', lat: 38.73, lon: -9.47 }];
    expect(collectSstSamples(file, spots, 0)[0]?.sst).toBe(14);
    expect(collectSstSamples(file, spots, 3)[0]?.sst).toBe(22);
  });

  it('skips inland wake/lagoa spots in the ocean field', () => {
    expect(isOceanFieldSpot({ type: 'surf', bestSwell: 'NW' })).toBe(true);
    const file = {
      generatedAt: '2026-09-03T07:00:00.000Z',
      stepHours: 3,
      times: ['2026-09-03T08:00'],
      sports: ['surf'],
      spots: {},
      sst: { alqueva: [18], guincho: [18] },
    } as unknown as MapHoursFile;
    const samples = collectSstSamples(
      file,
      [
        { id: 'alqueva', lat: 38.2, lon: -7.5, type: 'wakeboard', bestSwell: 'Lagoa' },
        { id: 'guincho', lat: 38.73, lon: -9.47, type: 'surf', bestSwell: 'NW' },
      ],
      0,
    );
    expect(samples).toHaveLength(1);
    expect(samples[0].lat).toBe(38.73);
  });

  it('landAwareFalloff keeps ocean and kills inland cells', () => {
    const guincho = { lat: 38.73, lon: -9.47 };
    const ocean = landAwareFalloff(38.73, -9.95, guincho, 8, 38, 'mainland');
    const inland = landAwareFalloff(38.73, -8.55, guincho, 8, 38, 'mainland');
    expect(ocean).toBeGreaterThan(0.9);
    expect(inland).toBeLessThan(0.35);
  });
});
