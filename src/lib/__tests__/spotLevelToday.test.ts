import { describe, expect, it } from 'vitest';
import { resolveSpotLevelToday } from '@/lib/spotLevelToday';

describe('resolveSpotLevelToday', () => {
  it('flags good learning days on beginner spots with decent score', () => {
    expect(resolveSpotLevelToday('beginner', 60)).toBe('good');
  });

  it('warns on expert spots', () => {
    expect(resolveSpotLevelToday('expert', 80)).toBe('warn');
  });

  it('warns when score is low at intermediate spots', () => {
    expect(resolveSpotLevelToday('intermediate', 45)).toBe('warn');
  });

  it('stays silent on intermediate spots with decent score', () => {
    expect(resolveSpotLevelToday('intermediate', 80)).toBeNull();
  });
});
