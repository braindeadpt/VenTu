'use client';

import type { SportType } from '@/lib/sportRatings';
import SwellRadar from '@/components/ui/SwellRadar';
import ScoreFeedback from '@/components/spots/ScoreFeedback';

interface Conditions {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  windSpeed: number;
  windDirection: number;
  waterTemp: number;
}

interface SpotConditionsOverviewProps {
  spotSlug: string;
  coastOrientation?: number;
  sport: SportType;
  score: number;
  conditions: Conditions;
  tideObserved?: { height: number; at: string; station: string };
  locale: string;
}

export default function SpotConditionsOverview({
  spotSlug,
  coastOrientation,
  sport,
  score,
  conditions,
  tideObserved,
  locale,
}: SpotConditionsOverviewProps) {
  const isPt = locale === 'pt';

  return (
    <section className="max-w-6xl mx-auto px-4 py-4">
      <div className="card-1 p-4 md:p-5">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <SwellRadar
            swellDirection={conditions.waveDirection}
            swellHeight={conditions.waveHeight}
            windDirection={conditions.windDirection}
            windSpeed={conditions.windSpeed}
            coastOrientation={coastOrientation}
            size="md"
          />
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-h3 text-fg mb-1">
              {isPt ? 'Direcções' : 'Directions'}
            </h2>
            <p className="text-meta text-fg-muted">
              {isPt
                ? 'Swell e vento face à orientação da costa'
                : 'Swell and wind relative to coast orientation'}
            </p>
            {tideObserved && (
              <p className="text-meta-sm text-fg-muted mt-3">
                {isPt ? 'Maré observada' : 'Observed tide'}: {tideObserved.height.toFixed(2)}m
                {' · '}{tideObserved.station}
                {tideObserved.at && (
                  <> · {new Date(tideObserved.at).toLocaleString(isPt ? 'pt-PT' : 'en-GB')}</>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-divider">
          <ScoreFeedback
            spotSlug={spotSlug}
            sport={sport}
            predictedScore={score}
            conditionsSnapshot={{
              waveHeight: conditions.waveHeight,
              wavePeriod: conditions.wavePeriod,
              windSpeed: conditions.windSpeed,
              windDirection: conditions.windDirection,
              waterTemp: conditions.waterTemp,
            }}
            locale={locale}
          />
        </div>
      </div>
    </section>
  );
}
