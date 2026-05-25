'use client';

import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getScoreTokens } from '@/lib/sportScore';
import { getCardinalLabel, getWindRelationToCoast } from '@/lib/wind';
import { resolveWavePowerKw } from '@/lib/waveEnergy';

import ScoreGauge from '@/components/ui/ScoreGauge';
import SwellRadar from '@/components/ui/SwellRadar';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import ScoreFeedback from '@/components/spots/ScoreFeedback';

interface Conditions {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  windSpeed: number;
  windDirection: number;
  waterTemp: number;
  swellHeight?: number;
  swellPeriod?: number;
  wavePowerKw?: number;
  tideHeight?: number;
  tideLabel?: string;
  source?: 'real' | 'mock';
  updatedAt?: string;
}

interface SpotConditionsOverviewProps {
  spotSlug: string;
  coastOrientation?: number;
  sport: SportType;
  score: number;
  rating: string;
  ratingEn: string;
  conditions: Conditions;
  tideObserved?: { height: number; at: string; station: string };
  locale: string;
}

function MetricCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-card bg-surface-1 border border-divider px-3 py-2.5">
      <div className="text-meta-sm text-fg-subtle uppercase tracking-wide">{label}</div>
      <div className="font-mono text-num-md text-fg mt-0.5">{value}</div>
      {sub && <div className="text-meta text-fg-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export default function SpotConditionsOverview({
  spotSlug,
  coastOrientation,
  sport,
  score,
  rating,
  ratingEn,
  conditions,
  tideObserved,
  locale,
}: SpotConditionsOverviewProps) {
  const isPt = locale === 'pt';
  const tokens = getScoreTokens(score);
  const swellDir = getCardinalLabel(conditions.waveDirection);
  const windDir = getCardinalLabel(conditions.windDirection);
  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const windRelation = coastOrientation
    ? getWindRelationToCoast(conditions.windDirection, coastOrientation)
    : null;
  const wavePowerKw = resolveWavePowerKw(conditions);

  return (
    <section className="max-w-6xl mx-auto px-4 py-4">
      <div className="card-1 p-4 md:p-5 relative">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <h2 className="text-h3 text-fg">
            {isPt ? 'Condições actuais' : 'Current conditions'}
          </h2>
          <DataSourceBadge
            source={conditions.source}
            updatedAt={conditions.updatedAt}
            locale={locale}
            size="sm"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-4 lg:gap-6 items-center">
          {/* Score */}
          <div className="flex flex-col items-center gap-2 lg:items-start">
            <ScoreGauge
              score={score}
              label={SPORT_LABELS[sport][isPt ? 'pt' : 'en']}
              sublabel="/100"
              size="md"
            />
            <p className={`text-body font-medium ${tokens.text}`}>
              {isPt ? rating : ratingEn}
            </p>
          </div>

          {/* Key metrics — single source of truth */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 w-full">
            <MetricCell
              label={isPt ? 'Ondas' : 'Waves'}
              value={`${conditions.waveHeight.toFixed(1)}m @ ${Math.round(conditions.wavePeriod)}s`}
              sub={swellDir}
            />
            <MetricCell
              label={isPt ? 'Energia' : 'Energy'}
              value={`${wavePowerKw.toFixed(1)} kW/m`}
            />
            <MetricCell
              label={isPt ? 'Vento' : 'Wind'}
              value={`${windKt} kt ${windDir}`}
              sub={windRelation ? (isPt ? `Vento ${windRelation}` : `${windRelation} wind`) : undefined}
            />
            <MetricCell
              label={isPt ? 'Água' : 'Water'}
              value={`${conditions.waterTemp.toFixed(1)}°C`}
            />
            <MetricCell
              label={isPt ? 'Maré' : 'Tide'}
              value={
                conditions.tideHeight !== undefined
                  ? `${conditions.tideHeight.toFixed(1)}m`
                  : '—'
              }
              sub={conditions.tideLabel}
            />
          </div>

          {/* Direction visual — desktop sidebar */}
          <div className="hidden lg:flex flex-col items-center gap-2">
            <SwellRadar
              swellDirection={conditions.waveDirection}
              swellHeight={conditions.waveHeight}
              windDirection={conditions.windDirection}
              windSpeed={conditions.windSpeed}
              coastOrientation={coastOrientation}
              size="md"
            />
          </div>
        </div>

        {/* Direction visual — mobile, below metrics */}
        <div className="flex lg:hidden justify-center pt-2">
          <SwellRadar
            swellDirection={conditions.waveDirection}
            swellHeight={conditions.waveHeight}
            windDirection={conditions.windDirection}
            windSpeed={conditions.windSpeed}
            coastOrientation={coastOrientation}
            size="sm"
          />
        </div>

        {tideObserved && (
          <p className="text-meta-sm text-fg-muted mt-3">
            {isPt ? 'Maré observada' : 'Observed tide'}: {tideObserved.height.toFixed(2)}m
            {' · '}{tideObserved.station}
            {tideObserved.at && (
              <> · {new Date(tideObserved.at).toLocaleString(isPt ? 'pt-PT' : 'en-GB')}</>
            )}
          </p>
        )}

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
