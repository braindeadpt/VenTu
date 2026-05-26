'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Map } from 'lucide-react';
import Button from '@/components/ui/Button';
import HomepageSearch from '@/components/ui/HomepageSearch';
import { getTranslation } from '@/lib/i18n';
import { MACRO_REGIONS } from '@/lib/regions';
import { readGridFiltersFromWindow } from '@/lib/gridFilters';
import {
  type GridSportFilter,
} from '@/lib/sportRatings';
import {
  type HomepageSpotData,
  sortSpotsBySport,
  getOnCount,
  getScoreForFilter,
  getSportLabel,
  SPORT_CHANGE_EVENT,
} from '@/lib/homepageSport';

interface HomepageHeroProps {
  locale: string;
  spotsData: HomepageSpotData[];
  initialSport?: GridSportFilter;
  maxTs: number | null;
  hoursSinceMin: number;
}

export default function HomepageHero({
  locale,
  spotsData,
  initialSport = 'surf',
  maxTs,
  hoursSinceMin,
}: HomepageHeroProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const [sport, setSport] = useState<GridSportFilter>(initialSport);
  const [hoursAgo, setHoursAgo] = useState<number | null>(
    maxTs ? Math.max(0, Math.floor((Date.now() - maxTs) / 3600000)) : null,
  );

  useEffect(() => {
    if (!maxTs) return;
    setHoursAgo(Math.max(0, Math.floor((Date.now() - maxTs) / 3600000)));
  }, [maxTs]);

  useEffect(() => {
    const syncFromLocation = () => {
      const { sport: urlSport } = readGridFiltersFromWindow(MACRO_REGIONS);
      setSport(urlSport);
    };
    syncFromLocation();

    const onSportChange = (e: Event) => {
      const detail = (e as CustomEvent<GridSportFilter>).detail;
      if (detail) setSport(detail);
    };

    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener(SPORT_CHANGE_EVENT, onSportChange);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener(SPORT_CHANGE_EVENT, onSportChange);
    };
  }, []);

  const sorted = useMemo(() => sortSpotsBySport(spotsData, sport), [spotsData, sport]);
  const bestSpot = sorted.find((d) => getScoreForFilter(d, sport) > 0) ?? sorted[0];
  const onCount = getOnCount(spotsData, sport);
  const sportLabel = getSportLabel(sport, isPt);
  const bestScore = bestSpot ? getScoreForFilter(bestSpot, sport) : 0;

  const headline =
    onCount === 0
      ? isPt
        ? `0 spots ON para ${sportLabel} hoje`
        : `0 spots ON for ${sportLabel} today`
      : onCount === 1
        ? isPt
          ? `1 spot ON para ${sportLabel} hoje`
          : `1 spot ON for ${sportLabel} today`
        : isPt
          ? `${onCount} spots ON para ${sportLabel} hoje`
          : `${onCount} spots ON for ${sportLabel} today`;

  const dotColor =
    hoursSinceMin < 3
      ? 'bg-[rgb(var(--score-good))]'
      : hoursSinceMin < 12
        ? 'bg-[rgb(var(--score-fair))]'
        : 'bg-[rgb(var(--score-poor))]';

  const bestHref =
    bestSpot && bestScore > 0
      ? `/${locale}/spots/${bestSpot.spot.slug}/?sport=${sport}`
      : null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
      <div
        className="stagger-fade-in flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
        style={{ '--stagger-delay': 0 } as React.CSSProperties}
      >
        <div className="space-y-3 max-w-2xl">
          <span
            className="pill pill-ghost inline-flex items-center gap-1.5 px-2 py-1 min-h-0 text-meta motion-reduce:transition-none transition-opacity duration-150"
            title={
              isPt
                ? 'Hora da última actualização de condições'
                : 'Time of last conditions update'
            }
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} aria-hidden />
            {hoursAgo !== null ? (
              <span className="font-mono tabular-nums text-fg-muted">
                {t.hero.updatedAgo.replace('{hours}', String(hoursAgo))}
              </span>
            ) : (
              <span className="text-fg-muted">{t.hero.statusNoData}</span>
            )}
          </span>

          <h2 className="text-[clamp(1.75rem,4vw,2.25rem)] font-bold text-fg tracking-tight leading-[1.1]">
            {headline}
          </h2>

          {bestHref && bestSpot ? (
            <p className="text-body-lg text-fg-muted">
              {isPt ? 'Melhor agora' : 'Best now'}:{' '}
              <Link
                href={bestHref}
                className="text-fg font-medium hover:text-data-waves transition-colors duration-150"
              >
                {isPt ? bestSpot.spot.name : bestSpot.spot.nameEn}
              </Link>
              <span className="font-mono tabular-nums text-fg ml-1">· {bestScore}</span>
            </p>
          ) : (
            <p className="text-body-lg text-fg-muted">{t.hero.heroSublineZero}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 shrink-0">
          <Button
            href={`/${locale}/#explore-map`}
            size="lg"
            leftIcon={<Map className="w-4 h-4" aria-hidden />}
            locale={isPt ? 'pt' : 'en'}
          >
            {t.hero.exploreMap}
          </Button>
          <Button
            href={`/${locale}/spots/`}
            variant="secondary"
            size="lg"
            locale={isPt ? 'pt' : 'en'}
          >
            {t.hero.viewAllSpots}
          </Button>
        </div>
      </div>

      <div
        className="stagger-fade-in mt-5 max-w-md motion-reduce:animate-none"
        style={{ '--stagger-delay': 80 } as React.CSSProperties}
      >
        <HomepageSearch locale={locale} />
      </div>
    </section>
  );
}
