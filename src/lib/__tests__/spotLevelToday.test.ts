import { describe, expect, it } from 'vitest';
import { resolveSpotLevelToday } from '@/lib/spotLevelToday';

describe('resolveSpotLevelToday', () => {
  it('flags good learning days on beginner spots with decent score', () => {
    expect(resolveSpotLevelToday('beginner', 60)?.tone).toBe('good');
  });

  it('warns on expert spots', () => {
    expect(resolveSpotLevelToday('expert', 80)?.tone).toBe('warn');
  });

  it('warns when score is low at intermediate spots', () => {
    expect(resolveSpotLevelToday('intermediate', 45)?.tone).toBe('warn');
  });
});
