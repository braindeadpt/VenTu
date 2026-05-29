import { describe, it, expect } from 'vitest';
import {
  wavePowerKwPerM,
  wavePowerFromMarine,
  buildSwellTrains,
  totalSwellPowerKw,
} from '../waveEnergy';

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

describe('buildSwellTrains', () => {
  it('returns primary and secondary sorted by energy', () => {
    const trains = buildSwellTrains({
      swellHeight: 1,
      swellPeriod: 8,
      swellDirection: 270,
      secondarySwellHeight: 1.5,
      secondarySwellPeriod: 10,
      secondarySwellDirection: 300,
    });
    expect(trains).toHaveLength(2);
    expect(trains[0].key).toBe('secondary');
    expect(trains[0].isDominant).toBe(true);
    expect(trains[1].key).toBe('primary');
    expect(trains[1].isDominant).toBe(false);
  });

  it('ignores trains below height threshold', () => {
    expect(
      buildSwellTrains({
        swellHeight: 0.05,
        swellPeriod: 10,
        secondarySwellHeight: null,
        secondarySwellPeriod: 12,
      }),
    ).toHaveLength(0);
  });

  it('totalSwellPowerKw sums active trains', () => {
    const total = totalSwellPowerKw({
      swellHeight: 2,
      swellPeriod: 10,
      secondarySwellHeight: 1,
      secondarySwellPeriod: 8,
    });
    expect(total).toBeCloseTo(20 + 4, 5);
  });
});
