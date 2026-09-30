/**
 * stormState (cliente) — a conversão «Z falso» do manifest radar IPMA
 * (wall-clock de Lisboa) e o gate de frescura de 75 min.
 */
import { describe, it, expect } from 'vitest';
import {
  lisbonFakeZToMs,
  radarStateFresh,
  STORM_RADAR_MAX_AGE_MS,
  type StormStateFile,
} from '@/lib/stormState';

const file = (frameTime: string): StormStateFile => ({
  source: 'ventu-storm-state',
  fetchedAt: '2026-09-29T20:00:00.000Z',
  radar: { frameTime, compareFrameTime: null },
  spots: {},
});

describe('lisbonFakeZToMs — wall-clock Lisboa com Z falso → instante UTC', () => {
  it('verão (WEST, UTC+1): 19:35 escrito = 18:35 UTC', () => {
    expect(lisbonFakeZToMs('2026-09-29T19:35:00.000Z')).toBe(
      Date.parse('2026-09-29T18:35:00.000Z'),
    );
  });

  it('inverno (WET, UTC+0): a hora escrita já é UTC', () => {
    expect(lisbonFakeZToMs('2026-01-15T10:00:00.000Z')).toBe(
      Date.parse('2026-01-15T10:00:00.000Z'),
    );
  });

  it('limiar DST — mudança para WET (outubro): 01:30 escrito', () => {
    // 2026-10-25 02:00 WEST→01:00 WET; 01:30 Lisboa ambíguo — basta ser
    // um instante válido dentro do período ambíguo, sem NaN.
    const t = lisbonFakeZToMs('2026-10-25T01:30:00.000Z');
    expect(Number.isFinite(t)).toBe(true);
  });

  it('entrada inválida → NaN', () => {
    expect(Number.isNaN(lisbonFakeZToMs('lixo'))).toBe(true);
    expect(Number.isNaN(lisbonFakeZToMs(null))).toBe(true);
    expect(Number.isNaN(lisbonFakeZToMs(undefined))).toBe(true);
  });
});

describe('radarStateFresh', () => {
  it('frame de há 30 min (verão) → fresco', () => {
    // 19:35 Lisboa = 18:35 UTC; "agora" 19:05 UTC = 30 min depois.
    expect(radarStateFresh(file('2026-09-29T19:35:00.000Z'), Date.parse('2026-09-29T19:05:00Z'))).toBe(true);
  });

  it('frame de há 2h (verão) → velho — a leitura como UTC fingiria 1h', () => {
    expect(radarStateFresh(file('2026-09-29T19:35:00.000Z'), Date.parse('2026-09-29T20:35:00Z'))).toBe(false);
  });

  it('ficheiro/frame ausente → não fresco', () => {
    expect(radarStateFresh(null)).toBe(false);
    expect(radarStateFresh(undefined)).toBe(false);
  });

  it('gate exacto: 75 min', () => {
    expect(STORM_RADAR_MAX_AGE_MS).toBe(75 * 60 * 1000);
  });
});
