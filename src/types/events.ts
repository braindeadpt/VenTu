/** Curated community / competition events (public/data/events.json). */

export const EVENT_SPORTS = [
  'surf',
  'kitesurf',
  'windsurf',
  'sup',
  'foil',
  'wakeboard',
  'bodyboard',
  'multi',
] as const;

export type EventSport = (typeof EVENT_SPORTS)[number];

export const EVENT_KINDS = [
  'competition',
  'clinic',
  'festival',
  'gathering',
  'other',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface VentuEvent {
  /** Unique kebab-case id */
  id: string;
  title: string;
  titleEn: string;
  /** 1–2 sentences */
  summary: string;
  summaryEn: string;
  /** ISO date YYYY-MM-DD (required) */
  startDate: string;
  /** ISO date YYYY-MM-DD — multi-day end (optional) */
  endDate?: string;
  /** Local wall time HH:MM (optional) */
  startTime?: string;
  /** Human-readable place (required) */
  location: string;
  /** Real spot ids from src/lib/spots.ts */
  spotIds: string[];
  region?: string;
  sport: EventSport;
  kind: EventKind;
  organizer?: string;
  /** Official / registration URL */
  url?: string;
  /** Path under public/, e.g. /images/events/foo.jpg */
  image?: string;
  free?: boolean;
}
