import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { DirectoryEntry, DirectoryFile, DirectoryKind, DirectorySport, DirectoryTier } from '@/types/directory';

const DIRECTORY_PATH = path.join(process.cwd(), 'public', 'data', 'directory.json');

export const DIRECTORY_KIND_LABELS: Record<
  DirectoryKind,
  { pt: string; en: string }
> = {
  surf_school: { pt: 'Escola de surf', en: 'Surf school' },
  kite_center: { pt: 'Centro de kite', en: 'Kite center' },
  windsurf: { pt: 'Windsurf', en: 'Windsurf' },
  shop: { pt: 'Loja', en: 'Shop' },
  club: { pt: 'Clube', en: 'Club' },
  rental: { pt: 'Aluguer', en: 'Rental' },
  other: { pt: 'Outro', en: 'Other' },
};

export const DIRECTORY_TIER_LABELS: Record<DirectoryTier, { pt: string; en: string }> = {
  free: { pt: 'Grátis', en: 'Free' },
  featured: { pt: 'Destaque', en: 'Featured' },
  pro: { pt: 'Pro', en: 'Pro' },
};

export function tierRank(tier?: DirectoryTier): number {
  if (tier === 'pro') return 3;
  if (tier === 'featured') return 2;
  return 1;
}

export function sortDirectoryEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    const tr = tierRank(b.tier) - tierRank(a.tier);
    if (tr !== 0) return tr;
    const vr = Number(!!b.verified) - Number(!!a.verified);
    if (vr !== 0) return vr;
    return a.name.localeCompare(b.name, 'pt');
  });
}

export function loadDirectoryFile(): DirectoryFile | null {
  if (!existsSync(DIRECTORY_PATH)) return null;
  try {
    return JSON.parse(readFileSync(DIRECTORY_PATH, 'utf-8')) as DirectoryFile;
  } catch {
    return null;
  }
}

export function loadDirectoryEntries(): DirectoryEntry[] {
  return loadDirectoryFile()?.entries ?? [];
}

/** Haversine distance in km. */
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function entriesNearSpot(
  entries: DirectoryEntry[],
  spotId: string,
  spotLat: number,
  spotLon: number,
  opts?: { maxKm?: number; limit?: number },
): Array<DirectoryEntry & { distanceKm: number }> {
  const maxKm = opts?.maxKm ?? 12;
  const limit = opts?.limit ?? 8;

  const scored = entries
    .map((e) => {
      const byId = e.spotIds.includes(spotId);
      const d = distanceKm(spotLat, spotLon, e.lat, e.lon);
      return { ...e, distanceKm: d, _rank: byId ? d : d + 0.001 };
    })
    .filter((e) => e.distanceKm <= maxKm || e.spotIds.includes(spotId))
    .sort((a, b) => a._rank - b._rank)
    .slice(0, limit);

  return scored.map(({ _rank: _, ...rest }) => rest);
}

export function kindLabel(kind: DirectoryKind, locale: string): string {
  const row = DIRECTORY_KIND_LABELS[kind] ?? DIRECTORY_KIND_LABELS.other;
  return locale === 'en' ? row.en : row.pt;
}

export function sportLabel(sport: DirectorySport, locale: string): string {
  const map: Record<DirectorySport, { pt: string; en: string }> = {
    surf: { pt: 'Surf', en: 'Surf' },
    kitesurf: { pt: 'Kitesurf', en: 'Kitesurf' },
    windsurf: { pt: 'Windsurf', en: 'Windsurf' },
    foil: { pt: 'Foil', en: 'Foil' },
    sup: { pt: 'SUP', en: 'SUP' },
    bodyboard: { pt: 'Bodyboard', en: 'Bodyboard' },
    wakeboard: { pt: 'Wakeboard', en: 'Wakeboard' },
  };
  const row = map[sport];
  return locale === 'en' ? row.en : row.pt;
}
