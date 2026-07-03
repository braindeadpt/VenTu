import type { Spot } from '@/types';

export type SpotImagePick = Pick<Spot, 'slug' | 'name' | 'nameEn' | 'region' | 'images'>;

/** Local Esri export path (see scripts/generate-spot-aerials.mjs). */
export function getSpotAerialPath(slug: string): string {
  return `/images/spots/${slug}.jpg`;
}

/** Gradient pairs: beach → ocean → accent (cool only, deterministic per region). */
const REGION_GRADIENT_KEYS: [string, string, string][] = [
  ['--accent',         '--data-waves',  '--data-water'],
  ['--data-water',     '--sport-surf',  '--accent'],
  ['--sport-surf',     '--data-waves',  '--accent'],
  ['--accent',         '--data-water',  '--sport-kitesurf'],
  ['--data-waves',     '--accent',      '--sport-bodyboard'],
  ['--accent',         '--sport-surf',  '--data-water'],
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
  | { kind: 'image'; src: string; aerial?: boolean }
  | { kind: 'gradient'; background: string };

/**
 * Spot imagery priority:
 * 1. Community curated URL (spot.images[0])
 * 2. Generated aerial at coordinates (/images/spots/{slug}.jpg)
 * 3. Deterministic region gradient (fallback via SpotImage onError)
 */
export function getSpotImage(spot: SpotImagePick): SpotImageSource {
  const curated = spot.images?.[0]?.trim();
  if (curated) {
    return { kind: 'image', src: curated, aerial: false };
  }
  return {
    kind: 'image',
    src: getSpotAerialPath(spot.slug),
    aerial: true,
  };
}

/** PT/EN alt for aerial thumbnails. */
export function getSpotImageAlt(spot: SpotImagePick, locale: 'pt' | 'en' = 'pt'): string {
  const name = locale === 'pt' ? spot.name : spot.nameEn || spot.name;
  return locale === 'pt' ? `Vista aérea de ${name}` : `Aerial view of ${name}`;
}
