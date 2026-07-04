const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getUpdateMode,
  isMultiModelEnabled,
  needsFullCatchUp,
  resolveUpdateMode,
  STALE_FULL_HOURS_DAY,
} = require('../updateSchedule');

describe('getUpdateMode (Europe/Lisbon)', () => {
  it('full at 08:00 Lisbon in summer', () => {
    assert.equal(getUpdateMode(new Date('2026-07-03T07:00:00Z')), 'full');
  });

  it('observations at 09:00 Lisbon in summer', () => {
    assert.equal(getUpdateMode(new Date('2026-07-03T08:00:00Z')), 'observations');
  });

  it('full at 00:00 Lisbon', () => {
    assert.equal(getUpdateMode(new Date('2026-07-02T23:00:00Z')), 'full');
  });

  it('skip at 03:00 Lisbon', () => {
    assert.equal(getUpdateMode(new Date('2026-07-03T02:00:00Z')), 'skip');
  });

  it('full at 20:00 Lisbon', () => {
    assert.equal(getUpdateMode(new Date('2026-07-03T19:00:00Z')), 'full');
  });

  it('multi-model only on daytime full runs', () => {
    assert.equal(isMultiModelEnabled(new Date('2026-07-03T07:00:00Z')), true);
    assert.equal(isMultiModelEnabled(new Date('2026-07-02T23:00:00Z')), false);
    assert.equal(isMultiModelEnabled(new Date('2026-07-03T03:00:00Z')), false);
  });
});

describe('resolveUpdateMode catch-up', () => {
  it('escalates observations hour to full when Open-Meteo is overdue', () => {
    const now = new Date('2026-07-04T10:30:00Z'); // 11:30 Lisbon, scheduled observations
    const lastFull = '2026-07-04T07:42:00.000Z'; // 08:42 Lisbon — ~2.8h ago
    assert.equal(getUpdateMode(now), 'observations');
    assert.equal(needsFullCatchUp(now, lastFull), true);
    assert.equal(resolveUpdateMode(now, lastFull), 'full');
  });

  it('does not catch up when last full is fresh', () => {
    const now = new Date('2026-07-04T08:00:00Z'); // 09:00 Lisbon
    const lastFull = '2026-07-04T07:42:00.000Z';
    assert.equal(needsFullCatchUp(now, lastFull), false);
    assert.equal(resolveUpdateMode(now, lastFull), 'observations');
  });

  it('uses night threshold outside daytime window', () => {
    const now = new Date('2026-07-04T02:00:00Z'); // 03:00 Lisbon skip
    const lastFull = '2026-07-03T19:13:00.000Z'; // ~6.8h ago
    assert.equal(needsFullCatchUp(now, lastFull), true);
    assert.equal(resolveUpdateMode(now, lastFull), 'full');
  });

  it('exports day stale threshold aligned with UI', () => {
    assert.equal(STALE_FULL_HOURS_DAY, 2.5);
  });
});
