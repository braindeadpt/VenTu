/**
 * storm-state por spot (B1 do docs/STORM-STUDY.md) — `public/data/storm-state.json`
 * gerado por `scripts/build-storm-state.js` a partir dos frames do radar IPMA
 * (eco mais próximo, intensidade, deslocamento do centróide) + warnings + cones.
 *
 * O estado de radar é observação, não previsão — «a aproximar-se» é o
 * deslocamento medido entre o último frame e o de ~15-20 min antes.
 */

import { getAssetPath } from '@/lib/paths';

export interface StormRadarState {
  state: 'clean' | 'near' | 'over';
  /** km ao eco mais próximo (janela ≤60 km) — null quando limpo. */
  distKm: number | null;
  /** Bearing spot → centróide dos ecos (de onde vem a chuva). */
  dirDeg: number | null;
  intensity: 'light' | 'moderate' | 'heavy' | null;
  approach: { state: 'approaching' | 'receding'; deg: number | null; kmh: number | null } | null;
}

export interface StormSpotState {
  radar: StormRadarState | null;
  warnLevel: 'yellow' | 'orange' | 'red' | null;
  inStormCone: boolean;
}

export interface StormStateFile {
  source: 'ventu-storm-state';
  fetchedAt: string;
  radar: { frameTime: string; compareFrameTime: string | null };
  spots: Record<string, StormSpotState>;
}

let cache: StormStateFile | null | undefined;
let inflight: Promise<StormStateFile | null> | null = null;

export async function loadStormState(
  fetchImpl: typeof fetch = fetch,
): Promise<StormStateFile | null> {
  if (cache !== undefined) return cache;
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = await fetchImpl(getAssetPath('/data/storm-state.json'));
      if (!res.ok) return null;
      const data = (await res.json()) as StormStateFile;
      if (data?.source !== 'ventu-storm-state' || typeof data?.spots !== 'object') return null;
      return data;
    } catch {
      return null;
    }
  })().finally(() => {
    inflight = null;
  });

  inflight = promise;
  cache = await promise;
  return cache;
}

export function stormStateForSpot(
  file: StormStateFile | null | undefined,
  spotId: string,
): StormSpotState | null {
  return file?.spots?.[spotId] ?? null;
}

/** Estado de radar só é honesto ~75 min após o frame (pipeline corre ~2×/h). */
export const STORM_RADAR_MAX_AGE_MS = 75 * 60 * 1000;

/** Offset de Europe/Lisbon (ms) para um instante UTC — verão +1h, inverno 0. */
function lisbonOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - utcMs;
}

/**
 * O `frameTime` do manifest radar IPMA é wall-clock de Lisboa com sufixo
 * "Z" falso (`radarFrames` documenta a convenção). `Date.parse` lê-o como
 * UTC — para a frescura isso adianta o frame ~1h no verão. Converte-se
 * para o instante UTC real: uma iteração chega, a segunda apanha o
 * limiar de mudança de hora (DST).
 */
export function lisbonFakeZToMs(iso: string | null | undefined): number {
  const naive = Date.parse(iso ?? '');
  if (!Number.isFinite(naive)) return NaN;
  const t = naive - lisbonOffsetMs(naive);
  return naive - lisbonOffsetMs(t);
}

export function radarStateFresh(file: StormStateFile | null | undefined, nowMs = Date.now()): boolean {
  const t = lisbonFakeZToMs(file?.radar?.frameTime);
  return Number.isFinite(t) && nowMs - t < STORM_RADAR_MAX_AGE_MS;
}
