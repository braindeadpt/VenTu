'use client';

import { Clock, Waves, Wind } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportScore } from '@/lib/sportScore';
import { getCardinalLabel } from '@/lib/wind';
import { getWindRelationLabel, getWindRelationToCoast } from '@/lib/wind';
import { buildSwellTrains } from '@/lib/waveEnergy';
import { cn } from '@/lib/cn';
import Card from '@/components/ui/Card';
import StatChip from '@/components/ui/StatChip';
import SwellRadar from '@/components/ui/SwellRadar';
import SwellTrainsTable from '@/components/spots/SwellTrainsTable';
import ObservedNow from '@/components/spots/ObservedNow';
import TideScheduleStrip from '@/components/spots/TideScheduleStrip';
import ScoreFeedback from '@/components/spots/ScoreFeedback';
import type { ObservedConditions } from '@/lib/observations';
import type { SportType } from '@/lib/sportRatings';
import type { TideSchedule } from '@/lib/tideSchedule';

export interface SpotNowConditions {
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

interface SpotNowPanelProps {
  spot: Spot;
  locale: string;
  title: string;
  conditions: SpotNowConditions;
  tideSchedule: TideSchedule | null;
  selectedSport: SportType;
  score: SportScore;
  scoreFeedbackHint: string;
}

export default function SpotNowPanel({
  spot,
  locale,
  title,
  conditions,
  tideSchedule,
  selectedSport,
  score,
  scoreFeedbackHint,
}: SpotNowPanelProps) {
  const isPt = locale === 'pt';
  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const gustKt = Math.round((conditions.windGust ?? conditions.windSpeed) * 1.94384);
  const windCardinal = getCardinalLabel(conditions.windDirection);
  const swellTrains = buildSwellTrains(conditions);

  const windRelation =
    spot.coastOrientation !== undefined
      ? getWindRelationToCoast(conditions.windDirection, spot.coastOrientation)
      : null;
  const windRelationMeta = windRelation
    ? getWindRelationLabel(windRelation, isPt ? 'pt' : 'en')
    : null;

  return (
    <Card variant="card-1" className="p-4 md:p-5 space-y-5">
      <h2 className="text-h3 text-fg">{title}</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip
          icon={<Waves className="w-4 h-4 text-data-waves" />}
          value={`${conditions.waveHeight.toFixed(1)}m`}
          label={isPt ? 'Ondas (total)' : 'Waves (total)'}
        />
        <StatChip
          icon={<Clock className="w-4 h-4 text-data-period" />}
          value={`${Math.round(conditions.wavePeriod)}s`}
          label={isPt ? 'Período' : 'Period'}
        />
        <StatChip
          icon={<Wind className="w-4 h-4 text-data-wind" />}
          value={`${windKt}kt`}
          label={`${isPt ? 'Vento' : 'Wind'} · ${windCardinal}`}
        />
        <StatChip
          icon={<Wind className="w-4 h-4 text-data-wind/70" />}
          value={`${gustKt}kt`}
          label={isPt ? 'Rajada' : 'Gust'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,11rem)_1fr] gap-4 md:gap-6 items-start border-t border-divider pt-4">
        <div className="flex justify-center md:justify-start">
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
            size="sm"
            showLegend
          />
        </div>
        <SwellTrainsTable conditions={conditions} locale={locale} />
      </div>

      {windRelationMeta && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-pill border px-2.5 py-1 text-meta-sm font-medium',
              windRelationMeta.className,
            )}
          >
            {windRelationMeta.label}
          </span>
        </div>
      )}

      {conditions.observed && (
        <ObservedNow
          observed={conditions.observed}
          forecastWindSpeedMs={conditions.windSpeed}
          locale={locale}
        />
      )}

      {tideSchedule && <TideScheduleStrip schedule={tideSchedule} locale={locale} />}

      <div className="pt-4 border-t border-divider">
        <p className="text-meta-sm text-fg-subtle mb-2">{scoreFeedbackHint}</p>
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
    </Card>
  );
}
