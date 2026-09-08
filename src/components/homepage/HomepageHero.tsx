'use client';

import { useEffect, useMemo, useState } from 'react';
import { Map } from 'lucide-react';
import Button from '@/components/ui/Button';
import HomepageSearch from '@/components/ui/HomepageSearch';
import AggregateScoreGauge from '@/components/ui/AggregateScoreGauge';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { MACRO_REGIONS } from '@/lib/regions';
import { readGridFiltersFromWindow, DEFAULT_SPORT as GRID_DEFAULT_SPORT } from '@/lib/gridFilters';
import { type GridSportFilter } from '@/lib/sportRatings';
import {
  type HomepageSpotData,
  getOnCount,
  getSportLabel,
  SPORT_CHANGE_EVENT,
} from '@/lib/homepageSport';

interface HomepageHeroProps {
  locale: string;
  spotsData: HomepageSpotData[];
}

export default function HomepageHero({
  locale,
  spotsData,
}: HomepageHeroProps) {
  const t = getTranslation(locale);
  const [sport, setSport] = useState<GridSportFilter>(GRID_DEFAULT_SPORT);
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

  const onCount = useMemo(() => getOnCount(spotsData, sport), [spotsData, sport]);
  const sportLabel = getSportLabel(sport, locale);
  const calmDay = onCount === 0;

  const headline = calmDay
    ? t.hero.heroCalmToday
    : t.hero.heroFiring.replace('{count}', String(onCount)).replace('{sport}', sportLabel);

  const subline = calmDay
    ? t.hero.heroCalmSubline
    : onCount > 0
      ? t.hero.heroSubline.replace('{count}', String(onCount))
      : t.hero.heroSublineZero;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
      <div
        className="stagger-fade-in flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
        style={{ '--stagger-delay': 0 } as React.CSSProperties}
      >
        <div className="space-y-4 max-w-2xl flex-1 min-w-0">
          <p className="text-[clamp(2rem,5vw,3rem)] font-bold text-fg tracking-tight leading-[1.05]">
            {headline}
          </p>

          <p className="text-body-lg text-fg-muted">{subline}</p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Button
              href={`/${locale}/#explore-map`}
              size="lg"
              leftIcon={<Map className="w-4 h-4" aria-hidden />}
              locale={validateLocale(locale)}
            >
              {t.hero.exploreMap}
            </Button>
            <Button
              href={calmDay ? `/${locale}/explorar/` : `/${locale}/spots/`}
              variant="secondary"
              size="lg"
              locale={validateLocale(locale)}
            >
              {calmDay ? t.hero.viewForecasts : t.hero.viewAllSpots}
            </Button>
          </div>

          <div className="max-w-md w-full">
            <HomepageSearch locale={locale} />
          </div>
        </div>

        <AggregateScoreGauge spotsData={spotsData} sport={sport} locale={locale} />
      </div>
    </section>
  );
}
