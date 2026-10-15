import type { Spot } from '@/types';
import { calculateDistance } from '@/lib/geolocation';
import { hourKeyFromOpenMeteo } from '@/lib/openMeteoTime';
import { scoreAtHour, type MapHoursFile } from '@/lib/mapHours';
import type { SportType } from '@/lib/sportRatings';

/**
 * «Perto daqui» (SPOT-PAGE.md §6) — vizinhos do spot com distância e o score
 * da MESMA modalidade à hora escolhida. Os scores horários dos outros spots
 * não vivem na página: usa-se public/data/map-hours.json (passo de 3 h),
 * carregado lazy pelo componente — estas funções são puras e testáveis.
 */

/** Índice do passo de 3 h que contém a hora escolhida: o último passo ≤ hora.
 *  Fora da janela do ficheiro → clamp ao primeiro/último passo (o rótulo «±3 h»
 *  da UI cobre a aproximação). -1 quando o ficheiro não tem passos. */
export function pickMapHourStep(
  times: string[],
  selectedIso: string | null | undefined,
): number {
  if (!times.length) return -1;
  if (!selectedIso) return 0;
  const target = hourKeyFromOpenMeteo(selectedIso);
  let best = 0;
  for (let i = 0; i < times.length; i++) {
    if (hourKeyFromOpenMeteo(times[i]) <= target) best = i;
    else break;
  }
  return best;
}

export interface NearbySpotEntry {
  spot: Spot;
  distanceKm: number;
}

/** Spots mais próximos por distância geodésica, excluindo o próprio. */
export function nearestSpots(
  current: Pick<Spot, 'id' | 'lat' | 'lon'>,
  all: Spot[],
  opts: { limit?: number; maxKm?: number } = {},
): NearbySpotEntry[] {
  const { limit = 5, maxKm = 80 } = opts;
  return all
    .filter((s) => s.id !== current.id)
    .map((spot) => ({
      spot,
      distanceKm: calculateDistance(current.lat, current.lon, spot.lat, spot.lon),
    }))
    .filter((e) => e.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

/** Score do vizinho para a modalidade no passo escolhido; `null` quando a
 *  modalidade não se pratica lá ou o ficheiro não tem a série («—» na UI). */
export function nearbySpotScore(
  file: MapHoursFile | null | undefined,
  entry: NearbySpotEntry,
  sport: SportType,
  step: number,
): number | null {
  const sports = entry.spot.compatibleSports;
  if (sports && sports.length > 0 && !sports.includes(sport)) return null;
  const n = scoreAtHour(file, entry.spot.id, sport, step);
  return n === undefined ? null : n;
}
