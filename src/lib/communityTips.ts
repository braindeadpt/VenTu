import type { Spot } from '@/types';

export interface CommunityTipEntry {
  bestTide?: string;
  bestTideEn?: string;
  parking?: string;
  parkingEn?: string;
  food?: string;
  foodEn?: string;
  localRule?: string;
  localRuleEn?: string;
  contributor?: string;
}

let cache: Record<string, CommunityTipEntry> | null = null;

export async function loadCommunityTips(): Promise<Record<string, CommunityTipEntry>> {
  if (cache) return cache;
  try {
    const res = await fetch('/data/community-tips.json');
    if (!res.ok) return {};
    cache = await res.json();
    return cache ?? {};
  } catch {
    return {};
  }
}

/** Merge inline spot tips, spotTips.ts data, and community overlay. */
export function mergeLocalTips(
  spot: Spot,
  fromSpotTips?: {
    bestTide: string;
    bestTideEn: string;
    parking: string;
    parkingEn: string;
    food: string;
    foodEn: string;
    localRule?: string;
    localRuleEn?: string;
  },
  community?: CommunityTipEntry,
) {
  const base = spot.localTips ?? {};
  const merged = {
    bestTide: community?.bestTide ?? fromSpotTips?.bestTide ?? base.bestTide,
    bestTideEn: community?.bestTideEn ?? fromSpotTips?.bestTideEn ?? base.bestTideEn,
    parking: community?.parking ?? fromSpotTips?.parking ?? base.parking,
    parkingEn: community?.parkingEn ?? fromSpotTips?.parkingEn ?? base.parkingEn,
    food: community?.food ?? fromSpotTips?.food ?? base.food,
    foodEn: community?.foodEn ?? fromSpotTips?.foodEn ?? base.foodEn,
    localRule: community?.localRule ?? fromSpotTips?.localRule ?? base.localRule,
    localRuleEn: community?.localRuleEn ?? fromSpotTips?.localRuleEn ?? base.localRuleEn,
    contributor: community?.contributor,
  };

  const hasContent = Object.values(merged).some((v) => typeof v === 'string' && v.length > 0);
  return hasContent ? merged : null;
}
