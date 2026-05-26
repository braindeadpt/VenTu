'use client';

import type { GridSportFilter } from '@/lib/sportRatings';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { getTranslation } from '@/lib/i18n';
import { getSportLabel } from '@/lib/homepageSport';
import { getGridSpotScore, spotDetailHref } from '@/lib/gridSpotScore';
import SpotListCard from './SpotListCard';

const LIST_LIMIT = 12;
const TOP_HIGHLIGHT = 3;

interface SpotGridRankedListProps {
  sorted: GridSpotData[];
  selectedSport: GridSportFilter;
  locale: string;
}

export default function SpotGridRankedList({
  sorted,
  selectedSport,
  locale,
}: SpotGridRankedListProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const sportLabel = getSportLabel(selectedSport, isPt);

  if (sorted.length === 0) {
    return null;
  }

  const ranked = sorted.slice(0, LIST_LIMIT);
  const top = ranked.slice(0, TOP_HIGHLIGHT);
  const rest = ranked.slice(TOP_HIGHLIGHT);

  const title =
    selectedSport === 'all'
      ? isPt
        ? 'Melhores spots agora'
        : 'Best spots right now'
      : top.length === 1
        ? `${t.hero.top3One} ${sportLabel}`
        : `${t.hero.top3} ${sportLabel}`;

  const subtitle =
    selectedSport === 'all'
      ? isPt
        ? 'Ordenados pelo melhor score entre desportos compatíveis'
        : 'Sorted by best score across compatible sports'
      : top.length === 1
        ? t.hero.top3OneSub
        : t.hero.top3Sub;

  return (
    <section className="mb-10" aria-labelledby="spot-ranked-heading">
      <div className="mb-4">
        <h2 id="spot-ranked-heading" className="text-h2 text-fg">
          {title}
        </h2>
        <p className="text-meta text-fg-muted mt-1">{subtitle}</p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 list-none p-0 m-0 mb-6">
        {top.map((data, i) => (
          <li key={data.spot.id}>
            <SpotListCard
              name={isPt ? data.spot.name : data.spot.nameEn}
              region={isPt ? data.spot.region : data.spot.regionEn}
              score={getGridSpotScore(data, selectedSport)}
              conditions={data.conditions}
              href={spotDetailHref(locale, data.spot.slug, selectedSport)}
              locale={isPt ? 'pt' : 'en'}
              rank={i + 1}
            />
          </li>
        ))}
      </ul>

      {rest.length > 0 && (
        <>
          <h3 className="text-h3 text-fg mb-3">
            {isPt ? 'Mais spots na região' : 'More spots in region'}
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 list-none p-0 m-0">
            {rest.map((data) => (
              <li key={data.spot.id}>
                <SpotListCard
                  compact
                  name={isPt ? data.spot.name : data.spot.nameEn}
                  region={isPt ? data.spot.region : data.spot.regionEn}
                  score={getGridSpotScore(data, selectedSport)}
                  conditions={data.conditions}
                  href={spotDetailHref(locale, data.spot.slug, selectedSport)}
                  locale={isPt ? 'pt' : 'en'}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
