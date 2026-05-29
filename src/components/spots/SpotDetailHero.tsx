'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Droplets,
  MapPin,
  Navigation,
  Waves,
  Wind,
} from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getScoreTokens } from '@/lib/sportScore';
import { getDataFreshness } from '@/lib/dataFreshness';
import { getGoogleMapsDirectionsUrl } from '@/lib/mapSpotDetail';
import { cn } from '@/lib/cn';
import FavoriteButton from '@/components/FavoriteButton';
import SocialShare from '@/components/ui/SocialShare';
import { WaterQualityBadge } from '@/components/spots/WaterQualityBadge';
import SpotImage from '@/components/spots/SpotImage';
import ScoreGauge from '@/components/ui/ScoreGauge';
import StatChip from '@/components/ui/StatChip';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
interface SpotDetailHeroProps {
  spot: Spot;
  spotSlug: string;
  locale: string;
  backLabel: string;
  directionsLabel: string;
  sport: SportType;
  score: number;
  rating: string;
  ratingEn: string;
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    swellHeight?: number;
    windSpeed: number;
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
  directionsLabel,
  sport,
  score,
  rating,
  ratingEn,
  conditions,
}: SpotDetailHeroProps) {
  const isPt = locale === 'pt';
  const title = isPt ? spot.name : spot.nameEn;
  const region = isPt ? spot.region : spot.regionEn;
  const sportLabel = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];
  const windKt = Math.round(conditions.windSpeed * 1.94384);
  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const tokens = getScoreTokens(score);
  const directionsUrl = getGoogleMapsDirectionsUrl(spot.lat, spot.lon);

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
    <header className="relative w-full overflow-hidden border-b border-divider" data-spot-slug={spotSlug}>
      <div className="absolute inset-0">
        <SpotImage
          spot={spot}
          aspect="hero"
          locale={isPt ? 'pt' : 'en'}
          className="h-full min-h-[220px] md:min-h-[280px]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/92 to-bg-base/55 dark:from-bg-base dark:via-bg-base/92 dark:to-bg-base/60"
          aria-hidden
        />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 pt-4 pb-5">
        <Link
          href={`/${locale}/spots/`}
          className="inline-flex items-center gap-1.5 text-meta text-fg-muted hover:text-fg transition-colors duration-150 mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {backLabel}
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-serif text-display-lg text-fg tracking-tight drop-shadow-sm">
                {title}
              </h1>
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

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {showUpdatedPill && (
                <span className="pill pill-ghost gap-1.5 px-2 py-1 min-h-0 text-meta-sm text-fg-muted bg-bg-base/40">
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

            <div className="flex flex-wrap gap-2 pt-2">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center justify-center gap-2 font-medium',
                  'px-4 py-2 text-sm rounded-input min-h-[44px]',
                  'bg-data-waves text-bg-base hover:bg-data-waves/90',
                  'transition-colors duration-150',
                )}
              >
                <Navigation className="w-4 h-4" aria-hidden />
                {directionsLabel}
              </a>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-2">
              <SocialShare title={`${title} — ${region}`} locale={locale} />
              <FavoriteButton spotId={spot.id} spotName={spot.name} size="lg" locale={locale} />
            </div>
            <div className="rounded-card bg-bg-base/50 backdrop-blur-sm p-2 border border-divider/60">
              <ScoreGauge score={score} label={sportLabel} sublabel="/100" size="lg" />
              <p className={cn('text-body font-semibold text-center mt-1', tokens.text)}>
                {isPt ? rating : ratingEn}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <StatChip
            icon={<Waves className="w-4 h-4 text-data-waves" />}
            value={`${conditions.waveHeight.toFixed(1)}m`}
            label={isPt ? 'Ondas' : 'Waves'}
            className="bg-bg-base/55 backdrop-blur-sm border border-divider/50"
          />
          <StatChip
            icon={<Clock className="w-4 h-4 text-data-period" />}
            value={`${Math.round(conditions.wavePeriod)}s`}
            label={isPt ? 'Período' : 'Period'}
            className="bg-bg-base/55 backdrop-blur-sm border border-divider/50"
          />
          <StatChip
            icon={<Wind className="w-4 h-4 text-data-wind" />}
            value={`${windKt}kt`}
            label={isPt ? 'Vento' : 'Wind'}
            className="bg-bg-base/55 backdrop-blur-sm border border-divider/50"
          />
          <StatChip
            icon={<Droplets className="w-4 h-4 text-data-water" />}
            value={`${conditions.waterTemp.toFixed(1)}°C`}
            label={isPt ? 'Água' : 'Water'}
            className="bg-bg-base/55 backdrop-blur-sm border border-divider/50"
          />
        </div>
      </div>
    </header>
  );
}
