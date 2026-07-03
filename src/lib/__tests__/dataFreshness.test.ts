import { describe, expect, it } from 'vitest';
import { formatForecastUpdatedParts } from '@/lib/dataFreshness';

describe('formatForecastUpdatedParts', () => {
  it('returns date and time in Lisbon timezone with prefix', () => {
    const ts = new Date('2026-07-03T12:30:00Z').getTime();
    const parts = formatForecastUpdatedParts(ts, 'pt');

    expect(parts.prefix).toBe('Actualizado');
    expect(parts.datePart).toMatch(/3/);
    expect(parts.timePart).toMatch(/\d{2}:\d{2}/);
    expect(parts.combined).toContain(parts.datePart);
    expect(parts.combined).toContain(parts.timePart);
  });

  it('uses English labels', () => {
    const ts = new Date('2026-07-03T12:30:00Z').getTime();
    const parts = formatForecastUpdatedParts(ts, 'en');

    expect(parts.prefix).toBe('Updated');
  });
});
