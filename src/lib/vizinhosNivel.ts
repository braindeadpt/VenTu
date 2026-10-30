/**
 * «Do teu nível, perto daqui» (#nivel-ui, estudo §4 «Spot do nível mas fora de
 * alcance»): os vizinhos ≤ 80 km (a regra do `nearestSpots`/`PertoV6`) que se
 * praticam na modalidade e cabem no nível escolhido (tecto, `spotDentroDoNivel`
 * com o nível por desporto), ordenados pela nota na hora escolhida (a do
 * map-hours, como o «Perto daqui»); empate → o mais perto. Pura e testável.
 * A nota não é recalculada: é a mesma `nearbySpotHour` do «Perto daqui».
 */
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { MapHoursFile } from '@/lib/mapHours';
import { nivelDoSpot, spotDentroDoNivel, type NivelUtilizador } from '@/lib/mapDifficulty';
import { nearbySpotHour, nearestSpots, type NearbySpotHour } from '@/lib/context/nearbySpots';
import { scoreToNota } from '@/lib/nota';
import { calculateDistance } from '@/lib/geolocation';

export const PERTO_NIVEL_KM = 80;
/** Dois spots a menos disto são o mesmo sítio para o «perto daqui». */
export const MESMO_SITIO_KM = 3;

export interface VizinhoDoNivel {
  spot: Spot;
  distanceKm: number;
  /** Nota /10 na hora escolhida; `'noite'` sem nota de noite; `null` sem série/ficheiro. */
  nota: number | 'noite' | null;
  /** Score bruto (0–100) para o `data-score-tier`, quando há nota. */
  score: number | null;
  nivel: Spot['difficulty'];
}

export function vizinhosDoNivel(
  spot: Pick<Spot, 'id' | 'lat' | 'lon'>,
  todos: Spot[],
  sport: SportType,
  nivel: NivelUtilizador,
  file: MapHoursFile | null | undefined,
  passo: number,
  limite = 3,
): VizinhoDoNivel[] {
  return nearestSpots(spot, todos, { limit: Number.POSITIVE_INFINITY, maxKm: PERTO_NIVEL_KM })
    .filter((e) => !e.spot.compatibleSports?.length || e.spot.compatibleSports.includes(sport))
    .filter((e) => spotDentroDoNivel(nivelDoSpot(e.spot, sport), nivel))
    .map((e) => {
      const h: NearbySpotHour = file ? nearbySpotHour(file, e, sport, passo) : null;
      const score = typeof h === 'number' ? h : null;
      return {
        spot: e.spot,
        distanceKm: e.distanceKm,
        score,
        nota: score != null ? scoreToNota(score) : h === 'noite' ? ('noite' as const) : null,
        nivel: nivelDoSpot(e.spot, sport),
      };
    })
    .sort((a, b) => {
      const na = typeof a.nota === 'number' ? a.nota : -1;
      const nb = typeof b.nota === 'number' ? b.nota : -1;
      return nb - na || a.distanceKm - b.distanceKm;
    })
    .filter((v, k, todosV) => {
      // o mesmo sítio não conta duas vezes (variantes de um spot: «Lagoa de Óbidos» e «… — Sul», o
      // spot de foil da mesma lagoa): a mesma célula de previsão ou a < 3 km de um que já entrou
      const celula = (s: Spot) => s.conditionsSource ?? s.id;
      return !todosV
        .slice(0, k)
        .some((o) => celula(o.spot) === celula(v.spot) || calculateDistance(o.spot.lat, o.spot.lon, v.spot.lat, v.spot.lon) < MESMO_SITIO_KM);
    })
    .slice(0, limite);
}
