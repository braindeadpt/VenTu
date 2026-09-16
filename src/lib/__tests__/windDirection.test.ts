import { describe, expect, it } from 'vitest';
import { directionInSectorList } from '@/lib/wind';

describe('directionInSectorList', () => {
  it('matches a cardinal inside the sector', () => {
    expect(directionInSectorList(270, 'W, NW')).toBe(true);   // exact W
    expect(directionInSectorList(315, 'W, NW')).toBe(true);   // exact NW
    expect(directionInSectorList(292, 'W, NW')).toBe(true);   // WNW sits between W and NW
  });

  it('rejects a direction outside the sector', () => {
    expect(directionInSectorList(90, 'W, NW')).toBe(false);   // E — opposite
    expect(directionInSectorList(200, 'W, NW')).toBe(false);  // SSW — off the sector
  });

  it('wraps across 0°/360°', () => {
    expect(directionInSectorList(350, 'N')).toBe(true);       // 350 ∈ N ±22.5
    expect(directionInSectorList(10, 'N')).toBe(true);
    expect(directionInSectorList(45, 'N')).toBe(false);       // NE, not N
  });

  it('returns null when the spec has no cardinal (Rio, Lagoa)', () => {
    expect(directionInSectorList(90, 'Lagoa')).toBeNull();
    expect(directionInSectorList(90, undefined)).toBeNull();
  });
});
