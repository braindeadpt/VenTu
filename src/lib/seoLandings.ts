import { localizedText } from '@/lib/localizedText';
import { getTranslation } from '@/lib/i18n';
import { spots } from '@/lib/spots'
import { pipelineSchedule } from '@/lib/dataPipelineSchedule'
import { getCompatibleSports, type GridSportFilter, type SportType } from '@/lib/sportRatings'
import { getMacroRegion, MACRO_REGIONS, type MacroRegion } from '@/lib/regions'

const SEO_SPORTS: GridSportFilter[] = [
  'surf',
  'kitesurf',
  'windsurf',
  'bodyboard',
  'sup',
  'foil',
  'wakeboard',
  'big-wave',
]

const REGION_SLUGS: Record<Exclude<MacroRegion, 'Todos'>, string> = {
  Norte: 'norte',
  Centro: 'centro',
  Lisboa: 'lisboa',
  Alentejo: 'alentejo',
  Algarve: 'algarve',
  'Açores': 'acores',
  Madeira: 'madeira',
}

const SLUG_TO_REGION = Object.fromEntries(
  Object.entries(REGION_SLUGS).map(([region, slug]) => [slug, region as MacroRegion]),
) as Record<string, MacroRegion>

export interface SeoLanding {
  slug: string
  sport: GridSportFilter
  region?: MacroRegion
  spotCount: number
}

export const SPORT_LABELS: Record<string, { pt: string; en: string }> = {
  surf: { pt: 'Surf', en: 'Surf' },
  kitesurf: { pt: 'Kitesurf', en: 'Kitesurf' },
  windsurf: { pt: 'Windsurf', en: 'Windsurf' },
  bodyboard: { pt: 'Bodyboard', en: 'Bodyboard' },
  sup: { pt: 'SUP', en: 'SUP' },
  foil: { pt: 'Foil', en: 'Foil' },
  wakeboard: { pt: 'Wakeboard', en: 'Wakeboard' },
  'big-wave': { pt: 'Big Wave', en: 'Big Wave' },
}

/**
 * Nome da macro-região no locale. «Centro/Lisboa» têm tradução real; Portugal,
 * Alentejo, Algarve e Madeira são nomes próprios iguais em todas as línguas.
 */
export function regionLabel(region: MacroRegion, locale: string): string {
  const t = getTranslation(locale).regions
  switch (region) {
    case 'Todos':
      return 'Portugal'
    case 'Norte':
      return t.norte
    case 'Centro':
      return t.centro
    case 'Lisboa':
      return t.lisboa
    case 'Açores':
      return t.acores
    default:
      return region
  }
}

function countSpots(sport: (typeof SEO_SPORTS)[number], region?: MacroRegion): number {
  return spots.filter((spot) => {
    if (region) {
      const macro = getMacroRegion(spot.region)
      if (macro !== region) return false
    }
    if (sport === 'big-wave') return spot.type === 'big-wave'
    return getCompatibleSports(spot).includes(sport as SportType)
  }).length
}

function buildLandings(): SeoLanding[] {
  const landings: SeoLanding[] = []

  for (const sport of SEO_SPORTS) {
    const total = countSpots(sport)
    if (total > 0) {
      landings.push({ slug: sport, sport, spotCount: total })
    }

    for (const region of MACRO_REGIONS) {
      if (region === 'Todos') continue
      const regionSlug = REGION_SLUGS[region]
      const n = countSpots(sport, region)
      if (n > 0) {
        landings.push({
          slug: `${sport}-${regionSlug}`,
          sport,
          region,
          spotCount: n,
        })
      }
    }
  }

  return landings
}

export const SEO_LANDINGS = buildLandings()

export function getSeoLanding(slug: string): SeoLanding | undefined {
  return SEO_LANDINGS.find((l) => l.slug === slug)
}

export function parseLandingSlug(slug: string): { sport: GridSportFilter; region?: MacroRegion } | null {
  const landing = getSeoLanding(slug)
  if (!landing) return null
  return { sport: landing.sport, region: landing.region }
}

export function landingTitle(landing: SeoLanding, locale: string): string {
  const t = getTranslation(locale).seoLandings
  const sport = localizedText(SPORT_LABELS[landing.sport], locale)
  if (!landing.region) {
    return t.inPortugal.replace('{sport}', sport)
  }
  const region = regionLabel(landing.region, locale)
  return t.inRegion.replace('{sport}', sport).replace('{region}', region)
}

export function landingDescription(landing: SeoLanding, locale: string): string {
  return getTranslation(locale)
    .seoLandings.description.replace('{title}', landingTitle(landing, locale))
    .replace('{count}', String(landing.spotCount))
    .replace('{schedule}', pipelineSchedule(locale))
}

export const POPULAR_LANDING_SLUGS = [
  'surf',
  'kitesurf',
  'surf-algarve',
  'kitesurf-algarve',
  'surf-lisboa',
  'surf-centro',
] as const

export function getPopularLandings(limit = 6): SeoLanding[] {
  return POPULAR_LANDING_SLUGS
    .map((slug) => getSeoLanding(slug))
    .filter((l): l is SeoLanding => Boolean(l))
    .slice(0, limit)
}
