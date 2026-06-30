import type { Spot } from '@/types';
import type { GridSportFilter, SportType } from '@/lib/sportRatings';
import { getCompatibleSports } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { getGridSpotScore } from '@/lib/gridSpotScore';
import { tierPhrase } from '@/lib/voice';
import { getCardinalLabel } from '@/lib/wind';
import { MS_TO_KNOTS } from '@/lib/waveEnergy';

function resolveNarrativeSport(
  sport: GridSportFilter,
  spot: Spot,
  allScores: Record<SportType, SportScore>,
): SportType {
  if (sport === 'big-wave') return 'surf';
  if (sport !== 'all') return sport;

  const compatible = getCompatibleSports(spot);
  let best: SportType = compatible[0] ?? 'surf';
  let bestScore = allScores[best]?.score ?? 0;
  for (const s of compatible) {
    const sc = allScores[s]?.score ?? 0;
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return best;
}

function waterContext(
  spot: Spot,
  swellH: number,
  isPt: boolean,
): string {
  const swellTag = spot.bestSwell.toLowerCase();
  if (swellTag.includes('lagoa') || swellTag.includes('rio')) {
    return isPt ? 'água plana' : 'flat water';
  }
  if (spot.type === 'wakeboard' || swellTag.includes('lagoa')) {
    return isPt ? 'lagoa/cable' : 'lake/cable';
  }
  if (swellH < 0.35) return isPt ? 'mar de espelho' : 'glassy';
  if (swellH < 0.8) return isPt ? 'mar calmo' : 'calm chop';
  if (swellH < 1.5) return isPt ? 'ondulação leve' : 'light swell';
  return isPt ? 'ondulação' : 'swell';
}

function crowdHint(spot: Spot, isPt: boolean): string | null {
  if (spot.secretLevel === 'secret' || spot.secretLevel === 'deep-secret') {
    return isPt ? 'pouco crowd' : 'low crowd';
  }
  if (spot.secretLevel === 'semi-secret' || spot.localSecret) {
    return isPt ? 'crowd moderado' : 'moderate crowd';
  }
  if (spot.facilities.some((f) => /escola/i.test(f))) {
    return isPt ? 'zonas de escola' : 'school zones';
  }
  return null;
}

/** One-line map sheet narrative for the active sport filter. */
export function getMapSpotNarrative(
  spot: Spot,
  conditions: MarineConditionsFields,
  allScores: Record<SportType, SportScore>,
  sport: GridSportFilter,
  isPt: boolean,
): string {
  const narrativeSport = resolveNarrativeSport(sport, spot, allScores);
  const filterScore = getGridSpotScore({ spot, conditions, allScores }, sport);
  const windKt = Math.round(conditions.windSpeed * MS_TO_KNOTS);
  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const swellT = Math.round(conditions.swellPeriod ?? conditions.wavePeriod);
  const windCard = getCardinalLabel(conditions.windDirection);

  const parts: string[] = [tierPhrase(filterScore, isPt)];

  switch (narrativeSport) {
    case 'kitesurf':
    case 'windsurf':
    case 'foil':
      parts.push(waterContext(spot, swellH, isPt));
      parts.push(`${windKt}kt ${windCard}`);
      break;
    case 'surf':
    case 'bodyboard':
      parts.push(`${swellH.toFixed(1)}m · ${swellT}s`);
      if (windKt >= 14) parts.push(isPt ? 'vento marcado' : 'windy');
      break;
    case 'sup':
      parts.push(waterContext(spot, swellH, isPt));
      parts.push(`${windKt}kt`);
      break;
    case 'wakeboard':
      parts.push(isPt ? 'água plana' : 'flat water');
      break;
    default:
      break;
  }

  const crowd = crowdHint(spot, isPt);
  if (crowd) parts.push(crowd);

  return parts.slice(0, 4).join(' · ');
}
