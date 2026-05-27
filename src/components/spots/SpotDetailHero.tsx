'use client';

import Link from 'next/link';
import { ArrowLeft, Clock, Droplets, MapPin, Waves, Wind } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getScoreTokens } from '@/lib/sportScore';
import { getDataFreshness } from '@/lib/dataFreshness';
import { cn } from '@/lib/cn';
import FavoriteButton from '@/components/FavoriteButton';
import SocialShare from '@/components/ui/SocialShare';
import { WaterQualityBadge } from '@/components/spots/WaterQualityBadge';
import ScoreGauge from '@/components/ui/ScoreGauge';
import StatChip from '@/components/ui/StatChip';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import SwellRadar from '@/components/ui/SwellRadar';
import ScoreFeedback from '@/components/spots/ScoreFeedback';

interface SpotDetailHeroProps {
  spot: Spot;
  spotSlug: string;
  locale: string;
  backLabel: string;
  sport: SportType;
  score: number;
  rating: string;
  ratingEn: string;
  coastOrientation?: number;
  tideObserved?: { height: number; at: string; station: string };
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    waveDirection: number;
    swellHeight?: number;
    windSpeed: number;
    windDirection: number;
    waterTemp: number;
    source?: 'real' | 'mock';
    updatedAt?: string;
  };
}

export default function SpotDetailHero({
  spot,
  spotSlug,
  locale,
  backLabel,
  sport,
  score,
  rating,
  ratingEn,
  coastOrientation,
  tideObserved,
  conditions,
}: SpotDetailHeroProps) {
  const isPt = locale === 'pt';
  const title = isPt ? spot.name : spot.nameEn;
  const region = isPt ? spot.region : spot.regionEn;
  const tokens = getScoreTokens(score);
  const sportLabel = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];
  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const swellH = conditions.swellHeight ?? conditions.waveHeight;

  const updatedLabel = conditions.updatedAt
    ? new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      }).format(new Date(conditions.updatedAt))
    : null;

  const freshness = conditions.updatedAt ? getDataFreshness(conditions.updatedAt) : null;
  const showUpdatedPill = updatedLabel && (!freshness || freshness === 'fresh');

  return (
    <header className="max-w-6xl mx-auto px-4 pt-4 pb-2">
      <Link
        href={`/${locale}/spots/`}
        className="inline-flex items-center gap-1.5 text-meta text-fg-muted hover:text-fg transition-colors duration-150 mb-4"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        {backLabel}
      </Link>

      <div className="card-hero p-4 md:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h1 className="text-display-lg text-fg tracking-tight">{title}</h1>
              <div className="flex items-center gap-2 shrink-0 lg:hidden">
                <SocialShare title={`${title} — ${region}`} locale={locale} />
                <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={locale} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-fg-muted">
              <MapPin className="w-4 h-4 shrink-0" aria-hidden />
              <span>{region}</span>
              <span aria-hidden>·</span>
              <span className="capitalize">{spot.difficulty}</span>
              {spot.type && (
                <>
                  <span aria-hidden>·</span>
                  <span className="capitalize">{spot.type}</span>
                </>
              )}
            </div>

            {(spot.blueFlag || spot.waterQuality || spot.accessibleBeach) && (
              <div className="mt-2">
                <WaterQualityBadge
                  blueFlag={spot.blueFlag}
                  waterQuality={spot.waterQuality}
                  waterQualityEn={spot.waterQualityEn}
                  accessibleBeach={spot.accessibleBeach}
                  locale={locale}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {showUpdatedPill && (
                <span className="pill pill-ghost gap-1.5 px-2 py-1 min-h-0 text-meta-sm text-fg-muted">
                  {isPt ? 'Actualizado' : 'Updated'} {updatedLabel}
                </span>
              )}
              <DataSourceBadge
                source={conditions.source}
                updatedAt={conditions.updatedAt}
                locale={locale}
                size="sm"
              />
            </div>
          </div>

          <div className="flex flex-col items-center lg:items-end gap-2 shrink-0">
            <div className="hidden lg:flex items-center gap-2 mb-1">
              <SocialShare title={`${title} — ${region}`} locale={locale} />
              <FavoriteButton spotId={spot.id} spotName={spot.name} size="lg" locale={locale} />
            </div>
            <ScoreGauge score={score} label={sportLabel} sublabel="/100" size="lg" />
            <p className={cn('text-body font-semibold', tokens.text)}>
              {isPt ? rating : ratingEn}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-6">
          <StatChip
            icon={<Waves className="w-4 h-4 text-data-waves" />}
            value={`${conditions.waveHeight.toFixed(1)}m`}
            label={isPt ? 'Ondas' : 'Waves'}
          />
          <StatChip
            icon={<Clock className="w-4 h-4 text-data-period" />}
            value={`${Math.round(conditions.wavePeriod)}s`}
            label={isPt ? 'Período' : 'Period'}
          />
          <StatChip
            icon={<Wind className="w-4 h-4 text-data-wind" />}
            value={`${windKt}kt`}
            label={isPt ? 'Vento' : 'Wind'}
          />
          <StatChip
            icon={<Droplets className="w-4 h-4 text-data-water" />}
            value={`${conditions.waterTemp.toFixed(1)}°C`}
            label={isPt ? 'Água' : 'Water'}
          />
        </div>

        <div className="mt-6 pt-6 border-t border-divider">
          <h2 className="text-h3 text-fg mb-4">
            {isPt ? 'Agora' : 'Now'}
          </h2>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <SwellRadar
              swellDirection={conditions.waveDirection}
              swellHeight={swellH}
              windDirection={conditions.windDirection}
              windSpeed={conditions.windSpeed}
              coastOrientation={coastOrientation}
              size="md"
            />
            <div className="flex-1 text-center sm:text-left">
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
      </div>
    </header>
  );
}
