'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Spot } from '@/types';
import { cn } from '@/lib/cn';
import { getRegionGradientCss, getSpotImage, getSpotImageAlt } from '@/lib/spotImage';

export type SpotImageAspect = 'video' | 'square' | 'hero';

export type SpotImageProps = {
  spot: Pick<Spot, 'slug' | 'name' | 'nameEn' | 'region' | 'type' | 'images'>;
  aspect?: SpotImageAspect;
  locale?: 'pt' | 'en';
  className?: string;
  priority?: boolean;
  /** Bottom scrim for legibility on cards (default true for video/hero). */
  scrim?: boolean;
};

const ASPECT_CLASS: Record<SpotImageAspect, string> = {
  hero: 'min-h-[220px] md:min-h-[280px] w-full',
  video: 'aspect-video w-full',
  square: 'aspect-square w-full',
};

export default function SpotImage({
  spot,
  aspect = 'video',
  locale = 'pt',
  className,
  priority = false,
  scrim,
}: SpotImageProps) {
  const alt = getSpotImageAlt(spot, locale);
  const source = getSpotImage(spot);
  const aspectClass = ASPECT_CLASS[aspect];
  const showScrim = scrim ?? aspect !== 'square';
  const [imgFailed, setImgFailed] = useState(false);

  const useGradient = source.kind === 'image' && imgFailed;
  const gradientBg = getRegionGradientCss(spot.region || spot.slug);

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-surface-2/[0.08]',
        aspectClass,
        className,
      )}
    >
      {!useGradient && source.kind === 'image' ? (
        <Image
          src={source.src}
          alt={alt}
          fill
          unoptimized
          priority={priority}
          sizes={
            aspect === 'hero'
              ? '(max-width: 768px) 100vw, 720px'
              : '(max-width: 768px) 100vw, 400px'
          }
          className="object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: gradientBg }}
          aria-hidden
        />
      )}

      {showScrim && (
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg-base/85 via-bg-base/25 to-transparent"
          aria-hidden
        />
      )}

      {useGradient && (
        <span className="absolute inset-x-0 bottom-0 p-3 pt-8 pointer-events-none">
          <span className="font-display text-body-sm font-semibold text-fg truncate block drop-shadow-sm">
            {locale === 'pt' ? spot.name : spot.nameEn || spot.name}
          </span>
        </span>
      )}
    </div>
  );
}
