import { describe, expect, it } from 'vitest';
import { formatUpcomingWindowLabel } from '@/lib/upcomingWindowLabel';

/** Stub do dayLabel da secção: dia relativo a 2026-10-07. */
function dayLabelFor(labels: Record<string, string>) {
  return (iso: string) => labels[iso.slice(0, 10)] ?? '??';
}

describe('formatUpcomingWindowLabel', () => {
  const pt = dayLabelFor({ '2026-10-07': 'Hoje', '2026-10-08': 'Amanhã', '2026-10-09': 'Sex' });
  const en = dayLabelFor({ '2026-10-07': 'Today', '2026-10-08': 'Tomorrow', '2026-10-09': 'Fri' });
  const de = dayLabelFor({ '2026-10-07': 'Heute', '2026-10-08': 'Morgen', '2026-10-09': 'Fr' });

  it('janela no mesmo dia mantém o formato compacto', () => {
    expect(
      formatUpcomingWindowLabel('2026-10-07T07:00', '2026-10-07T12:00', pt, 'pt', 'Amanhã'),
    ).toEqual({ day: 'Hoje', hours: '07–12h', crossesMidnight: false });
  });

  it('janela nocturna indica o dia seguinte («Hoje 22h – amanhã 10h»)', () => {
    const r = formatUpcomingWindowLabel('2026-10-07T22:00', '2026-10-08T10:00', pt, 'pt', 'Amanhã');
    expect(r.crossesMidnight).toBe(true);
    expect(`${r.day} ${r.hours}`).toBe('Hoje 22h – amanhã 10h');
  });

  it('a partir de amanhã o fim usa o dia da semana (minúscula em PT)', () => {
    const r = formatUpcomingWindowLabel('2026-10-08T23:00', '2026-10-09T09:00', pt, 'pt', 'Amanhã');
    expect(`${r.day} ${r.hours}`).toBe('Amanhã 23h – sex 09h');
  });

  it('EN/DE mantêm maiúscula nos dias da semana, minúscula no «tomorrow/morgen»', () => {
    expect(
      formatUpcomingWindowLabel('2026-10-07T22:00', '2026-10-08T10:00', en, 'en', 'Tomorrow').hours,
    ).toBe('22h – tomorrow 10h');
    expect(
      formatUpcomingWindowLabel('2026-10-08T22:00', '2026-10-09T10:00', en, 'en', 'Tomorrow').hours,
    ).toBe('22h – Fri 10h');
    expect(
      formatUpcomingWindowLabel('2026-10-07T22:00', '2026-10-08T10:00', de, 'de', 'Morgen').hours,
    ).toBe('22h – morgen 10h');
    expect(
      formatUpcomingWindowLabel('2026-10-08T22:00', '2026-10-09T10:00', de, 'de', 'Morgen').hours,
    ).toBe('22h – Fr 10h');
  });
});
