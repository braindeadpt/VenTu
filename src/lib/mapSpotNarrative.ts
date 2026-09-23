import type { Spot } from '@/types';
import type { GridSportFilter, SportType } from '@/lib/sportRatings';
import { getCompatibleSports } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import { getGridSpotScore } from '@/lib/gridSpotScore';
import { tierPhrase } from '@/lib/voice';
import { getCardinalLabel } from '@/lib/wind';
import { getTranslation } from '@/lib/i18n';
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

type NarrativeLabels = ReturnType<typeof getTranslation>['mapNarrative'];

function waterContext(spot: Spot, swellH: number, t: NarrativeLabels): string {
  const swellTag = spot.bestSwell.toLowerCase();
  if (swellTag.includes('lagoa') || swellTag.includes('rio')) {
    return t.waterFlat;
  }
  if (spot.type === 'wakeboard' || swellTag.includes('lagoa')) {
    return t.waterLake;
  }
  if (swellH < 0.35) return t.waterGlassy;
  if (swellH < 0.8) return t.waterCalmChop;
  if (swellH < 1.5) return t.waterLightSwell;
  return t.waterSwell;
}

function crowdHint(spot: Spot, t: NarrativeLabels): string | null {
  if (spot.secretLevel === 'secret' || spot.secretLevel === 'deep-secret') {
    return t.crowdLow;
  }
  if (spot.secretLevel === 'semi-secret' || spot.localSecret) {
    return t.crowdModerate;
  }
  if (spot.facilities.some((f) => /escola/i.test(f))) {
    return t.crowdSchool;
  }
  return null;
}

/** One-line map sheet narrative for the active sport filter. */
export function getMapSpotNarrative(
  spot: Spot,
  conditions: MarineConditionsFields,
  allScores: Record<SportType, SportScore>,
  sport: GridSportFilter,
  locale: string,
): string {
  const t = getTranslation(locale).mapNarrative;
  const narrativeSport = resolveNarrativeSport(sport, spot, allScores);
  const filterScore = getGridSpotScore({ spot, conditions, allScores }, sport);
  const windKt = Math.round(conditions.windSpeed * MS_TO_KNOTS);
  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const swellT = Math.round(conditions.swellPeriod ?? conditions.wavePeriod);
  const windCard = getCardinalLabel(conditions.windDirection);

  const parts: string[] = [tierPhrase(filterScore, locale)];

  switch (narrativeSport) {
    case 'kitesurf':
    case 'windsurf':
    case 'foil':
      parts.push(waterContext(spot, swellH, t));
      parts.push(`${windKt}kt ${windCard}`);
      break;
    case 'surf':
    case 'bodyboard':
      parts.push(`${swellH.toFixed(1)}m · ${swellT}s`);
      if (windKt >= 14) parts.push(t.windMarked);
      break;
    case 'sup':
      parts.push(waterContext(spot, swellH, t));
      parts.push(`${windKt}kt`);
      break;
    case 'wakeboard':
      parts.push(t.waterFlat);
      break;
    default:
      break;
  }

  const crowd = crowdHint(spot, t);
  if (crowd) parts.push(crowd);

  return parts.slice(0, 4).join(' · ');
}
