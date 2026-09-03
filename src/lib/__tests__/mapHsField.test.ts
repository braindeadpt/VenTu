import { describe, expect, it } from 'vitest';
import { distKm, hsFill, idwHs, collectHsSamples, MAP_HS_BOUNDS, MAP_HS_STEP_DEG } from '@/lib/mapHsField';
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
});
