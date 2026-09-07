import { describe, expect, it } from 'vitest';
import { formatBestWindowHours } from '@/lib/bestWindow';

describe('formatBestWindowHours', () => {
  it('formats same-day windows as HHh–HHh', () => {
    expect(formatBestWindowHours({ start: 10, end: 14 })).toBe('10h–14h');
    expect(formatBestWindowHours({ start: 6, end: 9 })).toBe('06h–09h');
  });

  it('marks overnight windows (end ≤ start) with (+1)', () => {
    expect(formatBestWindowHours({ start: 23, end: 19 })).toBe('23h–19h (+1)');
    expect(formatBestWindowHours({ start: 22, end: 7 })).toBe('22h–07h (+1)');
    expect(formatBestWindowHours({ start: 0, end: 0 })).toBe('00h–00h (+1)');
  });
});
