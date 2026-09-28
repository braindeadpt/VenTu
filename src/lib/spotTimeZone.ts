import type { Spot } from '@/types';
import { spots } from '@/lib/spots';

/**
 * Fuso local de cada spot — a hora que o site mostra é SEMPRE a local do
 * spot (regra do produto), nunca UTC nem a do browser.
 *
 * Todos os timestamps naive dos ficheiros (`forecasts.json`,
 * `forecasts/{id}.json`, séries de maré, `map-hours` tides) são wall-time
 * NESTE fuso: o pipeline pede ao Open-Meteo `timezone=<fuso do spot>`
 * (scripts/lib/updateConditionsFetch.js). Açores = Atlantic/Azores (UTC−1
 * todo o ano; DST nas mesmas datas de Lisboa), Madeira e continente =
 * Europe/Lisbon.
 *
 * A fronteira é por longitude: Açores ≤ −25.07 (Santa Maria), Madeira ≥
 * −17.3, continente ≥ −9.5. O corte −24 tem ~7° de margem dos dois lados.
 */
export type SpotTimeZone = 'Europe/Lisbon' | 'Atlantic/Azores';

export const LISBON_TZ: SpotTimeZone = 'Europe/Lisbon';
export const AZORES_TZ: SpotTimeZone = 'Atlantic/Azores';

const AZORES_LON_CUTOFF = -24;

export function spotTimeZone(
  spot: Pick<Spot, 'lon'> | number | null | undefined,
): SpotTimeZone {
  const lon = typeof spot === 'number' ? spot : spot?.lon;
  return typeof lon === 'number' && lon < AZORES_LON_CUTOFF
    ? AZORES_TZ
    : LISBON_TZ;
}

const byId = new Map<string, SpotTimeZone>();
for (const s of spots) byId.set(s.id, spotTimeZone(s));

/** Fuso do spot pelo id (componentes que só recebem `spotId`). */
export function spotTimeZoneById(id: string | null | undefined): SpotTimeZone {
  return (id && byId.get(id)) || LISBON_TZ;
}
