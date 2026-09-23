import type { Spot } from '@/types';

/**
 * Nome/região do spot por locale.
 *
 * O dataset só traz PT (`name`/`region`) e EN (`nameEn`/`regionEn`): as
 * restantes línguas usam o EN — é o nome próprio internacional — e nunca o PT
 * (evita PT a escapar para es/de/fr). Falta de `nameEn` cai no PT.
 */
export function localizedSpotName(
  spot: Pick<Spot, 'name'> & { nameEn?: string | null },
  locale: string,
): string {
  if (locale === 'pt') return spot.name;
  return spot.nameEn || spot.name;
}

export function localizedSpotRegion(
  spot: Pick<Spot, 'region'> & { regionEn?: string | null },
  locale: string,
): string {
  if (locale === 'pt') return spot.region;
  return spot.regionEn || spot.region;
}
