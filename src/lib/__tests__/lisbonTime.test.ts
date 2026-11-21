import { describe, expect, it } from 'vitest';
import {
  formatLisbonDay,
  lisbonDateKey,
  lisbonUtcOffsetMs,
  lisbonWallToDate,
  lisbonWallToMs,
} from '@/lib/lisbonTime';

describe('lisbonWallToMs', () => {
  it('interpreta wall-time de Lisboa como o instante real (verão = UTC+1)', () => {
    // Agosto 2026 é WEST (UTC+1): 12:00 Lisboa = 11:00 UTC.
    expect(lisbonWallToMs('2026-08-15T12:00')).toBe(
      new Date('2026-08-15T11:00:00Z').getTime(),
    );
  });

  it('inverno = UTC+0', () => {
    expect(lisbonWallToMs('2026-01-15T12:00')).toBe(
      new Date('2026-01-15T12:00:00Z').getTime(),
    );
  });

  it('aceita date-only, hora só, segundos e milissegundos', () => {
    expect(lisbonWallToMs('2026-08-15')).toBe(
      new Date('2026-08-14T23:00:00Z').getTime(),
    );
    expect(lisbonWallToMs('2026-08-15T12')).toBe(
      new Date('2026-08-15T11:00:00Z').getTime(),
    );
    expect(lisbonWallToMs('2026-08-15T12:00:00.500')).toBe(
      new Date('2026-08-15T11:00:00.500Z').getTime(),
    );
  });

  it('desvio explícito (Z real, ±hh:mm) já é um instante — Date.parse', () => {
    expect(lisbonWallToMs('2026-11-21T15:55:00.000Z')).toBe(
      new Date('2026-11-21T15:55:00Z').getTime(),
    );
    expect(lisbonWallToMs('2026-10-25T01:00+01:00')).toBe(
      new Date('2026-10-25T00:00:00Z').getTime(),
    );
  });

  it('não depende do fuso do browser', () => {
    const prevTz = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Auckland';
      expect(lisbonWallToMs('2026-08-15T12:00')).toBe(
        new Date('2026-08-15T11:00:00Z').getTime(),
      );
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });

  it('input inválido devolve NaN', () => {
    expect(Number.isNaN(lisbonWallToMs(''))).toBe(true);
    expect(Number.isNaN(lisbonWallToMs('não é uma data'))).toBe(true);
    expect(Number.isNaN(lisbonWallToMs('2026-13-40'))).toBe(true);
  });

  it('resolve o limiar da mudança de hora (DST)', () => {
    // 29 mar 2026: Lisboa salta 01:00→02:00 WEST; 01:30 wall não existe.
    // O util tem de aterrar num instante coerente, não num Date.parse local.
    const ms = lisbonWallToMs('2026-03-29T01:30');
    expect(Number.isFinite(ms)).toBe(true);
    // E horas normais perto do limiar continuam corretas.
    expect(lisbonWallToMs('2026-03-29T04:00')).toBe(
      new Date('2026-03-29T03:00:00Z').getTime(),
    );
  });
});

describe('lisbonUtcOffsetMs', () => {
  it('verão +1h, inverno 0', () => {
    expect(lisbonUtcOffsetMs(new Date('2026-08-15T00:00:00Z').getTime())).toBe(
      3600000,
    );
    expect(lisbonUtcOffsetMs(new Date('2026-01-15T00:00:00Z').getTime())).toBe(0);
  });
});

describe('lisbonDateKey', () => {
  it('devolve o dia civil de Lisboa, não do fuso do viewer', () => {
    const prevTz = process.env.TZ;
    try {
      // 2026-08-15T22:30Z é 23:30 em Lisboa (dia 15), e o dia 16 em Auckland.
      const d = new Date('2026-08-15T22:30:00Z');
      process.env.TZ = 'Pacific/Auckland';
      expect(lisbonDateKey(d)).toBe('2026-08-15');
      process.env.TZ = 'America/Los_Angeles';
      expect(lisbonDateKey(d)).toBe('2026-08-15');
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });
});

describe('lisbonWallToDate', () => {
  it('devolve o instante real como Date', () => {
    expect(lisbonWallToDate('2026-08-15T12:00').toISOString()).toBe(
      '2026-08-15T11:00:00.000Z',
    );
  });
});

describe('formatLisbonDay', () => {
  it('formata o dia de Lisboa no locale pedido, independente do fuso', () => {
    const prevTz = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Auckland';
      expect(formatLisbonDay('2026-08-15', 'pt-PT')).toMatch(/15/);
      expect(
        formatLisbonDay('2026-08-15', 'en-GB', { day: '2-digit', month: '2-digit' }),
      ).toBe('15/08');
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });

  it('input inválido devolve a string original', () => {
    expect(formatLisbonDay('???', 'pt-PT')).toBe('???');
  });
});
