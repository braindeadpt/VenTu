import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_CONFIG,
  getConfidenceTier,
  type ConfidenceDetail,
} from '@/lib/forecastConfidence';

function detail(overrides: Partial<ConfidenceDetail>): ConfidenceDetail {
  return {
    waveSpread: 0,
    windSpread: 0,
    combinedSpreadPct: 0.1,
    degraded: false,
    ...overrides,
  };
}

describe('forecastConfidence', () => {
  it('maps low combined spread to alta', () => {
    expect(
      getConfidenceTier(
        detail({ combinedSpreadPct: CONFIDENCE_CONFIG.altaMax - 0.01 }),
      ),
    ).toBe('alta');
  });

  it('maps high combined spread to baixa', () => {
    expect(
      getConfidenceTier(
        detail({ combinedSpreadPct: CONFIDENCE_CONFIG.baixaMin + 0.05 }),
      ),
    ).toBe('baixa');
  });

  it('maps degraded detail to média', () => {
    expect(
      getConfidenceTier(
        detail({ combinedSpreadPct: 0.05, degraded: true }),
      ),
    ).toBe('média');
  });

  it('respects explicit tier when provided', () => {
    expect(getConfidenceTier(null, 'baixa')).toBe('baixa');
  });
});
