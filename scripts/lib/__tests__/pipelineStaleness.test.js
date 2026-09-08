import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  evaluatePipelineStaleness,
  STALE_ALERT_HOURS_DAY,
  STALE_ALERT_HOURS_NIGHT,
} = require('../pipelineStaleness.js');

// Summer dates: Lisbon = UTC+1. 12:00Z = 13:00 Lisbon (daytime),
// 02:00Z = 03:00 Lisbon (night).
const DAY = new Date('2026-07-04T12:00:00Z').getTime();
const NIGHT = new Date('2026-07-04T02:00:00Z').getTime();

const fresh = () => ({
  fullUpdatedAt: new Date(DAY - 1 * 3600_000).toISOString(), // 1h old
  observationsUpdatedAt: new Date(DAY - 0.5 * 3600_000).toISOString(), // 0.5h old
});

describe('evaluatePipelineStaleness', () => {
  it('fresh meta is not stale in daytime', () => {
    const s = evaluatePipelineStaleness(fresh(), DAY);
    expect(s.stale).toBe(false);
    expect(s.isDaytime).toBe(true);
    expect(s.thresholdHours).toBe(STALE_ALERT_HOURS_DAY);
    expect(s.staleLayer).toBeNull();
  });

  it('full overdue in daytime (3.2h) is stale with layer full', () => {
    const meta = { ...fresh(), fullUpdatedAt: new Date(DAY - 3.2 * 3600_000).toISOString() };
    const s = evaluatePipelineStaleness(meta, DAY);
    expect(s.stale).toBe(true);
    expect(s.staleLayer).toBe('full');
    expect(s.fullAgeHours).toBeCloseTo(3.2, 1);
  });

  it('obs overdue in daytime while full is fresh is stale with layer observations', () => {
    const meta = { ...fresh(), observationsUpdatedAt: new Date(DAY - 3.5 * 3600_000).toISOString() };
    const s = evaluatePipelineStaleness(meta, DAY);
    expect(s.stale).toBe(true);
    expect(s.staleLayer).toBe('observations');
  });

  it('night uses the 5h threshold — 4.5h old is NOT stale at 03:00 Lisbon', () => {
    // Normal night gap: last full at 20:00 Lisbon → 00:00 run → max ~4h.
    const meta = { ...fresh(), fullUpdatedAt: new Date(NIGHT - 4.5 * 3600_000).toISOString() };
    const s = evaluatePipelineStaleness(meta, NIGHT);
    expect(s.isDaytime).toBe(false);
    expect(s.thresholdHours).toBe(STALE_ALERT_HOURS_NIGHT);
    expect(s.stale).toBe(false);
  });

  it('night — 6h old IS stale (00:00/04:00 runs missed)', () => {
    const meta = { ...fresh(), fullUpdatedAt: new Date(NIGHT - 6 * 3600_000).toISOString() };
    const s = evaluatePipelineStaleness(meta, NIGHT);
    expect(s.stale).toBe(true);
  });

  it('missing pipeline-meta entirely is stale (deadest signal)', () => {
    const s = evaluatePipelineStaleness(null, DAY);
    expect(s.stale).toBe(true);
    expect(s.fullAgeHours).toBeNull();
  });

  it('missing fullUpdatedAt timestamp is stale', () => {
    const meta = { ...fresh(), fullUpdatedAt: undefined };
    const s = evaluatePipelineStaleness(meta, DAY);
    expect(s.stale).toBe(true);
  });

  it('unparseable timestamp is treated as missing (stale)', () => {
    const meta = { ...fresh(), fullUpdatedAt: 'not-a-date' };
    const s = evaluatePipelineStaleness(meta, DAY);
    expect(s.stale).toBe(true);
  });

  it('thresholds are overridable (ops tuning without code changes)', () => {
    const meta = { ...fresh(), fullUpdatedAt: new Date(DAY - 4 * 3600_000).toISOString() };
    expect(evaluatePipelineStaleness(meta, DAY, { dayHours: 5 }).stale).toBe(false);
    expect(evaluatePipelineStaleness(meta, DAY, { dayHours: 3 }).stale).toBe(true);
  });
});