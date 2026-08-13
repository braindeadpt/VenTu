import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseIpmaObservedAt } = require('../ipma.js');

describe('parseIpmaObservedAt (S5 timezone fix)', () => {
  it('parses winter wall clock as UTC+0 (WET)', () => {
    const d = parseIpmaObservedAt('2025-01-15T10:00');
    expect(d.toISOString()).toBe('2025-01-15T10:00:00.000Z');
  });

  it('parses summer wall clock as UTC+1 (WEST)', () => {
    const d = parseIpmaObservedAt('2025-07-15T10:00');
    expect(d.toISOString()).toBe('2025-07-15T09:00:00.000Z');
  });

  it('keeps explicit Z timestamps as-is', () => {
    const d = parseIpmaObservedAt('2025-07-15T10:00Z');
    expect(d.toISOString()).toBe('2025-07-15T10:00:00.000Z');
  });

  it('keeps explicit offset timestamps as-is', () => {
    const d = parseIpmaObservedAt('2025-07-15T10:00+01:00');
    expect(d.toISOString()).toBe('2025-07-15T09:00:00.000Z');
  });

  it('returns a Date (not throwing) for invalid input', () => {
    const d = parseIpmaObservedAt('garbage');
    expect(d instanceof Date).toBe(true);
  });
});
