'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getScoreRgb } from '@/lib/map-constants';
import { truncateAtWord } from '@/lib/text';
import { type GridSportFilter } from '@/lib/sportRatings';
import HomepageSearch from '@/components/ui/HomepageSearch';
import { MACRO_REGIONS } from '@/lib/regions';
import { readGridFiltersFromWindow } from '@/lib/gridFilters';
import {
  type HomepageSpotData,
  sortSpotsBySport,
  getOnCount,
  getScoreForFilter,
  getSportLabel,
  SPORT_CHANGE_EVENT,
} from '@/lib/homepageSport';

interface HomepageFeaturedProps {
  spotsData: HomepageSpotData[];
  locale: string;
  initialSport: GridSportFilter;
  dawnHeadline?: string | null;
}

export default function HomepageFeatured({
  spotsData,
  locale,
  initialSport,
  dawnHeadline,
}: HomepageFeaturedProps) {
  const isPt = locale === 'pt';
  const [sport, setSport] = useState<GridSportFilter>(initialSport);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

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
  const bestSpot = sorted.find(d => getScoreForFilter(d, sport) > 0) ?? sorted[0];
  const tickerSpots = sorted.filter(d => getScoreForFilter(d, sport) > 0).slice(0, 5);
  const onCount = getOnCount(spotsData, sport);
  const sportLabel = getSportLabel(sport, isPt);
  const bestScore = bestSpot ? getScoreForFilter(bestSpot, sport) : 0;

  const headline =
    onCount === 0
      ? isPt
        ? `0 spots ON para ${sportLabel} hoje — descobre os melhores próximos dias`
        : `0 spots ON for ${sportLabel} today — discover the best in coming days`
      : onCount === 1
        ? isPt
          ? `1 spot ON para ${sportLabel} hoje`
          : `1 spot ON for ${sportLabel} today`
        : isPt
          ? `${onCount} spots ON para ${sportLabel} hoje`
          : `${onCount} spots ON for ${sportLabel} today`;

  const sportAccent = sport === 'all' ? 'all' : sport === 'big-wave' ? 'surf' : sport;

  return (
    <>
      {tickerSpots.length > 0 ? (
        <div
          className="w-full bg-surface-1 border-y border-divider overflow-x-auto scrollbar-hide"
          role="region"
          aria-label={isPt ? `Spots em destaque — ${sportLabel}` : `Top spots — ${sportLabel}`}
          aria-live="off"
        >
          <div className="edge-fade-x">
            <ul
              role="list"
              className="flex animate-marquee whitespace-nowrap motion-reduce:animate-none hover:[animation-play-state:paused]"
              style={{ animationDuration: '60s' }}
            >
              {[...tickerSpots, ...tickerSpots].map((data, i) => {
                const score = getScoreForFilter(data, sport);
                const color = getScoreRgb(score);
                const isClone = i >= tickerSpots.length;
                const spotHref =
                  sport !== 'all' && sport !== 'big-wave'
                    ? `/${locale}/spots/${data.spot.slug}/?sport=${sport}`
                    : `/${locale}/spots/${data.spot.slug}/`;
                return (
                  <li key={`${data.spot.id}-${sport}-${i}`} className="inline-flex" aria-hidden={isClone || undefined}>
                    <Link
                      href={spotHref}
                      className="inline-flex items-center gap-3 px-5 py-1.5 hover:bg-surface-2 transition-colors"
                      tabIndex={isClone ? -1 : 0}
                    >
                      <span className="w-0.5 h-4 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-sans font-semibold text-sm text-fg">
                        {isPt ? data.spot.name : data.spot.nameEn}
                      </span>
                      <span className="font-mono text-xs text-fg-subtle">
                        {data.conditions.waveHeight.toFixed(1)}m · {(data.conditions.windSpeed * 1.94384).toFixed(0)}kt
                      </span>
                      <span className="font-mono text-xs font-bold tabular-nums" style={{ color }}>
                        {score}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <div className="w-full bg-surface-1 border-y border-divider px-4 py-2 text-center text-meta text-fg-muted">
          {isPt ? 'A carregar condições...' : 'Loading conditions...'}
        </div>
      )}

      {bestSpot && (
        <section className="relative min-h-[30vh] md:min-h-[40vh] flex items-center justify-center overflow-hidden py-8 md:py-8 bg-bg-base">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none hero-radial-glow">
            <div className="hero-radial-glow-disc absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgb(var(--score-good))_0%,transparent_70%)]" />
          </div>

          <div className="relative z-10 max-w-3xl mx-auto px-4 text-center space-y-6">
            <p className="text-meta-sm text-fg-subtle font-mono uppercase tracking-wider">
              {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' })
                .format(new Date())
                .replace(/^\w/, c => c.toUpperCase())}
              {dawnHeadline && ` · ${truncateAtWord(dawnHeadline, 50)}`}
            </p>

            <h2 className="text-display-xl font-sans text-fg tracking-tight" suppressHydrationWarning={!mounted}>
              {headline}
            </h2>

            <p className="text-h3 text-fg-muted">
              {isPt ? 'Top score' : 'Top score'}:{' '}
              <Link
                href={
                  sport !== 'all' && sport !== 'big-wave'
                    ? `/${locale}/spots/${bestSpot.spot.slug}/?sport=${sport}`
                    : `/${locale}/spots/${bestSpot.spot.slug}/`
                }
                className="underline decoration-dotted underline-offset-4 hover:text-fg transition-colors"
              >
                {isPt ? bestSpot.spot.name : bestSpot.spot.nameEn}
              </Link>{' '}
              <span className="font-mono tabular-nums">{bestScore}/100</span>
              {' · '}
              <span className="sport-accent" data-sport={sportAccent}>
                {sportLabel}
              </span>
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <HomepageSearch locale={locale} />
              <Link
                href={`/${locale}/spots/`}
                className="inline-flex items-center justify-center gap-2 h-12 px-6 border border-divider rounded-full text-fg hover:bg-surface-2 transition-colors font-medium"
              >
                {isPt ? 'Ver todos' : 'View all'}
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
