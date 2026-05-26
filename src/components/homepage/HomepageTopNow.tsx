import { Clock, Wind, Waves } from 'lucide-react';
import Card from '@/components/ui/Card';
import ScoreBadge from '@/components/ui/ScoreBadge';
import { getTranslation } from '@/lib/i18n';
import { SPORT_LABELS } from '@/lib/sportRatings';
import {
  TOP_NOW_SPORTS,
  getScoreForFilter,
  getTopSpotForSport,
  type HomepageSpotData,
  type TopNowSport,
} from '@/lib/homepageSport';

interface HomepageTopNowProps {
  spotsData: HomepageSpotData[];
  locale: string;
}

const SPORT_ACCENTS: Record<TopNowSport, TopNowSport> = {
  surf: 'surf',
  kitesurf: 'kitesurf',
  windsurf: 'windsurf',
};

function spotHref(locale: string, slug: string, sport: TopNowSport) {
  return `/${locale}/spots/${slug}/?sport=${sport}`;
}

export default function HomepageTopNow({ spotsData, locale }: HomepageTopNowProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');

  const cards = TOP_NOW_SPORTS.map((sport) => ({
    sport,
    data: getTopSpotForSport(spotsData, sport),
  })).filter((entry): entry is { sport: TopNowSport; data: HomepageSpotData } => entry.data !== null);

  if (cards.length === 0) {
    return null;
  }

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6"
      aria-labelledby="top-now-heading"
    >
      <h2 id="top-now-heading" className="text-h3 text-fg mb-3">
        {t.hero.topNow}
      </h2>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 list-none p-0 m-0">
        {cards.map(({ sport, data }, i) => {
          const score = getScoreForFilter(data, sport);
          const windKt = Math.round(data.conditions.windSpeed * 1.94384);
          const sportLabel = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];
          const href = spotHref(locale, data.spot.slug, sport);

          return (
            <li
              key={sport}
              className="stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': i * 40 } as React.CSSProperties}
            >
              <Card hoverable href={href} className="p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span
                    className="pill pill-ghost gap-1 px-2 py-0.5 min-h-0 text-meta-sm sport-accent shrink-0"
                    data-sport={SPORT_ACCENTS[sport]}
                  >
                    {sportLabel}
                  </span>
                  <ScoreBadge score={score} locale={isPt ? 'pt' : 'en'} size="sm" />
                </div>

                <div className="min-w-0">
                  <h3 className="text-body font-semibold text-fg truncate">
                    {isPt ? data.spot.name : data.spot.nameEn}
                  </h3>
                  <p className="text-meta-sm text-fg-muted truncate">
                    {isPt ? data.spot.region : data.spot.regionEn}
                  </p>
                </div>

                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta-sm text-fg-muted font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Waves className="w-3 h-3 text-data-waves" aria-hidden />
                    {data.conditions.waveHeight.toFixed(1)}m
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-data-period" aria-hidden />
                    {Math.round(data.conditions.wavePeriod)}s
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Wind className="w-3 h-3 text-data-wind" aria-hidden />
                    {windKt}kt
                  </span>
                </p>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
