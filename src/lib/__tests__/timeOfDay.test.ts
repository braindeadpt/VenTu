import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDaypart } from '@/lib/timeOfDay';

describe('getDaypart', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns sunset between 18:00 and 20:59 Lisbon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T18:30:00+01:00'));
    expect(getDaypart(new Date(), 'Europe/Lisbon')).toBe('sunset');
  });

  it('returns day at noon Lisbon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T12:00:00+01:00'));
    expect(getDaypart(new Date(), 'Europe/Lisbon')).toBe('day');
  });

  it('returns night after 21:00 Lisbon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T22:00:00+01:00'));
    expect(getDaypart(new Date(), 'Europe/Lisbon')).toBe('night');
  });
});
