import type { MacroRegion } from '@/lib/regions';

/** Slug for /public/images/regions/{slug}.jpg — lifestyle only, never on spot cards. */
export const REGION_IMAGE_SLUGS = [
  'norte',
  'centro',
  'lisboa',
  'alentejo',
  'algarve',
  'acores',
  'madeira',
] as const;

export type RegionImageSlug = (typeof REGION_IMAGE_SLUGS)[number];

const MACRO_TO_SLUG: Record<string, RegionImageSlug> = {
  Norte: 'norte',
  Centro: 'centro',
  Lisboa: 'lisboa',
  Alentejo: 'alentejo',
  Algarve: 'algarve',
  Açores: 'acores',
  Madeira: 'madeira',
};

export function macroRegionToImageSlug(macro: string): RegionImageSlug | null {
  return MACRO_TO_SLUG[macro] ?? null;
}

export function getRegionLifestylePath(slug: RegionImageSlug): string {
  return `/images/regions/${slug}.jpg`;
}

/** Default coastal band for home hero (continental presence). */
export const HOME_HERO_REGION_SLUG: RegionImageSlug = 'centro';

export function getRegionLifestyleAlt(slug: RegionImageSlug, locale: 'pt' | 'en'): string {
  const names: Record<RegionImageSlug, { pt: string; en: string }> = {
    norte: { pt: 'Costa norte de Portugal', en: 'Northern coast of Portugal' },
    centro: { pt: 'Costa centro de Portugal', en: 'Central coast of Portugal' },
    lisboa: { pt: 'Costa de Lisboa', en: 'Lisbon coast' },
    alentejo: { pt: 'Costa alentejana', en: 'Alentejo coast' },
    algarve: { pt: 'Costa do Algarve', en: 'Algarve coast' },
    acores: { pt: 'Arquipélago dos Açores', en: 'Azores archipelago' },
    madeira: { pt: 'Ilha da Madeira', en: 'Madeira island' },
  };
  return locale === 'pt' ? names[slug].pt : names[slug].en;
}

export function resolveRegionSlugFromMacro(macro: MacroRegion | string): RegionImageSlug {
  return macroRegionToImageSlug(macro) ?? 'centro';
}
