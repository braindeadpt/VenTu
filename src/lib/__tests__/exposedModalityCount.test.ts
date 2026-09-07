import { describe, it, expect } from 'vitest';
import { ALL_SPORTS, EXPOSED_MODALITY_COUNT } from '@/lib/sportRatings';

describe('EXPOSED_MODALITY_COUNT', () => {
  it('matches nav/SEO modalities: scored sports + big-wave', () => {
    expect(EXPOSED_MODALITY_COUNT).toBe(ALL_SPORTS.length + 1);
    expect(EXPOSED_MODALITY_COUNT).toBe(8);
  });
});
