'use client';

import Link from 'next/link';
import { ArrowLeft, Clock, Droplets, MapPin, Waves, Wind } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getDataFreshness } from '@/lib/dataFreshness';
import { getWindRelationToCoast } from '@/lib/wind';
import { cn } from '@/lib/cn';
import FavoriteButton from '@/components/FavoriteButton';
import SocialShare from '@/components/ui/SocialShare';
import { WaterQualityBadge } from '@/components/spots/WaterQualityBadge';
import ScoreBadge from '@/components/ui/ScoreBadge';
import StatChip from '@/components/ui/StatChip';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import SwellRadar from '@/components/ui/SwellRadar';

interface SpotDetailHeroProps {
  spot: Spot;
  locale: string;
  backLabel: string;
  sport: SportType;
  score: number;
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

const WIND_RELATION_LABEL: Record<
  ReturnType<typeof getWindRelationToCoast>,
  { pt: string; en: string; className: string }
> = {
  offshore: {
    pt: 'Offshore',
    en: 'Offshore',
    className: 'text-windDir-offshore border-windDir-offshore/30 bg-windDir-offshore/10',
  },
  onshore: {
    pt: 'Onshore',
    en: 'Onshore',
    className: 'text-windDir-onshore border-windDir-onshore/30 bg-windDir-onshore/10',
  },
  cross: {
    pt: 'Cross-shore',
    en: 'Cross-shore',
    className: 'text-windDir-cross border-divider bg-surface-2',
  },
};

export default function SpotDetailHero({
  spot,
  locale,
  backLabel,
  sport,
  score,
  coastOrientation,
  tideObserved,
  conditions,
}: SpotDetailHeroProps) {
  const isPt = locale === 'pt';
  const title = isPt ? spot.name : spot.nameEn;
  const region = isPt ? spot.region : spot.regionEn;
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

  const windRelation =
    coastOrientation !== undefined
      ? getWindRelationToCoast(conditions.windDirection, coastOrientation)
      : null;
  const windRelationMeta = windRelation ? WIND_RELATION_LABEL[windRelation] : null;

  return (
    <header className="max-w-6xl mx-auto px-4 pt-4 pb-2">
      <Link
        href={`/${locale}/spots/`}
        className="inline-flex items-center gap-1.5 text-meta text-fg-muted hover:text-fg transition-colors duration-150 mb-4"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        {backLabel}
      </Link>

      <div className="card-hero p-4 md:p-5 space-y-5">
        {/* Title row + score */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-h1 text-fg tracking-tight">{title}</h1>
              <div className="flex items-center gap-2 shrink-0 sm:hidden">
                <SocialShare title={`${title} — ${region}`} locale={locale} />
                <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={locale} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted">
              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />
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
              <WaterQualityBadge
                blueFlag={spot.blueFlag}
                waterQuality={spot.waterQuality}
                waterQualityEn={spot.waterQualityEn}
                accessibleBeach={spot.accessibleBeach}
                locale={locale}
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
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

          <div className="flex items-center gap-3 shrink-0 sm:flex-col sm:items-end">
            <div className="hidden sm:flex items-center gap-2">
              <SocialShare title={`${title} — ${region}`} locale={locale} />
              <FavoriteButton spotId={spot.id} spotName={spot.name} size="lg" locale={locale} />
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1.5">
              <span className="pill pill-ghost px-2 py-0.5 min-h-0 text-meta-sm sport-accent" data-sport={sport}>
                {sportLabel}
              </span>
              <ScoreBadge score={score} locale={isPt ? 'pt' : 'en'} size="md" showLabel />
            </div>
          </div>
        </div>

        {/* Hero metrics — wind kt only here + waves/water */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <StatChip
            icon={<Waves className="w-4 h-4 text-data-waves" />}
            value={`${conditions.waveHeight.toFixed(1)}m`}
            label={isPt ? 'Ondas' : 'Waves'}
            className="bg-surface-1/80"
          />
          <StatChip
            icon={<Clock className="w-4 h-4 text-data-period" />}
            value={`${Math.round(conditions.wavePeriod)}s`}
            label={isPt ? 'Período' : 'Period'}
            className="bg-surface-1/80"
          />
          <StatChip
            icon={<Wind className="w-4 h-4 text-data-wind" />}
            value={`${windKt}kt`}
            label={isPt ? 'Vento' : 'Wind'}
            className="bg-surface-1/80"
          />
          <StatChip
            icon={<Droplets className="w-4 h-4 text-data-water" />}
            value={`${conditions.waterTemp.toFixed(1)}°C`}
            label={isPt ? 'Água' : 'Water'}
            className="bg-surface-1/80"
          />
        </div>

        {/* Agora — radar only; no duplicate swell/wind legend */}
        <section className="pt-5 border-t border-divider" aria-labelledby="spot-now-heading">
          <h2 id="spot-now-heading" className="text-h3 text-fg mb-4">
            {isPt ? 'Agora' : 'Now'}
          </h2>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <SwellRadar
              swellDirection={conditions.waveDirection}
              swellHeight={swellH}
              swellPeriod={conditions.wavePeriod}
              windDirection={conditions.windDirection}
              windSpeed={conditions.windSpeed}
              coastOrientation={coastOrientation}
              size="md"
              showLegend={false}
            />
            <div className="flex-1 w-full text-center sm:text-left space-y-3">
              <p className="text-meta text-fg-muted max-w-sm mx-auto sm:mx-0">
                {isPt
                  ? 'Ondulação e vento face à orientação da costa'
                  : 'Swell and wind relative to coast orientation'}
              </p>
              {windRelationMeta && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-pill border px-2.5 py-1 text-meta-sm font-medium',
                    windRelationMeta.className,
                  )}
                >
                  {isPt ? windRelationMeta.pt : windRelationMeta.en}
                </span>
              )}
              {tideObserved && (
                <p className="text-meta-sm text-fg-subtle">
                  {isPt ? 'Maré observada' : 'Observed tide'}:{' '}
                  <span className="font-mono tabular-nums text-fg-muted">
                    {tideObserved.height.toFixed(2)}m
                  </span>
                  {' · '}
                  {tideObserved.station}
                  {tideObserved.at && (
                    <>
                      {' · '}
                      {new Date(tideObserved.at).toLocaleString(isPt ? 'pt-PT' : 'en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </header>
  );
}
