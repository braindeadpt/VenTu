import { describe, it, expect } from 'vitest';
import { formatAnimatedNumericValue } from '@/lib/animatedNumericValue';

describe('formatAnimatedNumericValue', () => {
  it('preserva uma casa decimal mesmo quando o valor é inteiro (2.0m, não 2m)', () => {
    expect(formatAnimatedNumericValue(2, '2.0m (viés regional)')).toBe('2.0m (viés regional)');
  });

  it('mantém inteiros sem ponto (vento em kt)', () => {
    expect(formatAnimatedNumericValue(16, '16kt')).toBe('16kt');
  });

  it('mantém a casa decimal de alturas e temperatura', () => {
    expect(formatAnimatedNumericValue(1.8, '1.8m')).toBe('1.8m');
    expect(formatAnimatedNumericValue(18.5, '18.5°C')).toBe('18.5°C');
  });
});
