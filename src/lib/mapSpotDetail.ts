import type { Spot } from '@/types';

export function getGoogleMapsDirectionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

export function getSpotDetailHref(
  locale: string,
  slug: string,
  sport?: string,
): string {
  if (sport && sport !== 'all' && sport !== 'big-wave') {
    return `/${locale}/spots/${slug}/?sport=${sport}`;
  }
  return `/${locale}/spots/${slug}/`;
}
