'use client';

import { localizedSpotName, localizedSpotRegion } from '@/lib/localizedSpotText';
import { getTranslation } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { spotDetailHref } from '@/lib/gridSpotScore';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { getPlayfulEmptyCopy } from '@/lib/emptyStateCopy';
import {
  getScoreForFilter,
  getSportLabel,
  getTopNowCards,
  type HomepageSpotData,
} from '@/lib/homepageSport';
import type { GridSportFilter } from '@/lib/sportRatings';
import { getCalmWaterMetricLabel } from '@/lib/spotWaterContext';
import { tierPhrase } from '@/lib/voice';
import SpotListCard from '@/components/spots/SpotListCard';
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import { useLiveGridSpotData } from '@/hooks/useLiveGridSpotData';
import { strongestSpotWarning, warningBadgeLabel } from '@/lib/ipmaWarnings';
import { resolveScoreWaveCorrection } from '@/lib/scoreConditions';
import BuoyLayerNotice from '@/components/spots/BuoyLayerNotice';

interface HomepageTopNowProps {
  spotsData: HomepageSpotData[];
  /** Filtro de desporto do hero: «Todos» = um card por desporto; um desporto
   *  concreto = os melhores spots a bombar nesse desporto. */
  sport?: GridSportFilter;
  locale: string;
  /** Cap cards (e.g. 4 for returning visitors). Default: all TOP_NOW sports. */
  maxCards?: number;
  /** Build-time clock (SSG) — freshness gates use it until mount, then the
   *  live clock takes over (React #418 guard, same as the spot page). */
  bakedAtMs: number;
}

export default function HomepageTopNow({
  spotsData,
  sport: activeSport = 'all',
  locale,
  maxCards,
  bakedAtMs,
}: HomepageTopNowProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Hydration parity: reproduce the baked freshness verdict on first paint,
  // switch to the live clock after mount (the chip may then drop if a reading
  // aged out — correct behaviour, post-commit).
  const freshnessNowMs = mounted ? undefined : bakedAtMs;
  const cardLocale = locale;
  const warningsData = useIpmaWarnings();

  // Re-hidratação client-side (mount + 15 min + tab visível, mesmo
  // refreshGridSpotScores do grid/mapa): as rows SSG são substituídas pelas de
  // conditions.json e o fallback do viés regional (wave-bias.json) aplica-se
  // em runtime — o badge «Corrigido (viés regional)»/«pela boia X» aparece no
  // TopNow sem rebuild, tal como na página de spot.
  const liveSpotsData = useLiveGridSpotData(spotsData);

  // Only spots actually «a bombar» (≥ Bom / 60) — never Fraco under that title.
  // Reage ao filtro do hero: com um desporto activo mostra os melhores spots
  // desse desporto (antes ficava sempre um card por desporto).
  const cards = getTopNowCards(liveSpotsData, activeSport, maxCards);
  const subtitle =
    activeSport === 'all'
      ? t.homepage.onlyFiringSpots
      : t.homepage.onlyFiringSpotsSport.replace('{sport}', getSportLabel(activeSport, locale));

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2"
      aria-labelledby="top-now-heading"
    >
      <h2 id="top-now-heading" className="font-display text-display-lg font-bold text-fg tracking-tight mb-1">
        {t.homepage.firingNow}
      </h2>
      <p className="text-meta text-fg-muted mb-4">
        {cards.length === 0 ? t.homepage.noSportsFiring : subtitle}
      </p>

      {/* Camada de boias global desactivada/em baixo — o mesmo aviso honesto da
          página de spot, agora na homepage (mapa + cards). Não renderiza nada
          quando a camada está saudável (status ok). */}
      <div className="mb-4">
        <BuoyLayerNotice locale={locale} scope="home" />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          className="py-10"
          title={getPlayfulEmptyCopy('no-top-now', locale).title}
          description={getPlayfulEmptyCopy('no-top-now', locale).description}
          action={
            <Button variant="secondary" href={`/${locale}/explorar/`} locale={cardLocale}>
              {t.homepage.viewForecasts}
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
            const sportLabel = getSportLabel(sport, locale);
            const statusLine = tierPhrase(score, locale);

            const warning = strongestSpotWarning(warningsData, data.spot.id);
            const warningBadge = warning
              ? { level: warning.level, label: warningBadgeLabel(warning, locale) }
              : null;
            // «Corrigido pela boia X» (ME/n no tooltip) — mesma fonte do spot page.
            const waveCorrection = resolveScoreWaveCorrection({ ...data.conditions }, freshnessNowMs);

            return (
              <li
                key={`${sport}:${data.spot.slug}`}
                className="stagger-fade-in motion-reduce:animate-none"
                style={{ '--stagger-delay': i * 40 } as React.CSSProperties}
              >
                <SpotListCard
                  compact
                  withImage
                  spot={data.spot}
                  name={localizedSpotName(data.spot, locale)}
                  region={localizedSpotRegion(data.spot, locale)}
                  score={score}
                  conditions={data.conditions}
                  href={spotDetailHref(locale, data.spot.slug, sport)}
                  locale={cardLocale}
                  sportLabel={sportLabel}
                  sportAccent={sport === 'big-wave' ? 'surf' : sport}
                  calmWaterLabel={getCalmWaterMetricLabel(
                    data.spot,
                    data.conditions.waveHeight,
                    locale,
                  )}
                  statusLine={statusLine}
                  warning={warningBadge}
                  waveCorrection={waveCorrection}
                  observedWaveAt={data.conditions.observedWave?.observedAt ?? null}
                  observedWaveSource={data.conditions.observedWave?.source ?? null}
                  observedWaveCalibration={data.conditions.observedWave?.calibration ?? null}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
