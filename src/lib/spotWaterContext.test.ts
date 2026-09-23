import { describe, expect, it } from 'vitest';
import { getCalmWaterMetricLabel } from './spotWaterContext';

describe('getCalmWaterMetricLabel', () => {
  it('labels wakeboard spots as flat water', () => {
    expect(
      getCalmWaterMetricLabel({ type: 'wakeboard' }, 0, 'pt'),
    ).toBe('Água plana');
    expect(
      getCalmWaterMetricLabel({ type: 'wakeboard' }, 2, 'en'),
    ).toBe('Flat water');
  });

  it('labels low swell non-surf spots', () => {
    expect(
      getCalmWaterMetricLabel({ type: 'kitesurf' }, 0.1, 'pt'),
    ).toBe('Sem ondas');
  });

  it('returns null for ocean surf with swell', () => {
    expect(
      getCalmWaterMetricLabel({ type: 'surf' }, 1.2, 'pt'),
    ).toBeNull();
  });
});
