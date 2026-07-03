import { describe, it, expect } from 'vitest';
import { windBlowsToDegrees, windArrowShaftLength, buildMapWindArrowSvg } from '../mapWindArrow';

describe('mapWindArrow', () => {
  it('wind blows opposite to meteo from', () => {
    expect(windBlowsToDegrees(0)).toBe(180);
    expect(windBlowsToDegrees(90)).toBe(270);
  });

  it('shaft length scales with speed', () => {
    expect(windArrowShaftLength(2)).toBeLessThan(windArrowShaftLength(20));
  });

  it('builds 24px svg at full opacity with rotation', () => {
    const svg = buildMapWindArrowSvg(0, 15);
    expect(svg).toContain('rotate(180deg)');
    expect(svg).toContain('width="24"');
    expect(svg).toContain('opacity: 1');
  });
});
