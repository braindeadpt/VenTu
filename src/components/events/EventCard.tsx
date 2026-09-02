'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Calendar,
  ExternalLink,
  MapPin,
  Waves,
  Wind,
  Sailboat,
  Monitor,
  Triangle,
  Zap,
  Users,
} from 'lucide-react';
import type { VentuEvent, EventSport } from '@/types/events';
import { safeExternalUrl } from '@/lib/safeUrl';
import { getTranslation } from '@/lib/i18n';

const sportClass: Record<EventSport, string> = {
  surf: 'bg-data-waves/12 text-data-waves border border-data-waves/25',
  kitesurf: 'bg-data-wind/12 text-data-wind border border-data-wind/25',
  windsurf: 'bg-data-waves/12 text-data-waves border border-data-waves/25',
  sup: 'bg-data-water/12 text-data-water border border-data-water/25',
  foil: 'bg-score-fair/12 text-score-fair border border-score-fair/25',
  bodyboard: 'bg-data-period/12 text-data-period border border-data-period/25',
  wakeboard: 'bg-score-good/12 text-score-good border border-score-good/25',
  multi: 'bg-surface-3/40 text-fg border border-divider',
};

const sportIcon: Record<EventSport, React.ReactNode> = {
  surf: <Waves className="w-3.5 h-3.5" aria-hidden />,
  kitesurf: <Wind className="w-3.5 h-3.5" aria-hidden />,
  windsurf: <Sailboat className="w-3.5 h-3.5" aria-hidden />,
  sup: <Monitor className="w-3.5 h-3.5" aria-hidden />,
  foil: <Triangle className="w-3.5 h-3.5" aria-hidden />,
  bodyboard: <Waves className="w-3.5 h-3.5" aria-hidden />,
  wakeboard: <Zap className="w-3.5 h-3.5" aria-hidden />,
  multi: <Users className="w-3.5 h-3.5" aria-hidden />,
};

function formatDayMonth(isoDate: string, locale: string): { day: string; month: string } {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const day = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
  const month = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
  return { day, month };
}

function dateRangeLabel(event: VentuEvent, locale: string): string {
  const start = formatDayMonth(event.startDate, locale);
  if (!event.endDate || event.endDate === event.startDate) {
    return `${start.day} ${start.month}`;
  }
  const end = formatDayMonth(event.endDate, locale);
  return `${start.day}–${end.day} ${end.month}`;
}

type Props = {
  event: VentuEvent;
  locale: string;
  compact?: boolean;
};

export default function EventCard({ event, locale, compact = false }: Props) {
  const t = getTranslation(locale);
  const isPt = locale === 'pt';
  const title = isPt ? event.title : event.titleEn;
  const summary = isPt ? event.summary : event.summaryEn;
  const { day, month } = formatDayMonth(event.startDate, locale);
  const href = event.url ? safeExternalUrl(event.url) : null;
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(event.image) && !imgFailed;
  const badgeClass = sportClass[event.sport] ?? sportClass.multi;
  const icon = sportIcon[event.sport] ?? sportIcon.multi;

  return (
    <article
      className="card-2 overflow-hidden transition-[transform,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none hover:-translate-y-px hover:border-divider-strong hover:shadow-card-hover"
    >
      <div className={`flex ${compact ? 'gap-3 p-3' : 'gap-4 p-4 sm:p-5'}`}>
        <div
          className="shrink-0 w-14 sm:w-16 rounded-input bg-bg-elevated border border-divider flex flex-col items-center justify-center py-2 px-1"
          aria-hidden
        >
          <span className="font-mono tabular-nums text-xl sm:text-2xl font-semibold text-fg leading-none">
            {day}
          </span>
          <span className="font-mono text-meta-sm uppercase text-fg-muted mt-0.5">{month}</span>
          {event.endDate && event.endDate !== event.startDate && (
            <span className="sr-only">{dateRangeLabel(event, locale)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}
            >
              {icon}
              {event.sport}
            </span>
            <span className="inline-flex items-center gap-1 text-meta-sm text-fg-subtle">
              <Calendar className="w-3 h-3" aria-hidden />
              {dateRangeLabel(event, locale)}
            </span>
            {event.free === true && (
              <span className="text-meta-sm text-fg-muted">{t.news.eventFree}</span>
            )}
          </div>

          <h3 className={`font-display font-semibold text-fg tracking-tight ${compact ? 'text-base' : 'text-lg'}`}>
            {title}
          </h3>

          {!compact && summary && (
            <p className="text-sm text-fg-muted line-clamp-2">{summary}</p>
          )}

          <p className="flex items-start gap-1.5 text-sm text-fg-subtle">
            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
            <span className="line-clamp-2">{event.location}</span>
          </p>

          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-data-waves hover:text-data-waves/80 transition-colors duration-200 ease-out motion-reduce:transition-none"
            >
              {t.news.eventRegister}
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            </a>
          )}
        </div>

        {showImage && event.image && !compact && (
          <div className="hidden sm:block relative w-28 h-28 shrink-0 rounded-input overflow-hidden border border-divider bg-surface-2">
            <Image
              src={event.image}
              alt=""
              fill
              unoptimized
              className="object-cover"
              onError={() => setImgFailed(true)}
            />
          </div>
        )}
      </div>
    </article>
  );
}
