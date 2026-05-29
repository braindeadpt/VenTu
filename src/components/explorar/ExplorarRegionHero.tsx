import RegionLifestyleImage from '@/components/ui/RegionLifestyleImage';
import { macroRegionToImageSlug } from '@/lib/regionImage';
import type { MacroRegion } from '@/lib/regions';

type ExplorarRegionHeroProps = {
  region: MacroRegion;
  locale: string;
  title: string;
  description: string;
};

export default function ExplorarRegionHero({
  region,
  locale,
  title,
  description,
}: ExplorarRegionHeroProps) {
  const slug = macroRegionToImageSlug(region);
  if (!slug) return null;

  const isPt = locale === 'pt';

  return (
    <div className="relative w-full overflow-hidden border-b border-divider">
      <div className="relative h-40 sm:h-48 md:h-56">
        <RegionLifestyleImage slug={slug} locale={isPt ? 'pt' : 'en'} className="opacity-90" />
        <div
          className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/75 to-bg-base/30"
          aria-hidden
        />
        <div className="absolute inset-0 flex flex-col justify-end max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
          <h1 className="font-display text-display-lg font-bold text-fg tracking-tight drop-shadow-sm">
            {title}
          </h1>
          <p className="text-body text-fg-muted mt-2 max-w-2xl">{description}</p>
        </div>
      </div>
    </div>
  );
}
