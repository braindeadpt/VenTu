import { describe, it, expect } from 'vitest';
import { getDifficultyLabel } from '@/lib/mapDifficulty';

describe('getDifficultyLabel', () => {
  it('localizes PT difficulty labels (never raw English keys)', () => {
    expect(getDifficultyLabel('beginner', true)).toBe('Iniciante');
    expect(getDifficultyLabel('intermediate', true)).toBe('Intermédio');
    expect(getDifficultyLabel('advanced', true)).toBe('Avançado');
    expect(getDifficultyLabel('expert', true)).toBe('Expert');
    expect(getDifficultyLabel('all', true)).toBe('Todos os níveis');
  });

  it('keeps EN labels as product English', () => {
    expect(getDifficultyLabel('beginner', false)).toBe('Beginner');
    expect(getDifficultyLabel('intermediate', false)).toBe('Intermediate');
    expect(getDifficultyLabel('advanced', false)).toBe('Advanced');
    expect(getDifficultyLabel('expert', false)).toBe('Expert');
  });
});
