/**
 * Dados do lab «Mar vivo» preparados no build (só servidor — usa `fs`).
 *
 * - Sementes: spots do continente (lat/lon) a partir de `src/lib/spots.ts`.
 * - Snapshot de ondulação: direcção e período da ondulação primária por spot,
 *   de 3 em 3 h, lidos de `public/data/forecasts.json`. `map-hours.json` (que o
 *   cliente lê em runtime) ainda não tem estes campos; isto mantém o payload
 *   pequeno (~20 KB) em vez de mandar o forecasts.json de 11 MB ao browser.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spots } from '@/lib/spots';
import { lisbonHourKeyFromDate } from '@/lib/openMeteoTime';
import type { Spot } from '@/types';
import type { SeedSpot, SwellSnapshot } from './types';

/** Portugal continental (exclui Açores e Madeira). */
function isMainland(s: Spot): boolean {
  return s.lat >= 36.8 && s.lat <= 42.3 && s.lon >= -9.7 && s.lon <= -6.0;
}

function isOpenSea(s: Spot): boolean {
  if (s.type === 'wakeboard') return false;
  if (s.compatibleSports?.length === 1 && s.compatibleSports[0] === 'wakeboard') return false;
  return true;
}

export function buildSeeds(locale: string): SeedSpot[] {
  return spots.filter(isMainland).map((s) => ({
    id: s.id,
    name: locale === 'pt' ? s.name : s.nameEn || s.name,
    lat: Math.round(s.lat * 1000) / 1000,
    lon: Math.round(s.lon * 1000) / 1000,
    sea: isOpenSea(s),
  }));
}

let snapshotCache: SwellSnapshot | null | undefined;

export function buildSwellSnapshot(now = new Date()): SwellSnapshot | null {
  if (snapshotCache !== undefined) return snapshotCache;
  snapshotCache = null;
  try {
    const file = join(process.cwd(), 'public', 'data', 'forecasts.json');
    if (!existsSync(file)) return null;
    const forecasts = JSON.parse(readFileSync(file, 'utf-8')) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    // Janela: 6 h antes do build até +60 h (o map-hours cobre ~45 h a partir de «agora»).
    const nowKey = lisbonHourKeyFromDate(now);
    const toH = (k: string) => Date.parse(`${k}:00:00Z`) / 3600000;
    const h0 = toH(nowKey) - 6;
    const h1 = toH(nowKey) + 60;

    let times: string[] | null = null;
    const dir: Record<string, number[]> = {};
    const per: Record<string, number[]> = {};
    for (const s of spots) {
      if (!isMainland(s) || !isOpenSea(s)) continue;
      const series = forecasts[s.id] ?? (s.conditionsSource ? forecasts[s.conditionsSource] : undefined);
      if (!Array.isArray(series) || !series.length) continue;
      const rows = series.filter((r) => {
        const key = String(r.time ?? '').slice(0, 13);
        const h = toH(key);
        return Number(key.slice(11, 13)) % 3 === 0 && h >= h0 && h <= h1;
      });
      if (!rows.length) continue;
      const keys = rows.map((r) => String(r.time).slice(0, 13));
      if (!times) times = keys;
      if (keys.length !== times.length || keys[0] !== times[0]) continue;
      const d = rows.map((r) => Number(r.swellDirection ?? r.waveDirection));
      const p = rows.map((r) => Number(r.swellPeriod ?? r.wavePeriod));
      if (d.some((x) => !Number.isFinite(x)) || p.some((x) => !Number.isFinite(x))) continue;
      dir[s.id] = d.map((x) => Math.round(x));
      per[s.id] = p.map((x) => Math.round(x * 10) / 10);
    }
    if (!times || !Object.keys(dir).length) return null;
    snapshotCache = { times, dir, per };
  } catch {
    snapshotCache = null;
  }
  return snapshotCache;
}
