/**
 * Estado «noite» do /mapa (#218 D3, opção 1 aprovada pelo Pedro).
 *
 * Numa frame das 48 h em que o motor v6 não dá nota (`scoreAtHour` → `null`:
 * noite / sem dados) para a modalidade activa, o marcador, a linha da lista,
 * o cluster e a pré-visualização mostram «noite» — sem número — no fill da
 * banda v6 `noite` (#56677B, o mesmo da régua do spot). Vale para todas as
 * modalidades do v6 — surf, kitesurf, windsurf, bodyboard, foil, big-wave — e
 * para «Todas» (`best`, quando as v6 estão todas de noite; PR 6, decisão do
 * Pedro 27/10). SUP e wakeboard (motor antigo) nunca mostram noite.
 *
 * Módulo leve de propósito (só tokens + o dicionário mapUiMarkers, que o
 * /mapa já carrega): nada de imports pesados no bundle do mapa.
 */
import type { GridSportFilter } from '@/lib/sportRatings';
import { V6_BANDAS } from '@/lib/v6Tokens';
import { mapUiMarkers } from '@/lib/translations/mapUi/markers';

/** Fill da banda v6 `noite` — o mesmo da régua do spot e dos chips v6. */
export const MAP_NIGHT_FILL = V6_BANDAS.noite.c;
/** Texto sobre o fill `noite` (branco — 5,9:1). */
export const MAP_NIGHT_INK = V6_BANDAS.noite.t;

/** Lua do v6 (`components/v6/Nota.tsx`) — viewBox 24×24. */
export const MAP_NIGHT_MOON_PATH = 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z';

/** Modalidades do filtro do mapa em que o estado «noite» se aplica. */
export function mapNightAppliesTo(sport: GridSportFilter): boolean {
  return sport !== 'sup' && sport !== 'wakeboard';
}

export interface MapNightCopy {
  /** Rótulo visível («noite» / «night»). */
  label: string;
  /** Nome acessível («noite, sem nota» / «night, no score»). */
  aria: string;
}

type MarkersLocale = keyof typeof mapUiMarkers;

/** Cópia localizada do estado noite (chaves `mapUiMarkers.night*`). */
export function mapNightCopy(locale: string): MapNightCopy {
  const l = (locale || 'pt').toLowerCase().slice(0, 2);
  const dict = mapUiMarkers[(l in mapUiMarkers ? l : 'en') as MarkersLocale];
  return { label: dict.night, aria: dict.nightAria };
}
