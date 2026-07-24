import type { SupabaseClient } from '@supabase/supabase-js';
import type { DirectoryEntry, DirectoryKind, DirectorySport, DirectoryTier } from '@/types/directory';
import { sortDirectoryEntries } from '@/lib/directory';

export type DirectoryListingRow = {
  id: string;
  slug: string;
  name: string;
  kind: DirectoryKind;
  sports: string[] | null;
  lat: number;
  lon: number;
  region: string | null;
  region_en: string | null;
  spot_ids: string[] | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: string;
  owner_user_id: string | null;
  verified: boolean;
  verified_at: string | null;
  tier?: string | null;
  created_at: string;
};

export type DirectoryProfileRow = {
  entry_id: string;
  tier: string;
  verified: boolean;
};

function parseTier(raw: string | null | undefined): DirectoryTier {
  if (raw === 'featured' || raw === 'pro') return raw;
  return 'free';
}

export function listingToEntry(row: DirectoryListingRow): DirectoryEntry {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    sports: (row.sports || []) as DirectorySport[],
    lat: row.lat,
    lon: row.lon,
    region: row.region || undefined,
    regionEn: row.region_en || undefined,
    spotIds: row.spot_ids || [],
    website: row.website || undefined,
    phone: row.phone || undefined,
    email: row.email || undefined,
    address: row.address || undefined,
    source: row.source === 'submitted' ? 'submitted' : 'claimed',
    verified: row.verified,
    tier: parseTier(row.tier),
  };
}

export async function fetchDirectoryListings(
  sb: SupabaseClient,
): Promise<DirectoryEntry[]> {
  const { data, error } = await sb
    .from('directory_listings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (/relation .*directory_listings.* does not exist|Could not find the table/i.test(error.message)) {
      return [];
    }
    throw error;
  }
  return ((data as DirectoryListingRow[]) || []).map(listingToEntry);
}

/** Premium overrides for seed entry ids (aesp-*, osm-*, …). */
export async function fetchDirectoryProfiles(
  sb: SupabaseClient,
): Promise<Map<string, { tier: DirectoryTier; verified: boolean }>> {
  const map = new Map<string, { tier: DirectoryTier; verified: boolean }>();
  const { data, error } = await sb.from('directory_profiles').select('entry_id, tier, verified');
  if (error) {
    if (/relation .*directory_profiles.* does not exist|Could not find the table/i.test(error.message)) {
      return map;
    }
    throw error;
  }
  for (const row of (data as DirectoryProfileRow[]) || []) {
    map.set(row.entry_id, {
      tier: parseTier(row.tier),
      verified: !!row.verified,
    });
  }
  return map;
}

export function applyDirectoryProfiles(
  entries: DirectoryEntry[],
  profiles: Map<string, { tier: DirectoryTier; verified: boolean }>,
): DirectoryEntry[] {
  if (profiles.size === 0) return entries;
  return entries.map((e) => {
    const p = profiles.get(e.id);
    if (!p) return { ...e, tier: e.tier ?? 'free' };
    return {
      ...e,
      tier: p.tier,
      verified: p.verified || e.verified,
    };
  });
}

export type SubmitListingInput = {
  name: string;
  kind: DirectoryKind;
  sports: DirectorySport[];
  lat: number;
  lon: number;
  region?: string;
  regionEn?: string;
  spotIds: string[];
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  userId: string;
};

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export async function submitDirectoryListing(
  sb: SupabaseClient,
  input: SubmitListingInput,
): Promise<{ ok: true; entry: DirectoryEntry } | { ok: false; error: string }> {
  const base = slugify(input.name) || 'escola';
  const id = `sub-${crypto.randomUUID()}`;
  const slug = `${base}-${id.slice(4, 12)}`;

  const row = {
    id,
    slug,
    name: input.name.trim().slice(0, 120),
    kind: input.kind,
    sports: input.sports,
    lat: input.lat,
    lon: input.lon,
    region: input.region || null,
    region_en: input.regionEn || null,
    spot_ids: input.spotIds,
    website: input.website?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    source: 'submitted',
    owner_user_id: input.userId,
    verified: false,
    tier: 'free',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from('directory_listings').insert(row).select('*').single();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, entry: listingToEntry(data as DirectoryListingRow) };
}

export async function verifyDirectoryListing(
  sb: SupabaseClient,
  listingId: string,
  adminUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb
    .from('directory_listings')
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: adminUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unverifyDirectoryListing(
  sb: SupabaseClient,
  listingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb
    .from('directory_listings')
    .update({
      verified: false,
      verified_at: null,
      verified_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setDirectoryListingTier(
  sb: SupabaseClient,
  listingId: string,
  tier: DirectoryTier,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb
    .from('directory_listings')
    .update({
      tier,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Upsert tier/verified for any entry id (seed or listing). */
export async function upsertDirectoryProfileTier(
  sb: SupabaseClient,
  entryId: string,
  tier: DirectoryTier,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.from('directory_profiles').upsert(
    {
      entry_id: entryId,
      tier,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'entry_id' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Seed JSON first; live submissions override; then sort by tier. */
export function mergeDirectoryEntries(
  seed: DirectoryEntry[],
  live: DirectoryEntry[],
): DirectoryEntry[] {
  const byId = new Map<string, DirectoryEntry>();
  for (const e of seed) byId.set(e.id, { ...e, tier: e.tier ?? 'free' });
  for (const e of live) byId.set(e.id, { ...e, tier: e.tier ?? 'free' });

  const bySlug = new Map<string, DirectoryEntry>();
  for (const e of byId.values()) {
    const prev = bySlug.get(e.slug);
    if (!prev || e.source === 'submitted' || e.verified || tierBeats(e, prev)) {
      bySlug.set(e.slug, e);
    }
  }

  return sortDirectoryEntries([...bySlug.values()]);
}

function tierBeats(a: DirectoryEntry, b: DirectoryEntry): boolean {
  const rank = (t?: DirectoryTier) => (t === 'pro' ? 3 : t === 'featured' ? 2 : 1);
  return rank(a.tier) > rank(b.tier);
}

export function buildEmbedSnippet(opts: {
  spotId: string;
  locale: string;
  schoolName: string;
  siteOrigin?: string;
}): string {
  const origin = opts.siteOrigin || 'https://ventu.surf';
  const school = encodeURIComponent(opts.schoolName);
  const src = `${origin}/embed/spot/${opts.spotId}/?school=${school}&lang=${opts.locale}`;
  return `<iframe src="${src}" title="VenTu — ${opts.schoolName}" width="320" height="200" style="border:0;border-radius:12px;max-width:100%" loading="lazy"></iframe>`;
}
