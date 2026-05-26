import { getTranslation } from '@/lib/i18n';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { spotDetailHref } from '@/lib/gridSpotScore';
import {
  TOP_NOW_SPORTS,
  getScoreForFilter,
  getTopSpotForSport,
  type HomepageSpotData,
  type TopNowSport,
} from '@/lib/homepageSport';
import SpotListCard from '@/components/spots/SpotListCard';

interface HomepageTopNowProps {
  spotsData: HomepageSpotData[];
  locale: string;
}

const SPORT_ACCENTS: Record<TopNowSport, TopNowSport> = {
  surf: 'surf',
  kitesurf: 'kitesurf',
  windsurf: 'windsurf',
};

export default function HomepageTopNow({ spotsData, locale }: HomepageTopNowProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const cardLocale = isPt ? 'pt' : 'en';

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
      <h2 id="top-now-heading" className="text-h3 text-fg mb-1">
        {t.hero.topNow}
      </h2>
      <p className="text-meta text-fg-muted mb-3">{t.hero.top3Sub}</p>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 list-none p-0 m-0">
        {cards.map(({ sport, data }, i) => {
          const score = getScoreForFilter(data, sport);
          const sportLabel = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];

          return (
            <li
              key={sport}
              className="stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': i * 40 } as React.CSSProperties}
            >
              <SpotListCard
                compact
                name={isPt ? data.spot.name : data.spot.nameEn}
                region={isPt ? data.spot.region : data.spot.regionEn}
                score={score}
                conditions={data.conditions}
                href={spotDetailHref(locale, data.spot.slug, sport)}
                locale={cardLocale}
                sportLabel={sportLabel}
                sportAccent={SPORT_ACCENTS[sport]}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
