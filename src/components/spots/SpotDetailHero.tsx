'use client';

import Link from 'next/link';
import { ArrowLeft, Clock, Droplets, MapPin, Navigation, Waves, Wind } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getGoogleMapsDirectionsUrl } from '@/lib/mapSpotDetail';
import { cn } from '@/lib/cn';
import FavoriteButton from '@/components/FavoriteButton';
import SocialShare from '@/components/ui/SocialShare';
import { WaterQualityBadge } from '@/components/spots/WaterQualityBadge';
import SpotImage from '@/components/ui/SpotImage';
import ScoreGauge from '@/components/ui/ScoreGauge';
import ScoreBadge from '@/components/ui/ScoreBadge';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import ConfidenceBadge from '@/components/ui/ConfidenceBadge';
import SpotLevelToday from '@/components/spots/SpotLevelToday';
import StatChip from '@/components/ui/StatChip';
import SpotAlertPopover from '@/components/spots/SpotAlertPopover';
import type { ConfidenceDetail, ConfidenceTier } from '@/lib/forecastConfidence';

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
    confidence?: ConfidenceTier;
    confidenceDetail?: ConfidenceDetail;
  };
  /** Optional ref pointing to the hero root — used by the sticky condensed bar. */
  heroRef?: React.Ref<HTMLElement>;
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
  heroRef,
}: SpotDetailHeroProps) {
  const isPt = locale === 'pt';
  const title = isPt ? spot.name : spot.nameEn;
  const region = isPt ? spot.region : spot.regionEn;
  const sportLabel = SPORT_LABELS[sport][isPt ? 'pt' : 'en'];
  const directionsUrl = getGoogleMapsDirectionsUrl(spot.lat, spot.lon);
  const windKt = Math.round(conditions.windSpeed * 1.94384);

  const updatedLabel = conditions.updatedAt
    ? new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        day: 'numeric',
        month: 'short',
      }).format(new Date(conditions.updatedAt))
    : null;

  const showQuality =
    spot.blueFlag || spot.waterQuality || spot.accessibleBeach;

  return (
    <header
      ref={heroRef}
      className="relative w-full overflow-hidden border-b border-divider"
      data-spot-slug={spotSlug}
    >
      <div className="absolute inset-0">
        <SpotImage
          spot={spot}
          aspect="hero"
          locale={isPt ? 'pt' : 'en'}
          priority
          scrim={false}
          className="h-full min-h-[200px] md:min-h-[240px]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/88 to-bg-base/40 md:via-bg-base/92 md:to-bg-base/55 spot-hero-scrim-bottom"
          aria-hidden
        />
        <div
          className="absolute inset-0 hidden md:block bg-gradient-to-r from-bg-base/80 via-transparent to-transparent max-w-[min(100%,520px)] spot-hero-scrim-side"
          aria-hidden
        />
      </div>

      <div className="spot-hero-ink relative max-w-6xl mx-auto px-4 pt-3 pb-4">
        <Link
          href={`/${locale}/spots/`}
          className="inline-flex items-center gap-1.5 text-meta-sm text-fg-muted hover:text-fg transition-colors duration-150 mb-2"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {backLabel}
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-display-lg text-fg tracking-tight leading-tight pr-1">
                {title}
              </h1>
              <div className="flex items-center gap-2 shrink-0 lg:hidden">
                <SocialShare title={`${title} — ${region}`} locale={locale} />
                <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={locale} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta-sm text-fg-muted">
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
              {showQuality && (
                <>
                  <span aria-hidden>·</span>
                  <WaterQualityBadge
                    blueFlag={spot.blueFlag}
                    waterQuality={spot.waterQuality}
                    waterQualityEn={spot.waterQualityEn}
                    accessibleBeach={spot.accessibleBeach}
                    locale={locale}
                  />
                </>
              )}
            </div>

            <SpotLevelToday
              difficulty={spot.difficulty}
              score={score}
              locale={locale}
            />

            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center justify-center gap-2 font-medium',
                'px-4 py-2 text-sm rounded-input min-h-[44px]',
                'bg-accent hover:bg-accent-hover active:bg-accent-active border border-transparent',
                'transition-opacity duration-150 shadow-card',
              )}
            >
              <Navigation className="w-4 h-4" aria-hidden />
              {directionsLabel}
            </a>
          </div>

          <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto sm:items-end">
            <div className="hidden lg:flex items-center gap-2 sm:justify-end">
              <SocialShare title={`${title} — ${region}`} locale={locale} />
              <FavoriteButton spotId={spot.id} spotName={spot.name} size="lg" locale={locale} />
            </div>
            <div className="spot-hero-card rounded-card bg-bg-elevated border border-divider p-3 sm:p-4 w-full sm:w-[270px]">
              <div className="flex flex-row sm:flex-col items-center gap-4 sm:gap-2">
                <ScoreGauge score={score} label={sportLabel} sublabel="/100" size="lg" />
                <div className="flex flex-col items-start sm:items-center gap-1.5 min-w-0 flex-1 sm:flex-initial">
                  <ScoreBadge score={score} locale={locale as 'pt' | 'en'} size="md" showLabel />
                  <ConfidenceBadge
                    confidence={conditions.confidence}
                    detail={conditions.confidenceDetail}
                    locale={locale}
                    size="sm"
                  />
                  <SpotAlertPopover
                    spotId={spot.id}
                    sport={sport}
                    locale={locale}
                  />
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-divider grid grid-cols-2 gap-2">
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

              {(updatedLabel || conditions.source) && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-meta-sm text-fg-muted flex-wrap">
                  {updatedLabel && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-score-good motion-reduce:animate-none animate-pulse" />
                      <span>{isPt ? 'Actualizado' : 'Updated'} {updatedLabel}</span>
                    </>
                  )}
                  {conditions.source && (
                    <span aria-hidden className="text-fg-subtle">
                      ·
                    </span>
                  )}
                  <DataSourceBadge
                    source={conditions.source}
                    updatedAt={conditions.updatedAt}
                    locale={locale}
                    size="sm"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
