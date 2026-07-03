const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getUpdateMode } = require('../updateSchedule');

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
});
