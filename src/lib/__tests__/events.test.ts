import { describe, expect, it } from 'vitest';
import {
  eventEndDateKey,
  isUpcoming,
  lisbonDateKey,
  parseEvents,
  sortUpcoming,
} from '@/lib/events';
import type { VentuEvent } from '@/types/events';

function base(partial: Partial<VentuEvent> & Pick<VentuEvent, 'id' | 'startDate'>): VentuEvent {
  return {
    title: 'Test',
    titleEn: 'Test',
    summary: 'Resumo',
    summaryEn: 'Summary',
    location: 'Praia X',
    spotIds: ['guincho'],
    sport: 'kitesurf',
    kind: 'festival',
    ...partial,
  };
}

/** Instant that is `hourLisbon` on `ymd` (YYYY-MM-DD) in Europe/Lisbon. */
function atLisbon(ymd: string, hourLisbon: number, minute = 0): Date {
  // Probe UTC offsets around the day; Lisbon is UTC+0 or +1.
  for (const offsetH of [0, 1]) {
    const utc = new Date(
      `${ymd}T${String(hourLisbon).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`,
    );
    utc.setUTCHours(utc.getUTCHours() - offsetH);
    if (lisbonDateKey(utc) === ymd) {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Lisbon',
        hour: 'numeric',
        hour12: false,
        minute: 'numeric',
      }).formatToParts(utc);
      const h = Number(parts.find((p) => p.type === 'hour')?.value);
      const m = Number(parts.find((p) => p.type === 'minute')?.value);
      if (h === hourLisbon && m === minute) return utc;
    }
  }
  // Fallback: binary-search a UTC ms that maps to the Lisbon wall time
  const start = Date.parse(`${ymd}T00:00:00.000Z`) - 12 * 3600_000;
  for (let ms = start; ms < start + 48 * 3600_000; ms += 60_000) {
    const d = new Date(ms);
    if (lisbonDateKey(d) !== ymd) continue;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      hour: 'numeric',
      hour12: false,
      minute: 'numeric',
    }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (h === hourLisbon && m === minute) return d;
  }
  throw new Error(`Could not resolve Lisbon ${ymd} ${hourLisbon}:${minute}`);
}

describe('events Lisbon dates', () => {
  it('lisbonDateKey never uses UTC calendar from toISOString', () => {
    // 2026-08-09 23:30 UTC = 2026-08-10 00:30 Lisbon (WEST)
    const d = new Date('2026-08-09T23:30:00.000Z');
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-09');
    expect(lisbonDateKey(d)).toBe('2026-08-10');
  });

  it('multi-day event still ongoing today counts as upcoming', () => {
    const event = base({
      id: 'multi',
      startDate: '2026-08-07',
      endDate: '2026-08-09',
    });
    const mid = atLisbon('2026-08-08', 12);
    expect(isUpcoming(event, mid)).toBe(true);
    expect(eventEndDateKey(event)).toBe('2026-08-09');
  });

  it('event that ended yesterday is not upcoming', () => {
    const event = base({
      id: 'past',
      startDate: '2026-08-01',
      endDate: '2026-08-07',
    });
    const now = atLisbon('2026-08-08', 10);
    expect(isUpcoming(event, now)).toBe(false);
  });

  it('inclusive through end of endDate in Lisbon (midnight boundary)', () => {
    const event = base({
      id: 'boundary',
      startDate: '2026-08-07',
      endDate: '2026-08-09',
    });
    // Late evening still on end day in Lisbon
    expect(isUpcoming(event, atLisbon('2026-08-09', 23, 30))).toBe(true);
    // Just after midnight Lisbon on the next calendar day
    expect(isUpcoming(event, atLisbon('2026-08-10', 0, 15))).toBe(false);
  });

  it('single-day event uses startDate as end', () => {
    const event = base({ id: 'one-day', startDate: '2026-08-15' });
    expect(isUpcoming(event, atLisbon('2026-08-15', 18))).toBe(true);
    expect(isUpcoming(event, atLisbon('2026-08-16', 0, 5))).toBe(false);
  });

  it('sortUpcoming orders by startDate ascending', () => {
    const a = base({ id: 'b', startDate: '2026-09-01' });
    const b = base({ id: 'a', startDate: '2026-08-01' });
    const c = base({ id: 'c', startDate: '2026-08-01' });
    expect(sortUpcoming([a, c, b]).map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('parseEvents drops rows without valid startDate or location', () => {
    const parsed = parseEvents([
      {
        id: 'ok',
        title: 'Ok',
        titleEn: 'Ok',
        summary: 'S',
        summaryEn: 'S',
        startDate: '2026-08-07',
        location: 'Esposende',
        spotIds: [],
        sport: 'kitesurf',
        kind: 'festival',
      },
      {
        id: 'no-date',
        title: 'X',
        titleEn: 'X',
        summary: 'S',
        summaryEn: 'S',
        location: 'Somewhere',
        spotIds: [],
        sport: 'surf',
        kind: 'other',
      },
      {
        id: 'no-loc',
        title: 'X',
        titleEn: 'X',
        summary: 'S',
        summaryEn: 'S',
        startDate: '2026-08-07',
        spotIds: [],
        sport: 'surf',
        kind: 'other',
      },
    ]);
    expect(parsed.map((e) => e.id)).toEqual(['ok']);
  });

  it('parseEvents keeps only http(s) event URLs (S3)', () => {
    const parsed = parseEvents([
      {
        id: 'safe',
        title: 'Ok',
        titleEn: 'Ok',
        startDate: '2026-08-07',
        location: 'Esposende',
        spotIds: [],
        sport: 'kitesurf',
        kind: 'festival',
        url: 'https://example.com/inscricao',
      },
      {
        id: 'bad-js',
        title: 'Bad',
        titleEn: 'Bad',
        startDate: '2026-08-07',
        location: 'Esposende',
        spotIds: [],
        sport: 'kitesurf',
        kind: 'festival',
        url: 'javascript:alert(1)',
      },
      {
        id: 'bad-data',
        title: 'Bad2',
        titleEn: 'Bad2',
        startDate: '2026-08-07',
        location: 'Esposende',
        spotIds: [],
        sport: 'kitesurf',
        kind: 'festival',
        url: 'data:text/html,<script>1</script>',
      },
    ]);
    expect(parsed.find((e) => e.id === 'safe')?.url).toBe('https://example.com/inscricao');
    expect(parsed.find((e) => e.id === 'bad-js')?.url).toBeUndefined();
    expect(parsed.find((e) => e.id === 'bad-data')?.url).toBeUndefined();
  });

  it('parseEvents keeps only http(s) or site-relative event images (S3)', () => {
    const parsed = parseEvents([
      {
        id: 'img-ok',
        title: 'Ok',
        startDate: '2026-08-07',
        location: 'Esposende',
        spotIds: [],
        sport: 'kitesurf',
        kind: 'festival',
        image: '/images/events/nortada-kite-fest.jpg',
      },
      {
        id: 'img-ext',
        title: 'Ok2',
        startDate: '2026-08-07',
        location: 'Esposende',
        spotIds: [],
        sport: 'kitesurf',
        kind: 'festival',
        image: 'https://cdn.ventu.surf/flyer.jpg',
      },
      {
        id: 'img-bad',
        title: 'Bad',
        startDate: '2026-08-07',
        location: 'Esposende',
        spotIds: [],
        sport: 'kitesurf',
        kind: 'festival',
        image: 'data:image/svg+xml,<svg onload=alert(1)>',
      },
      {
        id: 'img-rel',
        title: 'Rel',
        startDate: '2026-08-07',
        location: 'Esposende',
        spotIds: [],
        sport: 'kitesurf',
        kind: 'festival',
        image: '//evil.com/x.png',
      },
    ]);
    expect(parsed.find((e) => e.id === 'img-ok')?.image).toBe('/images/events/nortada-kite-fest.jpg');
    expect(parsed.find((e) => e.id === 'img-ext')?.image).toBe('https://cdn.ventu.surf/flyer.jpg');
    expect(parsed.find((e) => e.id === 'img-bad')?.image).toBeUndefined();
    expect(parsed.find((e) => e.id === 'img-rel')?.image).toBeUndefined();
  });
});
