import type { BestWindowToday, UpcomingWindow } from '@/lib/bestWindowToday';
import { getScoreForFilter, type HomepageSpotData } from '@/lib/homepageSport';
import { MAP_AREA_BOUNDS, type MapAreaBounds, type MapAreaKey } from '@/lib/mapLayerBus';
import { getCompatibleSports, type GridSportFilter, type SportType } from '@/lib/sportRatings';

/**
 * Banner «Melhor janela» do hero da home.
 *
 * Antes: pegava no spot com melhor score ACTUAL do desporto (em qualquer sítio)
 * e mostrava a janela desse spot. Dois bugs da auditoria de 2026-10-07:
 *  - promovia Praia da Vitória (Açores) com o mapa enquadrado no continente;
 *  - desaparecia com Kitesurf, porque o spot de topo agora não tinha janela
 *    heurística de kite (resolveBestWindowForSport → null).
 *
 * Agora: escolhe a MELHOR JANELA entre os spots da área que o mapa do hero
 * está a mostrar (continente por defeito; Açores/Madeira quando o mapa é
 * reenquadrado via `ventu:map-fit-area`), e só recorre a outras áreas se não
 * houver nenhuma janela na área visível. Para cada spot usa a janela de hoje
 * do desporto (`bestWindowsBySport`) e, na falta dela, a janela canónica das
 * próximas 24 h (`upcomingWindowsBySport`, a mesma de «Próximas janelas»).
 */

export interface HeroBestWindowPick {
  data: HomepageSpotData;
  window: BestWindowToday;
  /** true quando o spot está dentro da área que o mapa do hero mostra. */
  inArea: boolean;
}

const DAY_MS = 24 * 3_600_000;
/** Folga (graus) à volta da área — spots de costa no limite contam. */
const AREA_MARGIN_DEG = 0.3;

export function isInMapArea(
  lat: number,
  lon: number,
  bounds: MapAreaBounds,
  margin = AREA_MARGIN_DEG,
): boolean {
  return (
    lat >= bounds.south - margin &&
    lat <= bounds.north + margin &&
    lon >= bounds.west - margin &&
    lon <= bounds.east + margin
  );
}

function hourOf(iso: string): number {
  const n = Number(iso.slice(11, 13));
  return Number.isFinite(n) ? n : 0;
}

const lisbonDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Janela canónica (ISO, hora local do spot) → forma «hoje» do banner.
 * Só serve se ainda não acabou e começa HOJE (ou já está a decorrer) — o
 * banner diz «Melhor janela hoje», não pode anunciar uma janela de amanhã.
 */
function upcomingAsToday(
  w: UpcomingWindow | undefined,
  sport: SportType,
  nowMs: number,
): BestWindowToday | null {
  if (!w) return null;
  const start = new Date(w.startIso).getTime();
  const end = new Date(w.endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < nowMs || start - nowMs > DAY_MS) return null;
  const startsToday = w.startIso.slice(0, 10) === lisbonDayFmt.format(new Date(nowMs));
  if (!startsToday && start > nowMs) return null;
  return { start: hourOf(w.startIso), end: hourOf(w.endIso), score: w.score, sport };
}

function windowForSport(
  data: HomepageSpotData,
  sport: SportType,
  nowMs: number,
): BestWindowToday | null {
  const today = data.bestWindowsBySport?.[sport];
  if (today) return { ...today, sport };
  return upcomingAsToday(data.upcomingWindowsBySport?.[sport], sport, nowMs);
}

/** Melhor janela de um spot para o filtro activo (sem trocar de desporto). */
export function heroWindowForSpot(
  data: HomepageSpotData,
  filter: GridSportFilter,
  nowMs: number,
): BestWindowToday | null {
  if (filter === 'big-wave') {
    if (data.spot.type !== 'big-wave') return null;
    return windowForSport(data, 'surf', nowMs);
  }
  if (filter !== 'all') {
    if (!getCompatibleSports(data.spot).includes(filter)) return null;
    return windowForSport(data, filter, nowMs);
  }
  let best: BestWindowToday | null = data.bestWindowToday ?? null;
  for (const sport of getCompatibleSports(data.spot)) {
    const w = windowForSport(data, sport, nowMs);
    if (w && (!best || w.score > best.score)) best = w;
  }
  return best;
}

export function pickHeroBestWindow(
  spotsData: HomepageSpotData[],
  filter: GridSportFilter,
  area: MapAreaKey | null,
  nowMs: number,
): HeroBestWindowPick | null {
  const bounds = area ? MAP_AREA_BOUNDS[area] : null;
  let bestInArea: HeroBestWindowPick | null = null;
  let bestAnywhere: HeroBestWindowPick | null = null;

  const better = (a: HeroBestWindowPick, b: HeroBestWindowPick | null): boolean => {
    if (!b) return true;
    if (a.window.score !== b.window.score) return a.window.score > b.window.score;
    const byNow = getScoreForFilter(a.data, filter) - getScoreForFilter(b.data, filter);
    if (byNow !== 0) return byNow > 0;
    return a.data.spot.slug < b.data.spot.slug;
  };

  for (const data of spotsData) {
    const window = heroWindowForSpot(data, filter, nowMs);
    if (!window) continue;
    const inArea = bounds ? isInMapArea(data.spot.lat, data.spot.lon, bounds) : true;
    const pick: HeroBestWindowPick = { data, window, inArea };
    if (inArea && better(pick, bestInArea)) bestInArea = pick;
    if (better(pick, bestAnywhere)) bestAnywhere = pick;
  }

  return bestInArea ?? bestAnywhere;
}
