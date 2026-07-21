import { SPORT_LABELS } from '@/lib/sportRatings';
import { spotDetailHref } from '@/lib/gridSpotScore';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { getPlayfulEmptyCopy } from '@/lib/emptyStateCopy';
import {
  TOP_NOW_SPORTS,
  getScoreForFilter,
  getTopSpotForSport,
  type HomepageSpotData,
  type TopNowSport,
} from '@/lib/homepageSport';
import { getCalmWaterMetricLabel } from '@/lib/spotWaterContext';
import { tierPhrase } from '@/lib/voice';
import SpotListCard from '@/components/spots/SpotListCard';

interface HomepageTopNowProps {
  spotsData: HomepageSpotData[];
  locale: string;
  /** Cap cards (e.g. 4 for returning visitors). Default: all TOP_NOW sports. */
  maxCards?: number;
}

const SPORT_ACCENTS: Record<TopNowSport, TopNowSport> = {
  surf: 'surf',
  kitesurf: 'kitesurf',
  windsurf: 'windsurf',
  bodyboard: 'bodyboard',
};

export default function HomepageTopNow({ spotsData, locale, maxCards }: HomepageTopNowProps) {
  const isPt = locale === 'pt';
  const cardLocale = isPt ? 'pt' : 'en';

  // Only sports that are actually «a bombar» (≥ Bom / 60) — never Fraco under that title
  const cards = TOP_NOW_SPORTS.map((sport) => {
    const data = getTopSpotForSport(spotsData, sport);
    if (!data) return null;
    return { sport, data };
  })
    .filter((entry): entry is { sport: TopNowSport; data: HomepageSpotData } => entry !== null)
    .slice(0, maxCards ?? TOP_NOW_SPORTS.length);

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2"
      aria-labelledby="top-now-heading"
    >
      <h2 id="top-now-heading" className="font-display text-display-lg font-bold text-fg tracking-tight mb-1">
        {isPt ? 'A bombar agora' : 'Firing now'}
      </h2>
      <p className="text-meta text-fg-muted mb-4">
        {cards.length === 0
          ? isPt
            ? 'Nenhum desporto a bombar neste momento'
            : 'No sports firing right now'
          : isPt
            ? 'Só spots a bombar · por desporto'
            : 'Only firing spots · by sport'}
      </p>

      {cards.length === 0 ? (
        <EmptyState
          className="py-10"
          title={getPlayfulEmptyCopy('no-top-now', isPt).title}
          description={getPlayfulEmptyCopy('no-top-now', isPt).description}
          action={
            <Button variant="secondary" href={`/${locale}/explorar/`} locale={cardLocale}>
              {isPt ? 'Ver previsões' : 'View forecasts'}
            </Button>
          }
        />
      ) : (
        <ul
          className={`grid grid-cols-1 sm:grid-cols-2 gap-2 list-none p-0 m-0 ${
            cards.length >= 4 ? 'lg:grid-cols-4' : cards.length === 3 ? 'lg:grid-cols-3' : ''
          }`}
        >
          {cards.map(({ sport, data }, i) => {
            const score = getScoreForFilter(data, sport);
            const sportLabel = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];
            const statusLine = tierPhrase(score, isPt);

            return (
              <li
                key={sport}
                className="stagger-fade-in motion-reduce:animate-none"
                style={{ '--stagger-delay': i * 40 } as React.CSSProperties}
              >
                <SpotListCard
                  compact
                  withImage
                  spot={data.spot}
                  name={isPt ? data.spot.name : data.spot.nameEn}
                  region={isPt ? data.spot.region : data.spot.regionEn}
                  score={score}
                  conditions={data.conditions}
                  href={spotDetailHref(locale, data.spot.slug, sport)}
                  locale={cardLocale}
                  sportLabel={sportLabel}
                  sportAccent={SPORT_ACCENTS[sport]}
                  calmWaterLabel={getCalmWaterMetricLabel(
                    data.spot,
                    data.conditions.waveHeight,
                    isPt,
                  )}
                  statusLine={statusLine}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
