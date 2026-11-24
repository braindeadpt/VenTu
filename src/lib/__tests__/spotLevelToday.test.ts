import { describe, expect, it } from 'vitest';
import { resolveSpotLevelToday } from '@/lib/spotLevelToday';

describe('resolveSpotLevelToday', () => {
  it('flags good learning days on beginner spots with decent score', () => {
    expect(resolveSpotLevelToday('beginner', 60)?.tone).toBe('good');
    expect(resolveSpotLevelToday('beginner', 75, { waveHeight: 1.2, sport: 'surf' })?.tone).toBe('good');
  });

  it('never recommends learning when surf/bodyboard waves exceed 1.6 m (#459)', () => {
    expect(resolveSpotLevelToday('beginner', 85, { waveHeight: 2.5, sport: 'surf' })?.tone).toBe('warn');
    expect(resolveSpotLevelToday('all', 80, { waveHeight: 1.8, sport: 'bodyboard' })?.tone).toBe('warn');
  });

  it('never recommends learning under pros-only wind or offshore safety alert (#459)', () => {
    expect(resolveSpotLevelToday('beginner', 70, { soProfissionais: true, sport: 'kitesurf' })?.tone).toBe('warn');
    expect(resolveSpotLevelToday('beginner', 65, { seguranca: 'offshore', sport: 'kitesurf' })?.tone).toBe('warn');
  });

  it('warns on expert spots', () => {
    expect(resolveSpotLevelToday('expert', 80)?.tone).toBe('warn');
  });

  it('warns when score is low at intermediate spots', () => {
    expect(resolveSpotLevelToday('intermediate', 45)?.tone).toBe('warn');
  });
});
