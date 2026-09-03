import { describe, expect, it } from 'vitest';
import { distKm, hsFill, hsNorm, idwHs, collectHsSamples, coastFalloff, landAwareFalloff, fieldMaxDistKm, isOceanFieldSpot, MAP_HS_BOUNDS, MAP_HS_STEP_DEG } from '@/lib/mapHsField';
import type { MapHoursFile } from '@/lib/mapHours';

describe('mapHsField', () => {
  it('IDW is closer to the nearer sample', () => {
    const samples = [
      { lat: 38.73, lon: -9.47, hs: 2 },
      { lat: 41.15, lon: -8.68, hs: 0.5 },
    ];
    const nearGuincho = idwHs(samples, 38.74, -9.48, 80);
    expect(nearGuincho).not.toBeNull();
    expect(nearGuincho!).toBeGreaterThan(1.4);
    expect(nearGuincho!).toBeLessThan(2.05);
  });

  it('returns null beyond max distance', () => {
    const samples = [{ lat: 38.73, lon: -9.47, hs: 2 }];
    expect(idwHs(samples, 32.6, -16.9, 80)).toBeNull();
  });

  it('hsFill maps 0.4 / 1.2 / 2.4 to distinct hues, not one cyan with opacity', () => {
    expect(hsFill(0).a).toBe(0);
    const low = hsFill(0.4);
    const mid = hsFill(1.2);
    const high = hsFill(2.4);
    const luma = (c: { r: number; g: number; b: number }) =>
      0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(luma(low)).toBeLessThan(luma(mid) - 18);
    expect(luma(mid)).toBeLessThan(luma(high) - 18);
    expect(high.r).toBeGreaterThan(mid.r + 20);
    expect(low.g).toBeLessThan(mid.g);
    expect(mid.a).toBeGreaterThan(low.a);
    expect(high.a).toBeGreaterThan(mid.a);
    expect(luma(hsFill(0.6))).toBeLessThan(luma(hsFill(0.9)) - 8);
  });

  it('hsNorm spreads typical summer 0.6–1.1 m, not a 2.4 m linear wash', () => {
    expect(hsNorm(0.45)).toBeCloseTo(0.12, 5);
    expect(hsNorm(0.75)).toBeCloseTo(0.5, 5);
    expect(hsNorm(1.1)).toBeCloseTo(0.72, 5);
    expect(hsNorm(2.4)).toBe(1);
    expect(hsNorm(0.9) - hsNorm(0.6)).toBeGreaterThan(0.2);
  });

  it('collectHsSamples follows the hour index', () => {
    const file = {
      generatedAt: '2026-09-03T07:00:00.000Z',
      stepHours: 3,
      times: ['2026-09-03T08:00', '2026-09-03T11:00', '2026-09-03T14:00', '2026-09-03T17:00'],
      sports: ['surf'],
      spots: {},
      hs: { guincho: [0.4, 0.8, 1.2, 2.4] },
    } as unknown as MapHoursFile;
    const spots = [{ id: 'guincho', lat: 38.73, lon: -9.47 }];
    expect(collectHsSamples(file, spots, 0)[0]?.hs).toBe(0.4);
    expect(collectHsSamples(file, spots, 3)[0]?.hs).toBe(2.4);
  });

  it('distKm of a point to itself is 0', () => {
    const p = { lat: 38.73, lon: -9.47 };
    expect(distKm(p, p)).toBe(0);
  });

  it('mainland grid is fine enough not to render as stacked coins', () => {
    const box = MAP_HS_BOUNDS[0];
    const cols = Math.ceil((box.east - box.west) / MAP_HS_STEP_DEG);
    const rows = Math.ceil((box.north - box.south) / MAP_HS_STEP_DEG);
    expect(cols).toBeGreaterThanOrEqual(40);
    expect(rows).toBeGreaterThanOrEqual(60);
  });

  it('coastFalloff is 1 near samples and 0 at max distance', () => {
    expect(coastFalloff(0, 38)).toBe(1);
    expect(coastFalloff(8, 38)).toBe(1);
    expect(coastFalloff(38, 38)).toBe(0);
    expect(coastFalloff(30, 38)).toBeGreaterThan(0);
    expect(coastFalloff(30, 38)).toBeLessThan(coastFalloff(20, 38));
  });

  it('landAwareFalloff keeps ocean and kills inland cells', () => {
    const guincho = { lat: 38.73, lon: -9.47 };
    const ocean = landAwareFalloff(38.73, -9.95, guincho, 8, 38, 'mainland');
    const inland = landAwareFalloff(38.73, -8.55, guincho, 8, 38, 'mainland');
    expect(ocean).toBeGreaterThan(0.9);
    expect(inland).toBeLessThan(0.35);
    expect(fieldMaxDistKm('madeira')).toBeLessThan(fieldMaxDistKm('mainland'));
  });

  it('skips inland wake/lagoa spots in the ocean field', () => {
    expect(isOceanFieldSpot({ type: 'surf', bestSwell: 'NW' })).toBe(true);
    expect(isOceanFieldSpot({ type: 'wakeboard', bestSwell: 'Lagoa' })).toBe(false);
    const file = {
      generatedAt: '2026-09-03T07:00:00.000Z',
      stepHours: 3,
      times: ['2026-09-03T08:00'],
      sports: ['surf'],
      spots: {},
      hs: { alqueva: [1.2], guincho: [1.2] },
    } as unknown as MapHoursFile;
    const samples = collectHsSamples(
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
});
