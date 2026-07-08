import { describe, it, expect } from 'vitest';
import { moonTerminatorPath } from '@/components/ui/MoonIcon';

describe('MoonIcon terminator path', () => {
  it('empty at new moon', () => {
    expect(moonTerminatorPath(16, 16, 14, 0, true)).toBe('');
  });

  it('full circle at full moon', () => {
    const d = moonTerminatorPath(16, 16, 14, 1, true);
    expect(d).toContain('Z');
    expect(d.split('A').length).toBeGreaterThanOrEqual(2);
  });

  it('waxing vs waning paths differ at same illumination', () => {
    const wax = moonTerminatorPath(20, 20, 16, 0.35, true);
    const wane = moonTerminatorPath(20, 20, 16, 0.35, false);
    expect(wax).not.toBe(wane);
  });
});
