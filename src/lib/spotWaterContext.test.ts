import { describe, expect, it } from 'vitest';
import { getCalmWaterMetricLabel } from './spotWaterContext';

describe('getCalmWaterMetricLabel', () => {
  it('labels wakeboard spots as flat water', () => {
    expect(
      getCalmWaterMetricLabel({ type: 'wakeboard' }, 0, true),
    ).toBe('Água plana');
    expect(
      getCalmWaterMetricLabel({ type: 'wakeboard' }, 2, false),
    ).toBe('Flat water');
  });

  it('labels low swell non-surf spots', () => {
    expect(
      getCalmWaterMetricLabel({ type: 'kitesurf' }, 0.1, true),
    ).toBe('Sem ondas');
  });

  it('returns null for ocean surf with swell', () => {
    expect(
      getCalmWaterMetricLabel({ type: 'surf' }, 1.2, true),
    ).toBeNull();
  });
});
