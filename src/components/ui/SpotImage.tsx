'use client';

import Image from 'next/image';
import type { Spot } from '@/types';
import { cn } from '@/lib/cn';
import { getSpotImage } from '@/lib/spotImage';

export type SpotImageAspect = 'video' | 'square' | 'hero';

export type SpotImageProps = {
  spot: Pick<Spot, 'slug' | 'name' | 'nameEn' | 'region' | 'type' | 'images'>;
  aspect?: SpotImageAspect;
  locale?: 'pt' | 'en';
  className?: string;
  priority?: boolean;
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
}: SpotImageProps) {
  const alt = locale === 'pt' ? spot.name : spot.nameEn || spot.name;
  const source = getSpotImage(spot);
  const aspectClass = ASPECT_CLASS[aspect];

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-surface-2/[0.08]',
        aspectClass,
        className,
      )}
    >
      {source.kind === 'image' ? (
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
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: source.background }}
          aria-hidden
        />
      )}
      {source.kind === 'gradient' && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg-base/80 to-transparent p-3 pt-8">
          <span className="font-display text-body-sm font-semibold text-fg truncate block">
            {alt}
          </span>
        </span>
      )}
    </div>
  );
}
