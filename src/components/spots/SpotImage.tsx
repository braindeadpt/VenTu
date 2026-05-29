import type { Spot } from '@/types';
import { cn } from '@/lib/cn';

type SpotImageProps = {
  spot: Pick<Spot, 'slug' | 'type' | 'images' | 'name' | 'nameEn'>;
  aspect?: 'video' | 'square' | 'hero';
  locale?: 'pt' | 'en';
  className?: string;
};

const SPORT_SURFACE: Record<string, string> = {
  surf: '--sport-surf',
  kitesurf: '--sport-kitesurf',
  windsurf: '--sport-windsurf',
  'big-wave': '--windDir-offshore',
  foil: '--sport-foil',
  wakeboard: '--sport-wakeboard',
  multisport: '--data-waves',
};

export default function SpotImage({
  spot,
  aspect = 'video',
  locale = 'pt',
  className,
}: SpotImageProps) {
  const src = spot.images?.[0];
  const aspectClass =
    aspect === 'hero'
      ? 'min-h-[220px] md:min-h-[280px] w-full'
      : aspect === 'video'
        ? 'aspect-video'
        : 'aspect-square';
  const label = locale === 'pt' ? spot.name : spot.nameEn || spot.name;
  const sportVar = SPORT_SURFACE[spot.type] ?? '--data-waves';

  if (src) {
    return (
      <div className={cn('relative overflow-hidden bg-surface-2/[0.08]', aspectClass, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          className="absolute inset-0 w-full h-full object-cover"
          loading={aspect === 'hero' ? 'eager' : 'lazy'}
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className={cn('relative overflow-hidden', aspectClass, className)}
      style={{
        background: `linear-gradient(145deg, rgb(var(${sportVar}) / 0.35) 0%, rgb(var(--surface-2) / 0.12) 55%, rgb(var(--bg-base) / 0.9) 100%)`,
      }}
      aria-hidden
    >
      <span className="absolute inset-0 flex items-end p-3 text-meta-sm font-medium text-fg/80 truncate">
        {label}
      </span>
    </div>
  );
}
