import type { EventKind, EventSport, VentuEvent } from '@/types/events';
import { EVENT_KINDS, EVENT_SPORTS } from '@/types/events';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HM = /^\d{2}:\d{2}$/;

/** Calendar YYYY-MM-DD in Europe/Lisbon (never UTC via toISOString). */
export function lisbonDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

function isSport(value: unknown): value is EventSport {
  return typeof value === 'string' && (EVENT_SPORTS as readonly string[]).includes(value);
}

function isKind(value: unknown): value is EventKind {
  return typeof value === 'string' && (EVENT_KINDS as readonly string[]).includes(value);
}

/** Last calendar day the event is considered live (Lisbon date key). */
export function eventEndDateKey(event: Pick<VentuEvent, 'startDate' | 'endDate'>): string {
  return event.endDate && isIsoDate(event.endDate) ? event.endDate : event.startDate;
}

/**
 * Upcoming or ongoing through the end of endDate (or startDate) in Lisbon.
 * Inclusive of the end calendar day — not cut off at start midnight.
 */
export function isUpcoming(
  event: Pick<VentuEvent, 'startDate' | 'endDate'>,
  now: Date = new Date(),
): boolean {
  if (!isIsoDate(event.startDate)) return false;
  const today = lisbonDateKey(now);
  return eventEndDateKey(event) >= today;
}

/** Ascending by startDate, then id. */
export function sortUpcoming(events: VentuEvent[]): VentuEvent[] {
  return [...events].sort((a, b) => {
    const byDate = a.startDate.localeCompare(b.startDate);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
}

export function upcomingEvents(events: VentuEvent[], now: Date = new Date()): VentuEvent[] {
  return sortUpcoming(events.filter((e) => isUpcoming(e, now)));
}

/** Explicit spotIds match only — no region/proximity inference. */
export function eventsForSpot(
  events: VentuEvent[],
  spotId: string,
  now: Date = new Date(),
  limit = 3,
): VentuEvent[] {
  return upcomingEvents(
    events.filter((e) => Array.isArray(e.spotIds) && e.spotIds.includes(spotId)),
    now,
  ).slice(0, limit);
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t ? t : undefined;
}

/**
 * Safe parse of events.json. Drops entries missing valid startDate or location
 * (same honesty rule as forecast windows — never invent / never render garbage).
 */
export function parseEvents(raw: unknown): VentuEvent[] {
  if (!Array.isArray(raw)) return [];

  const out: VentuEvent[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;

    const id = asOptionalString(e.id);
    const title = asOptionalString(e.title);
    const location = asOptionalString(e.location);
    if (!id || !title || !location) continue;
    if (!isIsoDate(e.startDate)) continue;
    if (seen.has(id)) continue;

    const endDate = asOptionalString(e.endDate);
    if (endDate !== undefined) {
      if (!isIsoDate(endDate) || endDate < e.startDate) continue;
    }

    const startTime = asOptionalString(e.startTime);
    if (startTime !== undefined && !TIME_HM.test(startTime)) continue;

    if (!isSport(e.sport) || !isKind(e.kind)) continue;

    const spotIds = Array.isArray(e.spotIds)
      ? e.spotIds.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      : [];

    const titleEn = asOptionalString(e.titleEn) ?? title;
    const summary = asOptionalString(e.summary) ?? '';
    const summaryEn = asOptionalString(e.summaryEn) ?? summary;

    seen.add(id);
    out.push({
      id,
      title,
      titleEn,
      summary,
      summaryEn,
      startDate: e.startDate,
      ...(endDate ? { endDate } : {}),
      ...(startTime ? { startTime } : {}),
      location,
      spotIds,
      ...(asOptionalString(e.region) ? { region: asOptionalString(e.region) } : {}),
      sport: e.sport,
      kind: e.kind,
      ...(asOptionalString(e.organizer) ? { organizer: asOptionalString(e.organizer) } : {}),
      ...(asOptionalString(e.url) ? { url: asOptionalString(e.url) } : {}),
      ...(asOptionalString(e.image) ? { image: asOptionalString(e.image) } : {}),
      ...(typeof e.free === 'boolean' ? { free: e.free } : {}),
    });
  }

  return out;
}
