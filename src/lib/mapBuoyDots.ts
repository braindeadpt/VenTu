/**
 * Map buoy dots — IH + WMO observation points, distinct from spot pins.
 *
 * Pure extract so freshness / dedup can be unit-tested without Leaflet.
 * Pulse (CSS) is only for readings inside the same gates as the health
 * banner: 3 h IH, 6 h WMO. Inactive stations and WMO clones of an IH
 * station are skipped so the pin is never duplicated.
 */
import {
  BUOY_READING_MAX_AGE_HOURS,
  WMO_READING_MAX_AGE_HOURS,
} from '@/lib/buoyLayerHealth';
import { getAssetPath } from '@/lib/paths';

export const MAP_BUOYS_ENABLE_EVENT = 'ventu:map-buoys-enable';
export const MAP_BUOYS_PANE = 'buoys';
/** Leaflet overlay pane sits at 400; spot markers at 600. Above pins so the small ring is clickable. */
export const MAP_BUOYS_PANE_Z = '650';
/** Skip a WMO buoy this close to an IH station (metres) even without wmoId. */
export const WMO_IH_DEDUP_KM = 1.5;

export type MapBuoySource = 'ih' | 'wmo';

export interface MapBuoyDot {
  id: string;
  name: string;
  lat: number;
  lon: number;
  hs: number | null;
  observedAt: string | null;
  fresh: boolean;
  source: MapBuoySource;
}

export interface MapBuoyPopupLabels {
  hs: string;
  stale: string;
  sourceIh: string;
  sourceWmo: string;
  noHs: string;
}

export interface MapBuoyIhStation {
  idEst?: string | number;
  name?: string;
  area?: string;
  lat?: number;
  lon?: number;
  status?: string;
  wmoId?: string | number;
  latest?: { date?: string; hm0?: number };
}

export interface MapBuoyWmoEntry {
  code?: string;
  name?: string;
  lat?: number;
  lon?: number;
  latest?: { date?: string; hs?: number };
}

export interface MapBuoyIhFile {
  stations?: Record<string, MapBuoyIhStation>;
}

export interface MapBuoyWmoFile {
  buoys?: Record<string, MapBuoyWmoEntry>;
}

export function dispatchEnableMapBuoys(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MAP_BUOYS_ENABLE_EVENT));
}

function isoAgeHours(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

export function isInactiveBuoyStatus(status?: string): boolean {
  return status === 'inactive' || status === 'inativa';
}

export function isFreshBuoyReading(
  iso: string | undefined,
  maxAgeHours: number,
  nowMs: number,
): boolean {
  const age = isoAgeHours(iso, nowMs);
  return age !== null && age >= 0 && age <= maxAgeHours;
}

function finiteCoord(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la === 0 && lo === 0) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lon: lo };
}

function finiteHs(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatBuoyClock(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return null;
  const hour = new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(t);
  return `${hour}h`;
}

export function buoyPopupHtml(dot: MapBuoyDot, labels: MapBuoyPopupLabels): string {
  const hs =
    dot.hs != null
      ? `<span class="ventu-buoy-popup-hs">${escapeHtml(dot.hs.toFixed(1))} m</span>`
      : escapeHtml(labels.noHs);
  const clock = formatBuoyClock(dot.observedAt);
  const source = dot.source === 'ih' ? labels.sourceIh : labels.sourceWmo;
  const meta = [clock, dot.fresh ? null : labels.stale, source].filter(Boolean).join(' · ');
  return `<div class="ventu-buoy-popup-body">
    <p class="ventu-buoy-popup-name">${escapeHtml(dot.name)}</p>
    <p class="ventu-buoy-popup-row">${escapeHtml(labels.hs)} ${hs}</p>
    <p class="ventu-buoy-popup-meta">${escapeHtml(meta)}</p>
  </div>`;
}

export function buoyDotHtml(dot: MapBuoyDot): string {
  const hsAttr = dot.hs != null ? dot.hs.toFixed(1) : '';
  const hsLabel =
    dot.hs != null ? `<span class="ventu-buoy-hs">${escapeHtml(dot.hs.toFixed(1))}</span>` : '';
  const label = [dot.name, dot.hs != null ? `Hs ${dot.hs.toFixed(1)} m` : '']
    .filter(Boolean)
    .join(', ');
  return `<div class="ventu-buoy-dot" data-buoy-dot data-buoy-id="${escapeHtml(dot.id)}" data-buoy-fresh="${dot.fresh ? 'true' : 'false'}" data-buoy-hs="${escapeHtml(hsAttr)}" data-buoy-source="${dot.source}" role="img" aria-label="${escapeHtml(label)}"><span class="ventu-buoy-ring" aria-hidden="true">${hsLabel}</span></div>`;
}

/**
 * IH first, then WMO. Skip inactive IH, missing coords/Hs, and WMO that
 * clone an IH station (wmoId or ~1.5 km).
 */
export function collectMapBuoyDots(
  ih: MapBuoyIhFile | null | undefined,
  wmo: MapBuoyWmoFile | null | undefined,
  nowMs = Date.now(),
): MapBuoyDot[] {
  const dots: MapBuoyDot[] = [];
  const ihWmoIds = new Set<string>();

  for (const [key, st] of Object.entries(ih?.stations ?? {})) {
    if (!st || isInactiveBuoyStatus(st.status)) continue;
    const coord = finiteCoord(st.lat, st.lon);
    const hs = finiteHs(st.latest?.hm0);
    if (!coord || hs == null) continue;
    const observedAt = st.latest?.date ?? null;
    const id = `ih-${st.idEst ?? key}`;
    if (st.wmoId != null && String(st.wmoId) !== '') {
      ihWmoIds.add(String(st.wmoId));
    }
    dots.push({
      id,
      name: st.area?.trim() || st.name?.trim() || `Boia ${id}`,
      lat: coord.lat,
      lon: coord.lon,
      hs,
      observedAt,
      fresh: isFreshBuoyReading(observedAt ?? undefined, BUOY_READING_MAX_AGE_HOURS, nowMs),
      source: 'ih',
    });
  }

  for (const [key, buoy] of Object.entries(wmo?.buoys ?? {})) {
    if (!buoy) continue;
    const code = String(buoy.code ?? key);
    if (ihWmoIds.has(code)) continue;
    const coord = finiteCoord(buoy.lat, buoy.lon);
    const hs = finiteHs(buoy.latest?.hs);
    if (!coord || hs == null) continue;
    const nearIh = dots.some(
      (d) =>
        d.source === 'ih' &&
        haversineKm(d.lat, d.lon, coord.lat, coord.lon) < WMO_IH_DEDUP_KM,
    );
    if (nearIh) continue;
    const observedAt = buoy.latest?.date ?? null;
    dots.push({
      id: `wmo-${code}`,
      name: buoy.name?.trim() || `WMO ${code}`,
      lat: coord.lat,
      lon: coord.lon,
      hs,
      observedAt,
      fresh: isFreshBuoyReading(observedAt ?? undefined, WMO_READING_MAX_AGE_HOURS, nowMs),
      source: 'wmo',
    });
  }

  return dots;
}

export async function fetchMapBuoyDots(
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<MapBuoyDot[]> {
  const [ih, wmo] = await Promise.all([
    fetchImpl(getAssetPath('/data/ih-buoys.json'))
      .then(async (res) => (res.ok ? ((await res.json()) as MapBuoyIhFile) : null))
      .catch(() => null),
    fetchImpl(getAssetPath('/data/wmo-buoys.json'))
      .then(async (res) => (res.ok ? ((await res.json()) as MapBuoyWmoFile) : null))
      .catch(() => null),
  ]);
  return collectMapBuoyDots(ih, wmo, nowMs);
}
