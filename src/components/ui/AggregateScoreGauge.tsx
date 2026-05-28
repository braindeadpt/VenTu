'use client';

import ScoreGauge from '@/components/ui/ScoreGauge';
import type { GridSportFilter } from '@/lib/sportRatings';
import {
  type HomepageSpotData,
  sortSpotsBySport,
  getScoreForFilter,
  getSportLabel,
} from '@/lib/homepageSport';

interface AggregateScoreGaugeProps {
  spotsData: HomepageSpotData[];
  sport: GridSportFilter;
  locale: string;
}

export default function AggregateScoreGauge({
  spotsData,
  sport,
  locale,
}: AggregateScoreGaugeProps) {
  const isPt = locale === 'pt';
  const top = sortSpotsBySport(spotsData, sport).slice(0, 10);
  const avg = Math.round(
    top.reduce((acc, d) => acc + getScoreForFilter(d, sport), 0) / Math.max(top.length, 1),
  );

  return (
    <div className="flex justify-center lg:justify-end shrink-0">
      <ScoreGauge
        score={avg}
        label={getSportLabel(sport, isPt)}
        sublabel={isPt ? '· média top 10' : '· top 10 avg'}
        size="lg"
      />
    </div>
  );
}
