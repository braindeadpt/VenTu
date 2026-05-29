'use client';

import Image from 'next/image';
import { cn } from '@/lib/cn';
import {
  getRegionLifestyleAlt,
  getRegionLifestylePath,
  type RegionImageSlug,
} from '@/lib/regionImage';

type RegionLifestyleImageProps = {
  slug: RegionImageSlug;
  locale?: 'pt' | 'en';
  className?: string;
  priority?: boolean;
  decorative?: boolean;
};

export default function RegionLifestyleImage({
  slug,
  locale = 'pt',
  className,
  priority = false,
  decorative = false,
}: RegionLifestyleImageProps) {
  const alt = getRegionLifestyleAlt(slug, locale);

  return (
    <Image
      src={getRegionLifestylePath(slug)}
      alt={decorative ? '' : alt}
      fill
      unoptimized
      priority={priority}
      sizes="(max-width: 768px) 100vw, 640px"
      className={cn('object-cover', className)}
      aria-hidden={decorative}
    />
  );
}
