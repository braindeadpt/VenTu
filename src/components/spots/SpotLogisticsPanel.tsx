'use client';

import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import type { Spot } from '@/types';
import SpotMap from '@/components/spots/SpotMap';
import { cn } from '@/lib/cn';

interface SpotLogisticsPanelProps {
  spot: Spot;
  locale: string;
  locationTitle: string;
  aboutTitle: string;
  directionsHref: string;
  directionsLabel: string;
  openMapsLabel: string;
  regionLabel: string;
  difficultyLabel: string;
}

/**
 * Full-width logistics block: map + actions (left) and spot copy (right).
 */
export default function SpotLogisticsPanel({
  spot,
  locale,
  locationTitle,
  aboutTitle,
  directionsHref,
  directionsLabel,
  openMapsLabel,
  regionLabel,
  difficultyLabel,
}: SpotLogisticsPanelProps) {
  const isPt = locale === 'pt';
  const description = isPt ? spot.description : spot.descriptionEn;
  const region = isPt ? spot.region : spot.regionEn;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${spot.lat}&mlon=${spot.lon}#map=15/${spot.lat}/${spot.lon}`;

  return (
    <div className="card-1 rounded-card border border-divider overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:min-h-[280px]">
        <div className="flex flex-col gap-4 p-4 md:p-5 border-b border-divider lg:border-b-0 lg:border-r border-divider bg-surface-1/[0.02]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-h3 text-fg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-fg-muted shrink-0" aria-hidden />
                {locationTitle}
              </h3>
              <p className="text-meta text-fg-muted font-mono tabular-nums mt-1">
                {spot.lat.toFixed(4)}, {spot.lon.toFixed(4)}
              </p>
            </div>
            <span className="text-meta-sm text-fg-subtle shrink-0 hidden sm:block">
              {region}
            </span>
          </div>

          <div className="relative w-full aspect-[16/10] min-h-[200px] max-h-[min(320px,40vh)] rounded-card overflow-hidden border border-divider bg-bg-base shadow-sm">
            <SpotMap lat={spot.lat} lon={spot.lon} locale={locale} compact hideOverlay />
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center">
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center justify-center gap-2 font-medium w-full sm:w-auto',
                'px-4 py-2.5 text-sm rounded-input min-h-[44px]',
                'bg-sunset border border-transparent hover:opacity-95 active:opacity-90 transition-opacity',
              )}
            >
              <Navigation className="w-4 h-4 shrink-0" aria-hidden />
              {directionsLabel}
            </a>
            <a
              href={osmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto rounded-input border border-divider bg-bg-elevated px-4 py-2.5 text-meta font-medium text-data-waves hover:border-divider-strong transition-colors min-h-[44px]"
            >
              {openMapsLabel}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-4 md:p-5">
          <div>
            <h3 className="text-h3 text-fg">{aboutTitle}</h3>
            <p className="text-meta-sm text-fg-muted mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              <span>{regionLabel}</span>
              <span aria-hidden>·</span>
              <span className="capitalize">{region}</span>
              <span aria-hidden>·</span>
              <span>{difficultyLabel}</span>
              <span className="capitalize">{spot.difficulty}</span>
            </p>
          </div>
          <p className="text-body text-fg-muted leading-relaxed flex-1">{description}</p>
        </div>
      </div>
    </div>
  );
}
