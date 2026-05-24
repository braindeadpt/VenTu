import { describe, it, expect } from 'vitest';
import { wavePowerKwPerM, wavePowerFromMarine } from '../waveEnergy';

describe('wavePowerKwPerM', () => {
  it('returns 0 for invalid input', () => {
    expect(wavePowerKwPerM(0, 8)).toBe(0);
    expect(wavePowerKwPerM(1, 0)).toBe(0);
  });

  it('computes P = 0.5 * H^2 * T', () => {
    expect(wavePowerKwPerM(2, 10)).toBeCloseTo(20, 5);
  });
});

describe('wavePowerFromMarine', () => {
  it('prefers swell over total wave', () => {
    const p = wavePowerFromMarine({
      swellHeight: 2,
      swellPeriod: 10,
      waveHeight: 0.5,
      wavePeriod: 4,
    });
    expect(p).toBeCloseTo(20, 5);
  });

  it('falls back to total wave', () => {
    expect(wavePowerFromMarine({ waveHeight: 1, wavePeriod: 8 })).toBeCloseTo(4, 5);
  });
});
