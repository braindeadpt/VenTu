import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  getUpdateMode,
  isMultiModelEnabled,
  needsFullCatchUp,
  resolveUpdateMode,
  STALE_FULL_HOURS_DAY,
} = require('../updateSchedule.js');

describe('getUpdateMode (Europe/Lisbon)', () => {
  it('full at 08:00 Lisbon in summer', () => {
    expect(getUpdateMode(new Date('2026-07-03T07:00:00Z'))).toBe('full');
  });

  it('observations at 09:00 Lisbon in summer', () => {
    expect(getUpdateMode(new Date('2026-07-03T08:00:00Z'))).toBe('observations');
  });

  it('full at 17:00 Lisbon during kite season (Apr–Oct)', () => {
    expect(getUpdateMode(new Date('2026-07-09T16:00:00Z'))).toBe('full');
  });

  it('observations at 17:00 Lisbon in winter', () => {
    expect(getUpdateMode(new Date('2026-02-09T17:00:00Z'))).toBe('observations');
  });

  it('full at 00:00 Lisbon', () => {
    expect(getUpdateMode(new Date('2026-07-02T23:00:00Z'))).toBe('full');
  });

  it('skip at 03:00 Lisbon', () => {
    expect(getUpdateMode(new Date('2026-07-03T02:00:00Z'))).toBe('skip');
  });

  it('full at 20:00 Lisbon', () => {
    expect(getUpdateMode(new Date('2026-07-03T19:00:00Z'))).toBe('full');
  });

  it('multi-modelo só nas horas-âncora 06/12/18 (orçamento 10k/dia)', () => {
    // 06:00 Lisboa → ON
    expect(isMultiModelEnabled(new Date('2026-07-03T05:00:00Z'))).toBe(true);
    // 12:00 Lisboa → ON
    expect(isMultiModelEnabled(new Date('2026-07-03T11:00:00Z'))).toBe(true);
    // 18:00 Lisboa → ON
    expect(isMultiModelEnabled(new Date('2026-07-03T17:00:00Z'))).toBe(true);
    // 08:00 Lisboa → full mas best_match (frescura mantida, quota poupada)
    expect(getUpdateMode(new Date('2026-07-03T07:00:00Z'))).toBe('full');
    expect(isMultiModelEnabled(new Date('2026-07-03T07:00:00Z'))).toBe(false);
    // 17:00 Lisboa (kite season) → full mas best_match
    expect(getUpdateMode(new Date('2026-07-09T16:00:00Z'))).toBe('full');
    expect(isMultiModelEnabled(new Date('2026-07-09T16:00:00Z'))).toBe(false);
    // noite → nunca
    expect(isMultiModelEnabled(new Date('2026-07-02T23:00:00Z'))).toBe(false);
    expect(isMultiModelEnabled(new Date('2026-07-03T03:00:00Z'))).toBe(false);
  });

  it('VENTU_MULTIMODEL_HOURS sobrepõe as horas-âncora', () => {
    const prev = process.env.VENTU_MULTIMODEL_HOURS;
    try {
      process.env.VENTU_MULTIMODEL_HOURS = '6,10,14,18';
      // 10:00 Lisboa passa a multi-modelo
      expect(isMultiModelEnabled(new Date('2026-07-03T09:00:00Z'))).toBe(true);
      // 12:00 deixa de ser (fora da lista)
      expect(isMultiModelEnabled(new Date('2026-07-03T11:00:00Z'))).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.VENTU_MULTIMODEL_HOURS;
      else process.env.VENTU_MULTIMODEL_HOURS = prev;
    }
  });
});

describe('resolveUpdateMode catch-up', () => {
  it('escalates observations hour to full when Open-Meteo is overdue', () => {
    const now = new Date('2026-07-04T10:30:00Z'); // 11:30 Lisbon, scheduled observations
    const lastFull = '2026-07-04T07:42:00.000Z'; // 08:42 Lisbon — ~2.8h ago
    expect(getUpdateMode(now)).toBe('observations');
    expect(needsFullCatchUp(now, lastFull)).toBe(true);
    expect(resolveUpdateMode(now, lastFull)).toBe('full');
  });

  it('does not catch up when last full is fresh', () => {
    const now = new Date('2026-07-04T08:00:00Z'); // 09:00 Lisbon
    const lastFull = '2026-07-04T07:42:00.000Z';
    expect(needsFullCatchUp(now, lastFull)).toBe(false);
    expect(resolveUpdateMode(now, lastFull)).toBe('observations');
  });

  it('uses night threshold outside daytime window', () => {
    const now = new Date('2026-07-04T02:00:00Z'); // 03:00 Lisbon skip
    const lastFull = '2026-07-03T19:13:00.000Z'; // ~6.8h ago
    expect(needsFullCatchUp(now, lastFull)).toBe(true);
    expect(resolveUpdateMode(now, lastFull)).toBe('full');
  });

  it('exports day stale threshold aligned with UI', () => {
    expect(STALE_FULL_HOURS_DAY).toBe(2.5);
  });
});
