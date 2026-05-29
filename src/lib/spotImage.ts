import type { Spot } from '@/types';

export type SpotImagePick = Pick<Spot, 'slug' | 'name' | 'nameEn' | 'region' | 'images'>;

/** Gradient pairs: beach → ocean → sunset (deterministic per region). */
const REGION_GRADIENT_KEYS: [string, string, string][] = [
  ['--accent-sunset-1', '--data-waves', '--accent-sunset-3'],
  ['--data-water', '--sport-surf', '--accent-sunset-2'],
  ['--sport-surf', '--data-waves', '--accent-sunset-1'],
  ['--accent-sunset-2', '--data-water', '--accent-sunset-3'],
  ['--data-waves', '--accent-sunset-2', '--sport-bodyboard'],
  ['--accent-sunset-3', '--sport-surf', '--data-water'],
];

function hashRegion(region: string): number {
  let h = 0;
  for (let i = 0; i < region.length; i += 1) {
    h = (h * 31 + region.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getRegionGradientCss(region: string): string {
  const keys = REGION_GRADIENT_KEYS[hashRegion(region) % REGION_GRADIENT_KEYS.length];
  const [a, b, c] = keys;
  return `linear-gradient(145deg, rgb(var(${a}) / 0.55) 0%, rgb(var(${b}) / 0.4) 45%, rgb(var(${c}) / 0.35) 100%)`;
}

export type SpotImageSource =
  | { kind: 'image'; src: string }
  | { kind: 'gradient'; background: string };

/** Curated image or deterministic region gradient — never empty. */
export function getSpotImage(spot: SpotImagePick): SpotImageSource {
  const src = spot.images?.[0]?.trim();
  if (src) {
    return { kind: 'image', src };
  }
  return {
    kind: 'gradient',
    background: getRegionGradientCss(spot.region || spot.slug),
  };
}
