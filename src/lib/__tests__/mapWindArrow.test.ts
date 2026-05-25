import { describe, it, expect } from 'vitest';
import { windBlowsToDegrees, windArrowOpacity, buildMapWindArrowSvg } from '../mapWindArrow';

describe('mapWindArrow', () => {
  it('wind blows opposite to meteo from', () => {
    expect(windBlowsToDegrees(0)).toBe(180);
    expect(windBlowsToDegrees(90)).toBe(270);
  });

  it('opacity scales with speed', () => {
    expect(windArrowOpacity(2)).toBeLessThan(windArrowOpacity(20));
  });

  it('builds svg with rotation', () => {
    const svg = buildMapWindArrowSvg(0, 15);
    expect(svg).toContain('rotate(180deg)');
    expect(svg).toContain('<svg');
  });
});
