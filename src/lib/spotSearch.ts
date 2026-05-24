import { spots } from '@/lib/spots'
import { getCompatibleSports, type SportType } from '@/lib/sportRatings'
import type { Spot } from '@/types'

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export interface SpotSearchOptions {
  locale: string
  query: string
  limit?: number
  includeSport?: boolean
}

export function searchSpots({
  locale,
  query,
  limit = 8,
  includeSport = true,
}: SpotSearchOptions): Spot[] {
  const isPt = locale === 'pt'
  const q = normalize(query.trim())

  if (!q) {
    return spots.slice(0, limit)
  }

  const sportKeywords: Record<string, SportType[]> = {
    surf: ['surf'],
    kitesurf: ['kitesurf'],
    kite: ['kitesurf'],
    windsurf: ['windsurf'],
    wind: ['windsurf'],
    bodyboard: ['bodyboard'],
    sup: ['sup'],
    foil: ['foil'],
    wakeboard: ['wakeboard'],
    wake: ['wakeboard'],
  }

  return spots
    .filter((spot) => {
      const name = normalize(isPt ? spot.name : spot.nameEn)
      const region = normalize(isPt ? spot.region : spot.regionEn)
      const slug = normalize(spot.slug)

      if (name.includes(q) || region.includes(q) || slug.includes(q)) {
        return true
      }

      if (!includeSport) return false

      for (const [keyword, sports] of Object.entries(sportKeywords)) {
        if (!q.includes(keyword)) continue
        const compatible = getCompatibleSports(spot)
        if (sports.some((s) => compatible.includes(s))) return true
      }

      return false
    })
    .slice(0, limit)
}
