import type { Spot } from '@/types';
import { calculateDistance } from '@/lib/geolocation';
import { hasOffset, hourKeyFromOpenMeteo, seriesTimeMs } from '@/lib/openMeteoTime';
import { fusoDoSpot, instanteDaParede } from '@/lib/sol';
import { scoreAtHour, type MapHoursFile } from '@/lib/mapHours';
import type { SportType } from '@/lib/sportRatings';

/**
 * «Perto daqui» (SPOT-PAGE.md §6) — vizinhos do spot com distância e o score
 * da MESMA modalidade à hora escolhida. Os scores horários dos outros spots
 * não vivem na página: usa-se public/data/map-hours.json (passo de 3 h),
 * carregado lazy pelo componente — estas funções são puras e testáveis.
 */

/**
 * Instante da hora escolhida (#456): `opts.ms` quando o chamador já tem o
 * instante (ex.: `HoraSpot.ms`); `opts.lon` resolve uma etiqueta de parede
 * sem desvio no fuso do spot (Açores ≠ Lisboa); uma etiqueta com desvio fala
 * por si. `NaN` quando não há como resolver → comparação lexical antiga.
 */
function instanteSelecionadoMs(
  selectedIso: string | null | undefined,
  opts?: { ms?: number; lon?: number },
): number {
  if (opts && Number.isFinite(opts.ms)) return opts.ms as number;
  const s = String(selectedIso ?? '').trim();
  if (!s) return NaN;
  if (opts && Number.isFinite(opts.lon) && !hasOffset(s)) {
    const ms = instanteDaParede(s, fusoDoSpot(opts.lon as number));
    if (Number.isFinite(ms)) return ms;
  }
  return seriesTimeMs(s);
}

/** Índice do passo de 3 h que contém a hora escolhida: o último passo ≤ hora.
 *  Por INSTANTE quando há como resolver (#456 — a hora dos Açores não é a de
 *  Lisboa e o 01:00 repetido do fim do DST são dois instantes); comparação
 *  lexical como antes quando não. Fora da janela do ficheiro → clamp ao
 *  primeiro/último passo (o rótulo «±3 h» da UI cobre a aproximação). -1
 *  quando o ficheiro não tem passos. */
export function pickMapHourStep(
  times: string[],
  selectedIso: string | null | undefined,
  opts?: { ms?: number; lon?: number },
): number {
  if (!times.length) return -1;
  const target = instanteSelecionadoMs(selectedIso, opts);
  if (!Number.isFinite(target)) {
    if (!selectedIso) return 0;
    const key = hourKeyFromOpenMeteo(selectedIso);
    let legacy = 0;
    for (let i = 0; i < times.length; i++) {
      if (hourKeyFromOpenMeteo(times[i]) <= key) legacy = i;
      else break;
    }
    return legacy;
  }
  let best = 0;
  for (let i = 0; i < times.length; i++) {
    const ti = seriesTimeMs(times[i]);
    if (!Number.isFinite(ti)) continue;
    if (ti <= target) best = i;
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
 *  modalidade não se pratica lá, o ficheiro não tem a série ou o motor v6 não
 *  dá nota nessa hora (noite / sem dados, #218) — «—» na UI. */
export function nearbySpotScore(
  file: MapHoursFile | null | undefined,
  entry: NearbySpotEntry,
  sport: SportType,
  step: number,
): number | null {
  const sports = entry.spot.compatibleSports;
  if (sports && sports.length > 0 && !sports.includes(sport)) return null;
  const n = scoreAtHour(file, entry.spot.id, sport, step);
  return n ?? null;
}

/** Estado da nota do vizinho no «Perto daqui»: número, noite ou sem nota. */
export type NearbySpotHour = number | 'noite' | null;

/**
 * Como `nearbySpotScore`, mas separa a noite (#218 D3): `'noite'` quando a
 * modalidade se pratica lá, a série existe e o motor v6 não dá nota nessa
 * hora (`scoreAtHour` → `null`) — chip v6 `noite`; `null` quando não se
 * pratica ou não há série — «–».
 */
export function nearbySpotHour(
  file: MapHoursFile | null | undefined,
  entry: NearbySpotEntry,
  sport: SportType,
  step: number,
): NearbySpotHour {
  const sports = entry.spot.compatibleSports;
  if (sports && sports.length > 0 && !sports.includes(sport)) return null;
  const n = scoreAtHour(file, entry.spot.id, sport, step);
  if (n === null) return 'noite';
  return n ?? null;
}
