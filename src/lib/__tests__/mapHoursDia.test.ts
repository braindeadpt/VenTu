import { describe, expect, it } from 'vitest';
import { indexForDayHour, indexForHourOfDay, parseDayParam } from '@/lib/mapHours';

/**
 * #273: `?t=10&dia=1` (home → /mapa) escolhe a frame de amanhã às 10h. As frames são as do
 * `map-hours.json`: 16 passos de 3 h desde a hora do build, em hora de parede de Lisboa.
 */
const TIMES = [
  '2026-10-20T09:00', '2026-10-20T12:00', '2026-10-20T15:00', '2026-10-20T18:00',
  '2026-10-20T21:00', '2026-10-21T00:00', '2026-10-21T03:00', '2026-10-21T06:00',
  '2026-10-21T09:00', '2026-10-21T12:00', '2026-10-21T15:00', '2026-10-21T18:00',
  '2026-10-21T21:00', '2026-10-22T00:00', '2026-10-22T03:00', '2026-10-22T06:00',
];
// 20 out 2026, 11h58 em Lisboa (WEST, UTC+1)
const AGORA = new Date('2026-10-20T10:58:00Z');

describe('indexForDayHour (?t= + ?dia=)', () => {
  it('amanhã às 10h → a frame das 09h de amanhã (não as 09h de hoje)', () => {
    expect(TIMES[indexForDayHour(TIMES, 1, 10, AGORA)]).toBe('2026-10-21T09:00');
    // o caminho antigo (sem dia) cai nas 09h de hoje: é por isso que o dia é preciso
    expect(TIMES[indexForHourOfDay(TIMES, 10)]).toBe('2026-10-20T09:00');
  });

  it('hoje (dia=0) à hora pedida, e a mais próxima quando cai entre passos', () => {
    expect(TIMES[indexForDayHour(TIMES, 0, 15, AGORA)]).toBe('2026-10-20T15:00');
    expect(TIMES[indexForDayHour(TIMES, 0, 17, AGORA)]).toBe('2026-10-20T18:00');
    expect(TIMES[indexForDayHour(TIMES, 1, 14, AGORA)]).toBe('2026-10-21T15:00');
    expect(TIMES[indexForDayHour(TIMES, 1, 19, AGORA)]).toBe('2026-10-21T18:00');
  });

  it('a frame mais próxima no tempo, também a atravessar a meia-noite; fora da série, a ponta', () => {
    expect(TIMES[indexForDayHour(TIMES, 1, 22, AGORA)]).toBe('2026-10-21T21:00');
    expect(TIMES[indexForDayHour(TIMES, 1, 23, AGORA)]).toBe('2026-10-22T00:00');
    expect(indexForDayHour(TIMES, 0, 6, AGORA)).toBe(0);
  });

  it('o «hoje» é o de Lisboa, não o UTC: 00h30 de 21 out em Lisboa (23h30 UTC de 20)', () => {
    const t = ['2026-10-21T00:00', '2026-10-21T03:00', '2026-10-21T06:00', '2026-10-21T09:00', '2026-10-22T09:00'];
    expect(t[indexForDayHour(t, 0, 9, new Date('2026-10-20T23:30:00Z'))]).toBe('2026-10-21T09:00');
    expect(t[indexForDayHour(t, 1, 9, new Date('2026-10-20T23:30:00Z'))]).toBe('2026-10-22T09:00');
  });

  it('sem frames → 0', () => {
    expect(indexForDayHour([], 1, 10, AGORA)).toBe(0);
  });
});

describe('parseDayParam (?dia=)', () => {
  it('aceita só 0 e 1; o resto é ignorado', () => {
    expect(parseDayParam('1')).toBe(1);
    expect(parseDayParam('0')).toBe(0);
    for (const v of ['2', '-1', '1.5', 'x', '', null, undefined]) expect(parseDayParam(v as string | null)).toBeNull();
  });
});
