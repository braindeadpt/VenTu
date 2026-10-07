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

function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Nome do spot para superfícies onde o mesmo spot aparece em vários sítios
 * ao mesmo tempo (mapa: marcador, tooltip, lista, cartão). Quando o `nameEn`
 * é só a cópia sem acentos do nome PT («Nazare» vs «Nazaré»), fica o nome
 * acentuado — é o topónimo real e marcador e lista passam a dizer o mesmo.
 * Traduções a sério («Afife (Arda Beach)») mantêm-se.
 */
export function localizedSpotDisplayName(
  spot: Pick<Spot, 'name'> & { nameEn?: string | null },
  locale: string,
): string {
  const localized = localizedSpotName(spot, locale);
  if (localized !== spot.name && foldDiacritics(localized) === foldDiacritics(spot.name)) {
    return spot.name;
  }
  return localized;
}

export function localizedSpotRegion(
  spot: Pick<Spot, 'region'> & { regionEn?: string | null },
  locale: string,
): string {
  if (locale === 'pt') return spot.region;
  return spot.regionEn || spot.region;
}
