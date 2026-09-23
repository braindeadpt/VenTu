'use client';

import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { getTranslation } from '@/lib/i18n';
import { getSportLabel } from '@/lib/homepageSport';
import { getGridSpotScore, spotDetailHref } from '@/lib/gridSpotScore';
import { getCalmWaterMetricLabel } from '@/lib/spotWaterContext';
import SpotListCard from './SpotListCard';
import Button from '@/components/ui/Button';

const PAGE_SIZE = 12;

interface SpotGridRankedListProps {
  sorted: GridSpotData[];
  selectedSport: GridSportFilter;
  locale: string;
  /** Home Model A: omit spots already shown in Top agora */
  excludeSlugs?: string[];
}

export default function SpotGridRankedList({
  sorted,
  selectedSport,
  locale,
  excludeSlugs,
}: SpotGridRankedListProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const sportLabel = getSportLabel(selectedSport, locale);

  const exclude = excludeSlugs?.length
    ? new Set(excludeSlugs)
    : null;
  const filtered = exclude
    ? sorted.filter((d) => !exclude.has(d.spot.slug))
    : sorted;

  const [pages, setPages] = useState(1);
  // A lista muda com filtros — a paginação volta ao topo para não ficar
  // escondida a meio de resultados novos.
  useEffect(() => setPages(1), [sorted, selectedSport]);
  const list = filtered.slice(0, pages * PAGE_SIZE);
  const remaining = filtered.length - list.length;

  if (list.length === 0) {
    return null;
  }

  // «Mais…» só faz sentido quando a lista é o resto do Top agora (home);
  // em /spots, /explorar e /modalidades é a lista inteira — vira «Ranking».
  const title = !excludeSlugs?.length
    ? selectedSport === 'all'
      ? getTranslation(locale).ranked.spotRanking
      : `Ranking — ${sportLabel}`
    : selectedSport === 'all'
      ? t.spotsUi.moreSpots
      : t.spotsUi.moreSpotsFor.replace('{sport}', sportLabel);

  const subtitle = t.spotsUi.sortedByScore;

  return (
    <section className="mb-10" aria-labelledby="spot-ranked-heading">
      <div className="mb-4">
        <h2 id="spot-ranked-heading" className="text-h3 text-fg">
          {title}
        </h2>
        <p className="text-meta text-fg-muted mt-1">{subtitle}</p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 list-none p-0 m-0">
        {list.map((data, i) => (
          <li
            key={data.spot.id}
            className="stagger-fade-in motion-reduce:animate-none"
            style={{ '--stagger-delay': i * 30 } as React.CSSProperties}
          >
            <SpotListCard
              compact
              withImage
              spot={data.spot}
              name={localizedSpotName(data.spot, locale)}
              region={localizedSpotRegion(data.spot, locale)}
              score={getGridSpotScore(data, selectedSport)}
              conditions={data.conditions}
              href={spotDetailHref(locale, data.spot.slug, selectedSport)}
              locale={locale}
              calmWaterLabel={getCalmWaterMetricLabel(
                data.spot,
                data.conditions.waveHeight,
                locale,
              )}
            />
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setPages((p) => p + 1)}
            rightIcon={<ChevronDown className="w-4 h-4" aria-hidden />}
            locale={locale}
          >
            {t.spotsUi.showMoreSpots
              .replace('{n}', String(Math.min(remaining, PAGE_SIZE)))
              .replace('{total}', String(remaining))}
          </Button>
        </div>
      )}
    </section>
  );
}
