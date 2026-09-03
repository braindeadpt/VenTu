import { describe, expect, it } from 'vitest';
import { distKm, hsFill, idwHs, collectHsSamples, coastFalloff, landAwareFalloff, fieldMaxDistKm, isOceanFieldSpot, MAP_HS_BOUNDS, MAP_HS_STEP_DEG } from '@/lib/mapHsField';
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

  it('hsFill stays cyan and transparent at ~0 m', () => {
    expect(hsFill(0).a).toBe(0);
    const mid = hsFill(2);
    expect(mid.r).toBe(14);
    expect(mid.b).toBe(233);
    expect(mid.a).toBeGreaterThan(hsFill(0.5).a);
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
