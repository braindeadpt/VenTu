import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isFreshIhObservation, MAX_OBS_AGE_HOURS } = require('../ihObservedTide.js');

const NOW = Date.parse('2026-08-13T22:00:00Z');

describe('isFreshIhObservation', () => {
  it('accepts a reading within the TTL', () => {
    expect(isFreshIhObservation('2026-08-13T20:00:00Z', NOW)).toBe(true);
    expect(isFreshIhObservation('2026-08-13T16:00:00Z', NOW)).toBe(true);
  });

  it('rejects a reading older than the TTL', () => {
    expect(isFreshIhObservation('2026-07-29T11:16:59+00:00', NOW)).toBe(false);
    expect(isFreshIhObservation('2026-08-13T15:59:59Z', NOW)).toBe(false);
    expect(isFreshIhObservation('2026-08-12T22:00:00Z', NOW)).toBe(false);
  });

  it('rejects missing, invalid, or future timestamps', () => {
    expect(isFreshIhObservation(undefined, NOW)).toBe(false);
    expect(isFreshIhObservation('', NOW)).toBe(false);
    expect(isFreshIhObservation('not-a-date', NOW)).toBe(false);
    expect(isFreshIhObservation('2026-08-13T23:00:00Z', NOW)).toBe(false);
  });

  it('uses a 6h default TTL', () => {
    expect(MAX_OBS_AGE_HOURS).toBe(6);
  });
});
