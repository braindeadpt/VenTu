import { describe, it, expect } from 'vitest';
import {
  deriveBuoyLayerDowntime,
  formatBuoyLayerDowntimeSuffix,
  formatBuoyLayerDowntimeTitle,
  type BuoyLayerDowntime,
} from '@/lib/buoyLayerDowntime';

const NOW = new Date('2026-09-01T12:00:00Z').getTime();

describe('deriveBuoyLayerDowntime', () => {
  it('down com streak e lastOkAt → runs + horas desde a última vez ok', () => {
    const dt = deriveBuoyLayerDowntime(
      {
        status: 'down',
        streak: 4,
        lastOkAt: new Date(NOW - 5 * 3_600_000).toISOString(),
      },
      NOW,
    );
    expect(dt).toEqual({ runs: 4, hours: 5, lastOkAt: expect.any(String) });
  });

  it('stale com streak e lastOkAt há exactamente 1 h → hours 1', () => {
    const dt = deriveBuoyLayerDowntime(
      { status: 'stale', streak: 2, lastOkAt: new Date(NOW - 3_600_000).toISOString() },
      NOW,
    );
    expect(dt?.hours).toBe(1);
    expect(dt?.runs).toBe(2);
  });

  it('no-key nunca conta como degradação (mesmo com streak conservado no meta)', () => {
    expect(
      deriveBuoyLayerDowntime({ status: 'no-key', streak: 3, lastOkAt: undefined }, NOW),
    ).toBeNull();
  });

  it('ok → null', () => {
    expect(
      deriveBuoyLayerDowntime({ status: 'ok', streak: 0, lastOkAt: new Date().toISOString() }, NOW),
    ).toBeNull();
  });

  it('down com streak 0 → null (primeiro run, ainda não acumulou)', () => {
    expect(deriveBuoyLayerDowntime({ status: 'down', streak: 0 }, NOW)).toBeNull();
  });

  it('down com streak mas sem lastOkAt (nunca esteve ok) → horas null, runs mantidas', () => {
    const dt = deriveBuoyLayerDowntime({ status: 'down', streak: 7 }, NOW);
    expect(dt).toEqual({ runs: 7, hours: null });
  });

  it('lastOkAt inválido → horas null (não rebenta)', () => {
    const dt = deriveBuoyLayerDowntime({ status: 'down', streak: 2, lastOkAt: 'not-a-date' }, NOW);
    expect(dt).toEqual({ runs: 2, hours: null });
  });

  it('relógio atrasado (now < lastOkAt) → clamp a 0', () => {
    const dt = deriveBuoyLayerDowntime(
      { status: 'down', streak: 2, lastOkAt: new Date(NOW + 3_600_000).toISOString() },
      NOW,
    );
    expect(dt?.hours).toBe(0);
  });

  it('meta ausente/null → null', () => {
    expect(deriveBuoyLayerDowntime(null, NOW)).toBeNull();
  });
});

describe('formatBuoyLayerDowntimeSuffix', () => {
  it('horas: «· ~5 h» (só números, neutro ao locale)', () => {
    const dt: BuoyLayerDowntime = { runs: 3, hours: 5 };
    expect(formatBuoyLayerDowntimeSuffix(dt)).toBe('· ~5 h');
  });

  it('1 hora → «· ~1 h»', () => {
    expect(formatBuoyLayerDowntimeSuffix({ runs: 1, hours: 1 })).toBe('· ~1 h');
  });

  it('sem horas → «· N runs»', () => {
    const dt: BuoyLayerDowntime = { runs: 3, hours: null };
    expect(formatBuoyLayerDowntimeSuffix(dt)).toBe('· 3 runs');
  });
});

describe('formatBuoyLayerDowntimeTitle', () => {
  it('pt com horas e plural/singular de runs', () => {
    expect(formatBuoyLayerDowntimeTitle({ runs: 4, hours: 5 }, 'pt')).toBe(
      'Camada de boias degradada há ~5 h (4 runs seguidos)',
    );
    expect(formatBuoyLayerDowntimeTitle({ runs: 1, hours: 2 }, 'pt')).toBe(
      'Camada de boias degradada há ~2 h (1 run seguido)',
    );
  });

  it('en com horas', () => {
    expect(formatBuoyLayerDowntimeTitle({ runs: 4, hours: 5 }, 'en')).toBe(
      'Buoy layer degraded for ~5 h (4 consecutive runs)',
    );
  });

  it('sem horas → só runs', () => {
    expect(formatBuoyLayerDowntimeTitle({ runs: 7, hours: null }, 'pt')).toBe(
      'Camada de boias degradada há 7 runs seguidos',
    );
    expect(formatBuoyLayerDowntimeTitle({ runs: 7, hours: null }, 'en')).toBe(
      'Buoy layer degraded for 7 consecutive runs',
    );
  });
});