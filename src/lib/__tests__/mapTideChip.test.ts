import { describe, expect, it } from 'vitest';
import { mapTideChipAt, pickMapTideCurve } from '@/lib/mapTideChip';
import type { MapTideCurve } from '@/lib/mapHours';

function sineCurve(startHour = 8): MapTideCurve {
  const times: string[] = [];
  const height: number[] = [];
  for (let i = 0; i < 48; i++) {
    const h = startHour + i;
    const day = 3 + Math.floor(h / 24);
    const hh = String(h % 24).padStart(2, '0');
    times.push(`2026-09-${String(day).padStart(2, '0')}T${hh}:00`);
    height.push(Math.sin((i / 12) * Math.PI));
  }
  return { spotId: 'guincho', times, height };
}

describe('pickMapTideCurve', () => {
  const lisboa = sineCurve();
  const norte: MapTideCurve = { ...sineCurve(), spotId: 'matosinhos' };

  it('prefers the selected macro-region, else Lisboa', () => {
    const tides = { Norte: norte, Lisboa: lisboa };
    expect(pickMapTideCurve(tides, 'Norte')?.spotId).toBe('matosinhos');
    expect(pickMapTideCurve(tides, 'Todos')?.spotId).toBe('guincho');
    expect(pickMapTideCurve(tides, 'Algarve')?.spotId).toBe('guincho');
    expect(pickMapTideCurve(undefined, 'Lisboa')).toBeNull();
  });
});

describe('mapTideChipAt', () => {
  const curve = sineCurve();

  it('at 08:30 is rising toward the next high', () => {
    const chip = mapTideChipAt(curve, new Date('2026-09-03T08:30:00+01:00'));
    expect(chip).not.toBeNull();
    expect(chip!.phase).toBe('rising');
    expect(chip!.nextKind).toBe('high');
    expect(chip!.nextTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it('at 17:00 is falling and the next clock is not the morning high', () => {
    const morning = mapTideChipAt(curve, new Date('2026-09-03T08:00:00+01:00'));
    const afternoon = mapTideChipAt(curve, new Date('2026-09-03T17:00:00+01:00'));
    expect(afternoon!.phase).toBe('falling');
    expect(afternoon!.nextKind).toBe('low');
    expect(afternoon!.nextTime).not.toBe(morning!.nextTime);
  });
});
