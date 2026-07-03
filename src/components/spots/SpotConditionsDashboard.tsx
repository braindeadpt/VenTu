'use client';

import { Clock, Droplets, HelpCircle, Waves, Wind } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Spot } from '@/types';
import type { SportScore } from '@/lib/sportScore';
import { getScoreTokens } from '@/lib/sportScore';
import { getCardinalLabel } from '@/lib/wind';
import { getWindRelationLabel, getWindRelationToCoast, type WindRelation } from '@/lib/wind';
import { buildSwellTrains, totalSwellPowerKw } from '@/lib/waveEnergy';
import { isObservedFresh } from '@/lib/observations';
import MetricTile from '@/components/ui/MetricTile';
import SwellRadar from '@/components/ui/SwellRadar';
import WindShoreMap from '@/components/ui/WindShoreMap';
import SwellTrainsTable from '@/components/spots/SwellTrainsTable';
import ObservedNow from '@/components/spots/ObservedNow';
import TideScheduleStrip from '@/components/spots/TideScheduleStrip';
import ScoreFeedback from '@/components/spots/ScoreFeedback';
import ScoreBadge from '@/components/ui/ScoreBadge';
import type { ObservedConditions } from '@/lib/observations';
import type { SportType } from '@/lib/sportRatings';
import type { TideSchedule } from '@/lib/tideSchedule';

export interface SpotDashboardConditions {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  windSpeed: number;
  windDirection: number;
  windGust?: number;
  waterTemp: number;
  swellHeight?: number;
  swellPeriod?: number;
  swellDirection?: number;
  secondarySwellHeight?: number;
  secondarySwellPeriod?: number;
  secondarySwellDirection?: number;
  observed?: ObservedConditions;
}

interface SpotConditionsDashboardProps {
  spot: Spot;
  locale: string;
  copy: {
    title: string;
    subtitle: string;
    wavesLabel: string;
    wavesHint: string;
    periodLabel: string;
    periodHint: string;
    windLabel: string;
    windHint: string;
    gustLabel: string;
    gustHint: string;
    waterLabel: string;
    waterHint: string;
    seaStateTitle: string;
    seaStateHint: string;
    windContextTitle: string;
    windShoreTitle: string;
    windShoreSea: string;
    windShoreLand: string;
    windShoreFrom: string;
    windShoreCoastFacing: string;
    windRelationHints: Record<WindRelation, string>;
    radarFootnote: string;
    verificationTitle: string;
    scoreFeedbackHint: string;
  };
  conditions: SpotDashboardConditions;
  tideSchedule: TideSchedule | null;
  selectedSport: SportType;
  score: SportScore;
}

export default function SpotConditionsDashboard({
  spot,
  locale,
  copy,
  conditions,
  tideSchedule,
  selectedSport,
  score,
}: SpotConditionsDashboardProps) {
  const isPt = locale === 'pt';
  const scoreTokens = getScoreTokens(score.score);
  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const gustKt = Math.round((conditions.windGust ?? conditions.windSpeed) * 1.94384);
  const windCardinal = getCardinalLabel(conditions.windDirection);
  const waveCardinal = getCardinalLabel(conditions.waveDirection);
  const swellTrains = buildSwellTrains(conditions);
  const totalEnergy = totalSwellPowerKw(conditions);

  const windRelation =
    spot.coastOrientation !== undefined
      ? getWindRelationToCoast(conditions.windDirection, spot.coastOrientation)
      : null;
  const windRelationMeta = windRelation
    ? getWindRelationLabel(windRelation, isPt ? 'pt' : 'en')
    : null;

  const freshObserved =
    conditions.observed && isObservedFresh(conditions.observed.observedAt)
      ? conditions.observed
      : null;

  const obsWorkerEnabled = Boolean(process.env.NEXT_PUBLIC_OBS_WORKER_URL?.trim());
  const showObservedBlock = Boolean(freshObserved || obsWorkerEnabled);
  const showVerification = Boolean(showObservedBlock || tideSchedule || conditions.observed);

  return (
    <section
      className="card-1 rounded-card border border-divider overflow-hidden"
      aria-label={copy.title}
    >
      <header
        className={cn(
          'px-3 pt-3 pb-2.5 md:px-4 md:pt-4 border-b-2 bg-surface-1/[0.03]',
          scoreTokens.border,
        )}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-h2 text-fg">{copy.title}</h2>
          <ScoreBadge score={score.score} locale={locale as 'pt' | 'en'} size="sm" showLabel />
        </div>
        <p className="text-meta text-fg-muted mt-1 max-w-3xl leading-relaxed">{copy.subtitle}</p>
      </header>

      <div className="p-3 md:p-4 space-y-4">
        <div
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-2.5"
          role="group"
          aria-label={isPt ? 'Métricas principais' : 'Key metrics'}
        >
          <MetricTile
            icon={<Waves className="w-4 h-4 text-data-waves" />}
            label={copy.wavesLabel}
            value={`${conditions.waveHeight.toFixed(1)} m`}
            hint={`${copy.wavesHint} · ${waveCardinal}`}
          />
          <MetricTile
            icon={<Clock className="w-4 h-4 text-data-period" />}
            label={copy.periodLabel}
            value={`${Math.round(conditions.wavePeriod)} s`}
            hint={copy.periodHint}
          />
          <MetricTile
            icon={<Wind className="w-4 h-4 text-data-wind" />}
            label={copy.windLabel}
            value={`${windKt} kt`}
            hint={`${windCardinal} · ${copy.windHint}`}
          />
          <MetricTile
            icon={<Wind className="w-4 h-4 text-data-wind/80" />}
            label={copy.gustLabel}
            value={`${gustKt} kt`}
            hint={
              gustKt > windKt + 2
                ? `${copy.gustHint} (+${gustKt - windKt} kt ${isPt ? 'vs média' : 'vs avg'})`
                : copy.gustHint
            }
            className={gustKt > windKt + 2 ? 'ring-1 ring-data-wind/30' : undefined}
          />
          <MetricTile
            icon={<Droplets className="w-4 h-4 text-data-waves/80" />}
            label={copy.waterLabel}
            value={`${conditions.waterTemp.toFixed(1)}°C`}
            hint={copy.waterHint}
            className="col-span-2 md:col-span-1"
          />
        </div>

        <div className="border-t border-divider pt-4">
          <div className="mb-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-h3 text-fg">{copy.seaStateTitle}</h3>
              <p className="text-meta-sm text-fg-muted mt-0.5">{copy.seaStateHint}</p>
            </div>
            <details className="relative shrink-0 group">
              <summary
                className="list-none flex items-center justify-center w-9 h-9 rounded-full border border-divider bg-bg-elevated text-fg-muted hover:text-fg hover:border-divider-strong cursor-pointer transition-colors [&::-webkit-details-marker]:hidden"
                aria-label={copy.windContextTitle}
              >
                <HelpCircle className="w-4 h-4" aria-hidden />
              </summary>
              <div
                className="absolute right-0 top-full z-20 mt-1.5 w-[min(18rem,calc(100vw-2rem))] rounded-card border border-divider bg-bg-elevated shadow-lg p-3 text-meta-sm text-fg-muted leading-relaxed"
                role="note"
              >
                <p className="font-semibold text-fg text-meta mb-2">{copy.windContextTitle}</p>
                <ul className="space-y-2 list-none p-0 m-0">
                  <li>
                    <span className="font-medium text-fg">Offshore</span>
                    <span className="text-fg-subtle"> — </span>
                    {copy.windRelationHints.offshore}
                  </li>
                  <li>
                    <span className="font-medium text-fg">Onshore</span>
                    <span className="text-fg-subtle"> — </span>
                    {copy.windRelationHints.onshore}
                  </li>
                  <li>
                    <span className="font-medium text-fg">{isPt ? 'Cross' : 'Cross-shore'}</span>
                    <span className="text-fg-subtle"> — </span>
                    {copy.windRelationHints.cross}
                  </li>
                </ul>
                <p className="text-fg-subtle mt-2 pt-2 border-t border-divider">{copy.radarFootnote}</p>
              </div>
            </details>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-start">
            {spot.coastOrientation !== undefined && windRelation && windRelationMeta ? (
              <div className="lg:col-span-5">
                <WindShoreMap
                  windDirection={conditions.windDirection}
                  windSpeed={conditions.windSpeed}
                  coastOrientation={spot.coastOrientation}
                  locale={isPt ? 'pt' : 'en'}
                  title={copy.windShoreTitle}
                  seaLabel={copy.windShoreSea}
                  landLabel={copy.windShoreLand}
                  windFromLabel={copy.windShoreFrom}
                  coastFacingLabel={copy.windShoreCoastFacing}
                  relationHint={copy.windRelationHints[windRelation]}
                />
              </div>
            ) : null}

            <div
              className={cn(
                'flex flex-col items-center gap-2',
                spot.coastOrientation !== undefined ? 'lg:col-span-3' : 'lg:col-span-4 lg:items-start',
              )}
            >
              <SwellRadar
                swellTrains={swellTrains.map((t) => ({
                  key: t.key,
                  direction: t.direction,
                  height: t.height,
                  period: t.period,
                }))}
                windDirection={conditions.windDirection}
                windSpeed={conditions.windSpeed}
                coastOrientation={spot.coastOrientation}
                size={spot.coastOrientation !== undefined ? 'sm' : 'md'}
                showLegend={false}
                showWind={spot.coastOrientation === undefined}
                visualTone="dashboard"
              />
              {windRelationMeta && windRelation && spot.coastOrientation === undefined && (
                <div className="w-full max-w-xs space-y-1 text-center lg:text-left">
                  <span className="inline-flex items-center gap-2 rounded-pill border border-divider bg-bg-elevated px-2.5 py-1 text-meta-sm font-medium text-fg">
                    <Wind className="w-3.5 h-3.5 text-data-wind shrink-0" aria-hidden />
                    {windRelationMeta.label}
                  </span>
                  <p className="text-meta-sm text-fg-muted leading-snug">
                    {copy.windRelationHints[windRelation]}
                  </p>
                </div>
              )}
            </div>

            <div
              className={cn(
                'min-w-0',
                spot.coastOrientation !== undefined ? 'lg:col-span-4' : 'lg:col-span-8',
              )}
            >
              <SwellTrainsTable conditions={conditions} locale={locale} />
              {swellTrains.length > 0 && (
                <p className="text-meta-sm text-fg-subtle mt-2 font-mono tabular-nums">
                  {isPt ? 'Energia de ondulação (soma)' : 'Total swell energy'}:{' '}
                  <span className="text-fg font-medium">{totalEnergy.toFixed(1)} kW/m</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {showVerification && (
          <div className="border-t border-divider pt-4 space-y-2.5">
            <h3 className="text-h3 text-fg">{copy.verificationTitle}</h3>
            <div
              className={
                showObservedBlock && tideSchedule
                  ? 'grid grid-cols-1 md:grid-cols-2 gap-3'
                  : 'grid grid-cols-1 gap-3'
              }
            >
              {showObservedBlock ? (
                <ObservedNow
                  observed={conditions.observed}
                  forecastWindSpeedMs={conditions.windSpeed}
                  locale={locale}
                  lat={spot.lat}
                  lon={spot.lon}
                />
              ) : null}
              {tideSchedule ? (
                <div className="rounded-card border border-divider bg-surface-1/[0.03] px-3 py-3">
                  <p className="text-meta-sm font-semibold text-fg-muted mb-2">
                    {isPt ? 'Marés (previsão)' : 'Tides (forecast)'}
                  </p>
                  <TideScheduleStrip schedule={tideSchedule} locale={locale} />
                </div>
              ) : null}
            </div>
            {!freshObserved && conditions.observed && (
              <p className="text-meta-sm text-fg-subtle">
                {isPt
                  ? 'Observação antiga (>3 h) — usa o vento do modelo acima.'
                  : 'Observation older than 3 h — use model wind above.'}
              </p>
            )}
            {!freshObserved && !conditions.observed && (
              <p className="text-meta-sm text-fg-subtle">
                {isPt
                  ? 'Sem estação IPMA/Ecowitt próxima e fresca — usa o vento do modelo acima.'
                  : 'No fresh IPMA/Ecowitt station nearby — use model wind above.'}
              </p>
            )}
          </div>
        )}

        <div className="border-t border-divider pt-3">
          <p className="text-meta-sm text-fg-subtle mb-2">{copy.scoreFeedbackHint}</p>
          <ScoreFeedback
            spotSlug={spot.slug}
            sport={selectedSport}
            predictedScore={score.score}
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
