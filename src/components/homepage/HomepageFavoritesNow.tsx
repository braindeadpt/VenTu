'use client';

import { useMemo } from 'react';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { spotDetailHref } from '@/lib/gridSpotScore';
import {
  getScoreForFilter,
  readSportFromStorage,
  type HomepageSpotData,
} from '@/lib/homepageSport';
import { tierPhrase } from '@/lib/voice';
import SpotListCard from '@/components/spots/SpotListCard';

interface HomepageFavoritesNowProps {
  locale: string;
  spotsData: HomepageSpotData[];
  favoriteIds: string[];
}

export default function HomepageFavoritesNow({
  locale,
  spotsData,
  favoriteIds,
}: HomepageFavoritesNowProps) {
  const isPt = locale === 'pt';
  const cardLocale = isPt ? 'pt' : 'en';
  const preferredSport = readSportFromStorage();

  const cards = useMemo(() => {
    const byId = new Map(spotsData.map((d) => [d.spot.id, d]));
    return favoriteIds
      .map((id) => byId.get(id))
      .filter((d): d is HomepageSpotData => Boolean(d))
      .map((data) => {
        const sport =
          preferredSport !== 'all' &&
          preferredSport !== 'big-wave' &&
          data.spot.compatibleSports?.includes(preferredSport as SportType)
            ? (preferredSport as SportType)
            : (data.spot.compatibleSports?.[0] as SportType) || 'surf';
        const score = getScoreForFilter(data, sport);
        return { data, sport, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [favoriteIds, spotsData, preferredSport]);

  if (cards.length === 0) return null;

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4"
      aria-labelledby="your-spots-heading"
    >
      <h2
        id="your-spots-heading"
        className="font-display text-display-lg text-fg tracking-tight mb-1"
      >
        {isPt ? 'Os teus spots, agora' : 'Your spots, right now'}
      </h2>
      <p className="text-meta text-fg-muted mb-4">
        {isPt
          ? 'Favoritos com condições frescas — toca para ver o spot'
          : 'Favorites with fresh conditions — tap to open'}
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 list-none p-0 m-0">
        {cards.map(({ data, sport, score }, i) => {
          const sportLabel = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];
          const statusLine = tierPhrase(score, isPt);

          return (
            <li
              key={data.spot.id}
              className="stagger-fade-in motion-reduce:animate-none"
              style={{ '--stagger-delay': i * 40 } as React.CSSProperties}
            >
              <SpotListCard
                withImage
                spot={data.spot}
                name={isPt ? data.spot.name : data.spot.nameEn}
                region={isPt ? data.spot.region : data.spot.regionEn}
                score={score}
                conditions={data.conditions}
                href={spotDetailHref(locale, data.spot.slug, sport)}
                locale={cardLocale}
                sportLabel={sportLabel}
                sportAccent={sport}
                statusLine={statusLine}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
