import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  getUpdateMode,
  isMultiModelEnabled,
  needsFullCatchUp,
  needsObsCatchUp,
  resolveUpdateMode,
  resolveKeepaliveMode,
  resolveScheduledMode,
  slotAlreadyRan,
  KEEPALIVE_SLOT_STALE_MIN,
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

describe('needsObsCatchUp (external keep-alive resurrection path)', () => {
  it('escalates when obs merge is overdue in daytime (3h)', () => {
    const now = new Date('2026-07-04T10:30:00Z'); // 11:30 Lisbon
    const lastObs = '2026-07-04T07:00:00.000Z'; // 08:00 Lisbon — ~3.5h ago
    expect(needsObsCatchUp(now, lastObs)).toBe(true);
  });

  it('does not resurrect when obs are fresh', () => {
    const now = new Date('2026-07-04T10:30:00Z');
    const lastObs = '2026-07-04T09:05:00.000Z'; // ~1.4h ago
    expect(needsObsCatchUp(now, lastObs)).toBe(false);
  });

  it('uses the night threshold (5h) outside daytime', () => {
    const now = new Date('2026-07-04T02:00:00Z'); // 03:00 Lisbon
    const lastObs = '2026-07-03T19:30:00.000Z'; // ~6.5h ago
    expect(needsObsCatchUp(now, lastObs)).toBe(true);
    // just under the night threshold stays dormant
    const lastObsNightFresh = '2026-07-03T22:30:00.000Z'; // ~3.5h ago
    expect(needsObsCatchUp(now, lastObsNightFresh)).toBe(false);
  });

  it('treats missing timestamps as no-op (never resurrects blindly)', () => {
    expect(needsObsCatchUp(new Date('2026-07-04T10:30:00Z'), null)).toBe(false);
    expect(needsObsCatchUp(new Date('2026-07-04T10:30:00Z'), 'not-a-date')).toBe(false);
  });
});

describe('resolveKeepaliveMode (ping externo corre o slot da hora)', () => {
  // Julho: Lisboa = UTC+1. 07:05Z = 08:05 Lisboa (slot full); 08:20Z = 09:20 (slot obs).
  it('limiar do slot é 90 min', () => {
    expect(KEEPALIVE_SLOT_STALE_MIN).toBe(90);
  });

  it('slot full: o cron das 08h não chegou e o último full tem 108 min → full', () => {
    const r = resolveKeepaliveMode(new Date('2026-07-04T07:05:00Z'), { fullUpdatedAt: '2026-07-04T05:17:00Z' });
    expect(r).toEqual({ mode: 'full', reason: 'slot-full' });
    // o catch-up de sempre (2,5 h) ainda NÃO dispararia — é o slot que apanha
    expect(needsFullCatchUp(new Date('2026-07-04T07:05:00Z'), '2026-07-04T05:17:00Z')).toBe(false);
  });

  it('slot full já servido (cron :17 desta hora) → skip, sem corrida dupla', () => {
    const r = resolveKeepaliveMode(new Date('2026-07-04T07:40:00Z'), { fullUpdatedAt: '2026-07-04T07:17:00Z' });
    expect(r.mode).toBe('skip');
  });

  it('slot full com dados de 78 min (slot anterior atrasado) → skip, o cron desta hora ainda vem', () => {
    const r = resolveKeepaliveMode(new Date('2026-07-04T07:05:00Z'), { fullUpdatedAt: '2026-07-04T05:47:00Z' });
    expect(r.mode).toBe('skip');
  });

  it('slot obs: último publish de observações > 90 min → observations', () => {
    const r = resolveKeepaliveMode(new Date('2026-07-04T08:20:00Z'), {
      fullUpdatedAt: '2026-07-04T06:17:00Z',
      observationsUpdatedAt: '2026-07-04T05:50:00Z',
    });
    // full de 06:17Z tem 123 min (< 2,5 h, sem catch-up) e as obs 150 min
    expect(r).toEqual({ mode: 'observations', reason: 'slot-observations' });
  });

  it('slot obs: um full recente conta como publish de observações → skip', () => {
    const r = resolveKeepaliveMode(new Date('2026-07-04T08:20:00Z'), {
      fullUpdatedAt: '2026-07-04T07:17:00Z',
      observationsUpdatedAt: '2026-07-04T05:30:00Z',
    });
    expect(r.mode).toBe('skip');
  });

  it('hora sem slot (03h Lisboa) e dados frescos → skip; catch-up nocturno mantém-se', () => {
    expect(resolveKeepaliveMode(new Date('2026-07-04T02:00:00Z'), { fullUpdatedAt: '2026-07-03T23:17:00Z' }).mode).toBe('skip');
    expect(resolveKeepaliveMode(new Date('2026-07-04T02:00:00Z'), { fullUpdatedAt: '2026-07-03T19:13:00Z' })).toEqual({
      mode: 'full',
      reason: 'catch-up-full',
    });
  });

  it('meta em falta ou ilegível nunca dispara às cegas', () => {
    expect(resolveKeepaliveMode(new Date('2026-07-04T07:05:00Z'), null).mode).toBe('skip');
    expect(resolveKeepaliveMode(new Date('2026-07-04T07:05:00Z'), { fullUpdatedAt: 'x' }).mode).toBe('skip');
  });
});

describe('resolveScheduledMode (cron :17/:47 — um run por slot)', () => {
  it('o :47 salta quando o :17 já serviu o slot full', () => {
    const meta = { fullUpdatedAt: '2026-07-04T07:17:00Z' };
    expect(resolveScheduledMode(new Date('2026-07-04T07:47:00Z'), meta)).toBe('skip');
  });

  it('o :17 corre quando o último full é da hora anterior', () => {
    const meta = { fullUpdatedAt: '2026-07-04T06:47:00Z' };
    expect(resolveScheduledMode(new Date('2026-07-04T07:17:00Z'), meta)).toBe('full');
  });

  it('o cron salta o slot que um ping já serviu nesta hora', () => {
    const meta = { fullUpdatedAt: '2026-07-04T07:05:00Z' };
    expect(resolveScheduledMode(new Date('2026-07-04T07:17:00Z'), meta)).toBe('skip');
  });

  it('slot obs servido por um full desta hora (catch-up) → skip', () => {
    const meta = { fullUpdatedAt: '2026-07-04T08:05:00Z', observationsUpdatedAt: '2026-07-04T06:20:00Z' };
    expect(resolveScheduledMode(new Date('2026-07-04T08:17:00Z'), meta)).toBe('skip');
  });

  it('catch-up full continua a escalar uma hora de obs em atraso', () => {
    const meta = { fullUpdatedAt: '2026-07-04T07:42:00Z', observationsUpdatedAt: '2026-07-04T09:47:00Z' };
    // 10:30Z = 11:30 Lisboa (obs), full com 2,8 h
    expect(resolveScheduledMode(new Date('2026-07-04T10:30:00Z'), meta)).toBe('full');
  });

  it('slotAlreadyRan exige a mesma hora de Lisboa e < 60 min', () => {
    expect(slotAlreadyRan(new Date('2026-07-04T07:47:00Z'), '2026-07-04T07:17:00Z')).toBe(true);
    expect(slotAlreadyRan(new Date('2026-07-04T07:17:00Z'), '2026-07-04T06:47:00Z')).toBe(false);
    expect(slotAlreadyRan(new Date('2026-07-04T07:17:00Z'), null)).toBe(false);
  });
});
