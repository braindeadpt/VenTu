'use client';

import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import type { Spot } from '@/types';
import FavoriteButton from '@/components/FavoriteButton';
import SocialShare from '@/components/ui/SocialShare';
import { WaterQualityBadge } from '@/components/spots/WaterQualityBadge';

interface SpotDetailHeroProps {
  spot: Spot;
  locale: string;
  backLabel: string;
}

export default function SpotDetailHero({ spot, locale, backLabel }: SpotDetailHeroProps) {
  const isPt = locale === 'pt';
  const title = isPt ? spot.name : spot.nameEn;
  const region = isPt ? spot.region : spot.regionEn;

  return (
    <header className="max-w-6xl mx-auto px-4 pt-5 pb-3">
      <Link
        href={`/${locale}/spots/`}
        className="inline-flex items-center gap-1.5 text-meta text-fg-muted hover:text-fg transition-colors mb-3"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-display-lg text-fg">{title}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-fg-muted mt-1">
            <MapPin className="w-4 h-4 shrink-0" />
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
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <SocialShare title={`${title} — ${region}`} locale={locale} />
          <FavoriteButton spotId={spot.id} spotName={spot.name} size="lg" locale={locale} />
        </div>
      </div>
    </header>
  );
}
