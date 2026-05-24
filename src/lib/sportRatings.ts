import { Spot } from '@/types'

// Types and constants for sports — scoring logic moved to sportScore.ts

export type SportType = 'surf' | 'kitesurf' | 'windsurf' | 'wakeboard' | 'bodyboard' | 'sup' | 'foil'

/** Sport filter used in SpotGridClient (includes modality-only big-wave). */
export type GridSportFilter = SportType | 'all' | 'big-wave'

export const SPORT_LABELS: Record<SportType, { pt: string; en: string }> = {
  surf: { pt: 'Surf', en: 'Surf' },
  kitesurf: { pt: 'Kitesurf', en: 'Kitesurf' },
  windsurf: { pt: 'Windsurf', en: 'Windsurf' },
  wakeboard: { pt: 'Wakeboard', en: 'Wakeboard' },
  bodyboard: { pt: 'Bodyboard', en: 'Bodyboard' },
  sup: { pt: 'SUP', en: 'SUP' },
  foil: { pt: 'Foil', en: 'Foil' },
}

export const ALL_SPORTS: SportType[] = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil']

/**
 * Maps spot.type → compatible sports when spot.compatibleSports is not set.
 * Multisport = most water sports except wakeboard (cable park, different geo).
 */
export const TYPE_TO_SPORTS: Record<string, SportType[]> = {
  surf: ['surf', 'bodyboard'],
  'big-wave': ['surf'],
  bodyboard: ['surf', 'bodyboard'],
  kitesurf: ['kitesurf'],
  windsurf: ['windsurf'],
  foil: ['surf', 'kitesurf', 'windsurf'],
  wakeboard: ['wakeboard'],
  sup: ['sup'],
  multisport: ['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup'],
}

/**
 * Returns the sports that make sense to practice at this spot.
 * Prefers explicit spot.compatibleSports override; falls back to
 * a heuristic mapping from spot.type.
 *
 * TODO Fase 5: populate spot.compatibleSports manually for all 80
 * spots; this helper then becomes a pure passthrough for spots with
 * the field set, and the type fallback handles only spots missing it.
 */
export function getCompatibleSports(spot: Spot): SportType[] {
  if (spot.compatibleSports && spot.compatibleSports.length > 0) {
    return spot.compatibleSports as SportType[]
  }
  return TYPE_TO_SPORTS[spot.type] ?? ['surf'] // default: conservative
}
