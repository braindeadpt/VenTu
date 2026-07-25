'use client';

import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { VentuEvent } from '@/types/events';
import { eventsForSpot, parseEvents } from '@/lib/events';
import { getTranslation } from '@/lib/i18n';
import EventCard from '@/components/events/EventCard';

type Props = {
  spotId: string;
  locale: string;
  /** When provided (SSR/build), skip client fetch. */
  events?: VentuEvent[];
};

export default function SpotUpcomingEvents({ spotId, locale, events: eventsProp }: Props) {
  const t = getTranslation(locale);
  const [events, setEvents] = useState<VentuEvent[]>(eventsProp ?? []);

  useEffect(() => {
    if (eventsProp) {
      setEvents(eventsProp);
      return;
    }
    let cancelled = false;
    void fetch('/data/events.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: unknown) => {
        if (!cancelled) setEvents(parseEvents(raw));
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventsProp]);

  const upcoming = eventsForSpot(events, spotId);
  if (upcoming.length === 0) return null;

  return (
    <section
      className="max-w-6xl mx-auto px-4 py-4 space-y-3"
      aria-labelledby="spot-upcoming-events"
    >
      <div className="flex items-center gap-2">
        <CalendarDays className="w-5 h-5 text-fg-muted" aria-hidden />
        <h2
          id="spot-upcoming-events"
          className="font-display text-h2 text-fg font-semibold tracking-tight"
        >
          {t.news.eventsHeading}
        </h2>
      </div>
      <ul className="space-y-3 list-none p-0 m-0">
        {upcoming.map((event) => (
          <li key={event.id}>
            <EventCard event={event} locale={locale} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}
