'use client';

import type { GridSportFilter } from '@/lib/sportRatings';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { getTranslation } from '@/lib/i18n';
import { getSportLabel } from '@/lib/homepageSport';
import { getGridSpotScore, spotDetailHref } from '@/lib/gridSpotScore';
import SpotListCard from './SpotListCard';

const LIST_LIMIT = 12;

interface SpotGridRankedListProps {
  sorted: GridSpotData[];
  selectedSport: GridSportFilter;
  locale: string;
  /** Home Model A: omit spots already shown in Top agora */
  excludeSlugs?: Set<string>;
}

export default function SpotGridRankedList({
  sorted,
  selectedSport,
  locale,
  excludeSlugs,
}: SpotGridRankedListProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const sportLabel = getSportLabel(selectedSport, isPt);

  const filtered = excludeSlugs?.size
    ? sorted.filter((d) => !excludeSlugs.has(d.spot.slug))
    : sorted;

  const list = filtered.slice(0, LIST_LIMIT);

  if (list.length === 0) {
    return null;
  }

  const title =
    selectedSport === 'all'
      ? isPt
        ? 'Mais spots para explorar'
        : 'More spots to explore'
      : isPt
        ? `Mais spots para ${sportLabel}`
        : `More spots for ${sportLabel}`;

  const subtitle = isPt
    ? 'Ordenados por score · filtros activos'
    : 'Sorted by score · active filters';

  return (
    <section className="mb-10" aria-labelledby="spot-ranked-heading">
      <div className="mb-4">
        <h2 id="spot-ranked-heading" className="text-h3 text-fg">
          {title}
        </h2>
        <p className="text-meta text-fg-muted mt-1">{subtitle}</p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 list-none p-0 m-0">
        {list.map((data) => (
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
    </section>
  );
}
