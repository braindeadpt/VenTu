import { describe, expect, it } from 'vitest';
import { sunTimes } from '@/lib/verdict/sunTimes';

/** Minutos locais do dia (HH:mm no fuso pedido) para comparar com referência. */
function localMinutes(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  return h * 60 + m;
}

describe('sunTimes — NOAA, altitude −0.833°', () => {
  it('Guincho 2026-09-16 → nascer ~07:20, pôr ~19:45 (Europe/Lisbon, ±3 min)', () => {
    const { sunrise, sunset } = sunTimes('2026-09-16', 38.732, -9.472, 'Europe/Lisbon')!;
    expect(Math.abs(localMinutes(sunrise, 'Europe/Lisbon') - (7 * 60 + 20))).toBeLessThanOrEqual(3);
    expect(Math.abs(localMinutes(sunset, 'Europe/Lisbon') - (19 * 60 + 45))).toBeLessThanOrEqual(3);
  });

  it('Açores (Santa Catarina, Terceira) — verão em Atlantic/Azores', () => {
    const { sunrise, sunset } = sunTimes('2026-07-15', 38.683, -27.218, 'Atlantic/Azores')!;
    expect(localMinutes(sunrise, 'Atlantic/Azores')).toBeGreaterThanOrEqual(5 * 60 + 30);
    expect(localMinutes(sunrise, 'Atlantic/Azores')).toBeLessThanOrEqual(7 * 60 + 15);
    expect(localMinutes(sunset, 'Atlantic/Azores')).toBeGreaterThanOrEqual(20 * 60 + 30);
    expect(localMinutes(sunset, 'Atlantic/Azores')).toBeLessThanOrEqual(21 * 60 + 45);
  });

  it('Açores — inverno (mais curto e mais tardio)', () => {
    const { sunrise, sunset } = sunTimes('2026-01-15', 38.683, -27.218, 'Atlantic/Azores')!;
    expect(localMinutes(sunrise, 'Atlantic/Azores')).toBeGreaterThanOrEqual(7 * 60 + 30);
    expect(localMinutes(sunrise, 'Atlantic/Azores')).toBeLessThanOrEqual(8 * 60 + 50);
    expect(localMinutes(sunset, 'Atlantic/Azores')).toBeGreaterThanOrEqual(17 * 60 + 15);
    expect(localMinutes(sunset, 'Atlantic/Azores')).toBeLessThanOrEqual(18 * 60 + 30);
  });

  it('mudança de hora: domingo de Março salta +1h na hora local', () => {
    const before = sunTimes('2026-03-28', 38.732, -9.472, 'Europe/Lisbon')!;
    const after = sunTimes('2026-03-29', 38.732, -9.472, 'Europe/Lisbon')!;
    const jump =
      localMinutes(after.sunrise, 'Europe/Lisbon') -
      localMinutes(before.sunrise, 'Europe/Lisbon');
    // Relógio anda para a frente: o nascer "atrasa" ~1h local (±3 min de deriva solar).
    expect(jump).toBeGreaterThanOrEqual(55);
    expect(jump).toBeLessThanOrEqual(65);
  });

  it('Outubro: relógio atrasa — nascer "adianta" ~1h local', () => {
    const before = sunTimes('2026-10-24', 38.732, -9.472, 'Europe/Lisbon')!;
    const after = sunTimes('2026-10-25', 38.732, -9.472, 'Europe/Lisbon')!;
    const jump =
      localMinutes(after.sunrise, 'Europe/Lisbon') -
      localMinutes(before.sunrise, 'Europe/Lisbon');
    expect(jump).toBeLessThanOrEqual(-55);
    expect(jump).toBeGreaterThanOrEqual(-65);
  });

  it('sol de meia-noite / noite polar → null sem rebentar', () => {
    // Tromsø em Janeiro: Sol nunca nasce — cosH fora de [-1,1].
    expect(sunTimes('2026-01-15', 69.65, 18.96, 'Europe/Oslo')).toBeNull();
  });
});
