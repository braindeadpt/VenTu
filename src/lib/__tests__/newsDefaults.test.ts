import { describe, expect, it } from 'vitest';
import { getDefaultNewsRegion } from '../news';

describe('getDefaultNewsRegion', () => {
  it('defaults to pt for Portuguese locale', () => {
    expect(getDefaultNewsRegion('pt')).toBe('pt');
  });

  it('defaults to all for English locale', () => {
    expect(getDefaultNewsRegion('en')).toBe('all');
  });
});
