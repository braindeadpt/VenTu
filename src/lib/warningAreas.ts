/**
 * Áreas de aviso IPMA — geometria baked em public/geo/warning-areas.json
 * (B2 do docs/STORM-STUDY.md; bake: npm run warnings:areas).
 *
 * Continente = distrito (CAOP2025/DGT); Madeira = ilha (MCN/MCS/MRM juntos);
 * Açores = ilhas agrupadas nos 3 grupos IPMA (AOR/ACE/AOC). A camada pinta
 * só os grupos com avisos activos/futuros — `endTime` passado não pinta.
 */

import { getAssetPath } from '@/lib/paths';
import type { IpmaWarning, IpmaWarningLevel } from '@/lib/ipmaWarnings';

export const MAP_WARN_AREAS_LS_KEY = 'ventu.map-warn-areas';

/** Cor por nível — mesma família dos outros overlays (storms/coastal). */
export const WARN_AREA_COLORS: Record<IpmaWarningLevel, string> = {
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

/** `polys`: [polígono [anel [[lon,lat]]]] — anéis interiores = buracos. */
export interface WarningAreaGroup {
  label: string;
  codes: string[];
  polys: number[][][][];
}

export interface WarningAreasFile {
  source: string;
  bakedAt: string;
  groups: Record<string, WarningAreaGroup>;
}

export interface WarnAreaHit {
  group: WarningAreaGroup;
  maxLevel: IpmaWarningLevel;
  warnings: IpmaWarning[];
}

let cache: WarningAreasFile | null | undefined;

/** Loader best-effort — ficheiro ausente → null, nunca lança. */
export async function loadWarningAreas(): Promise<WarningAreasFile | null> {
  if (cache !== undefined) return cache;
  try {
    const res = await fetch(getAssetPath('/geo/warning-areas.json'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cache = (await res.json()) as WarningAreasFile;
  } catch {
    cache = null;
  }
  return cache;
}

/**
 * Grupos com avisos activos/futuros, ordenados por nível (red primeiro).
 * Aviso expirado (`endTime` no passado) não pinta — a camada nunca mostra
 * um aviso que já não está em vigor.
 */
export function activeWarnGroups(
  areas: WarningAreasFile | null | undefined,
  warnings: IpmaWarning[] | null | undefined,
  now = Date.now(),
): WarnAreaHit[] {
  if (!areas?.groups || !Array.isArray(warnings)) return [];
  const rank: Record<IpmaWarningLevel, number> = { red: 3, orange: 2, yellow: 1 };
  const hits: WarnAreaHit[] = [];
  for (const group of Object.values(areas.groups)) {
    const list = warnings.filter(
      (w) =>
        group.codes.includes(w.areaCode) &&
        (!w.endTime || Date.parse(w.endTime) > now),
    );
    if (list.length === 0) continue;
    const maxLevel = list.reduce<IpmaWarningLevel>(
      (best, w) => (rank[w.level] > rank[best] ? w.level : best),
      'yellow',
    );
    hits.push({ group, maxLevel, warnings: list });
  }
  return hits.sort((a, b) => rank[b.maxLevel] - rank[a.maxLevel]);
}
