'use client';

import { Clock, Droplets, Waves, Wind } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportScore } from '@/lib/sportScore';
import { getCardinalLabel } from '@/lib/wind';
import { getWindRelationLabel, getWindRelationToCoast, type WindRelation } from '@/lib/wind';
import { buildSwellTrains, totalSwellPowerKw } from '@/lib/waveEnergy';
import MetricTile from '@/components/ui/MetricTile';
import SwellRadar from '@/components/ui/SwellRadar';
import SwellTrainsTable from '@/components/spots/SwellTrainsTable';
import ObservedNow from '@/components/spots/ObservedNow';
import TideScheduleStrip from '@/components/spots/TideScheduleStrip';
import ScoreFeedback from '@/components/spots/ScoreFeedback';
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
    gustLabel: string;
    waterLabel: string;
    waterHint: string;
    seaStateTitle: string;
    seaStateHint: string;
    windContextTitle: string;
    windRelationHints: Record<WindRelation, string>;
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

  return (
    <section
      className="card-1 rounded-card border border-divider overflow-hidden"
      aria-label={copy.title}
    >
      <header className="px-4 pt-4 pb-3 md:px-5 border-b border-divider bg-surface-1/[0.03]">
        <h2 className="text-h2 text-fg">{copy.title}</h2>
        <p className="text-meta text-fg-muted mt-1 max-w-3xl leading-relaxed">{copy.subtitle}</p>
      </header>

      <div className="p-4 md:p-5 space-y-5">
        {/* Primary metrics — horizontal band */}
        <div
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3"
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
            hint={`${windCardinal} · ${isPt ? 'média' : 'avg'}`}
          />
          <MetricTile
            icon={<Wind className="w-4 h-4 text-data-wind/80" />}
            label={copy.gustLabel}
            value={`${gustKt} kt`}
            hint={isPt ? 'Rajada prevista' : 'Forecast gust'}
          />
          <MetricTile
            icon={<Droplets className="w-4 h-4 text-data-waves/80" />}
            label={copy.waterLabel}
            value={`${conditions.waterTemp.toFixed(1)}°C`}
            hint={copy.waterHint}
            className="col-span-2 md:col-span-1"
          />
        </div>

        {/* Sea state — horizontal 3-zone layout */}
        <div className="border-t border-divider pt-5">
          <div className="mb-3">
            <h3 className="text-h3 text-fg">{copy.seaStateTitle}</h3>
            <p className="text-meta-sm text-fg-muted mt-0.5">{copy.seaStateHint}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
            <div className="lg:col-span-4 flex flex-col items-center lg:items-start gap-3">
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
                size="md"
                showLegend={false}
                visualTone="dashboard"
              />
              {windRelationMeta && windRelation && (
                <div className="w-full max-w-xs space-y-1.5 text-center lg:text-left">
                  <span className="inline-flex items-center gap-2 rounded-pill border border-divider bg-bg-elevated px-2.5 py-1.5 text-meta-sm font-medium text-fg">
                    <Wind className="w-3.5 h-3.5 text-data-wind shrink-0" aria-hidden />
                    {windRelationMeta.label}
                  </span>
                  <p className="text-meta-sm text-fg-muted leading-snug">
                    {copy.windRelationHints[windRelation]}
                  </p>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 min-w-0">
              <SwellTrainsTable conditions={conditions} locale={locale} />
              {swellTrains.length > 0 && (
                <p className="text-meta-sm text-fg-subtle mt-2 font-mono tabular-nums">
                  {isPt ? 'Energia de ondulação (soma)' : 'Total swell energy'}:{' '}
                  <span className="text-fg font-medium">{totalEnergy.toFixed(1)} kW/m</span>
                </p>
              )}
            </div>

            <div className="lg:col-span-3 rounded-card border border-divider bg-bg-elevated p-3 space-y-2">
              <h4 className="text-meta font-semibold text-fg">{copy.windContextTitle}</h4>
              <ul className="text-meta-sm text-fg-muted space-y-2.5 leading-relaxed list-none p-0 m-0">
                <li>
                  <span className="font-medium text-fg">{isPt ? 'Offshore' : 'Offshore'}</span>
                  <span className="text-fg-subtle"> — </span>
                  {copy.windRelationHints.offshore}
                </li>
                <li>
                  <span className="font-medium text-fg">{isPt ? 'Onshore' : 'Onshore'}</span>
                  <span className="text-fg-subtle"> — </span>
                  {copy.windRelationHints.onshore}
                </li>
                <li>
                  <span className="font-medium text-fg">{isPt ? 'Cross' : 'Cross-shore'}</span>
                  <span className="text-fg-subtle"> — </span>
                  {copy.windRelationHints.cross}
                </li>
              </ul>
              <p className="text-meta-sm text-fg-subtle pt-2 border-t border-divider">
                {isPt
                  ? 'Azul = ondulação · âmbar = vento. Terra/mar no radar são só referência de costa.'
                  : 'Blue = swell · amber = wind. Land/sea shading on the radar is coast reference only.'}
              </p>
            </div>
          </div>
        </div>

        {/* Verification row */}
        {(conditions.observed || tideSchedule) && (
          <div className="border-t border-divider pt-5 space-y-3">
            <h3 className="text-h3 text-fg">{copy.verificationTitle}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {conditions.observed ? (
                <ObservedNow
                  observed={conditions.observed}
                  forecastWindSpeedMs={conditions.windSpeed}
                  locale={locale}
                />
              ) : (
                <div className="rounded-card border border-dashed border-divider px-3 py-4 text-meta-sm text-fg-subtle">
                  {isPt
                    ? 'Sem estação IPMA próxima — usa o vento do modelo acima.'
                    : 'No nearby IPMA station — use model wind above.'}
                </div>
              )}
              {tideSchedule ? (
                <div className="rounded-card border border-divider bg-surface-1/[0.03] px-3 py-3">
                  <p className="text-meta-sm font-semibold text-fg-muted mb-2">
                    {isPt ? 'Marés (previsão)' : 'Tides (forecast)'}
                  </p>
                  <TideScheduleStrip schedule={tideSchedule} locale={locale} />
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="border-t border-divider pt-4">
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
