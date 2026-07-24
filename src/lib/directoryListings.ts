import type { SupabaseClient } from '@supabase/supabase-js';
import type { DirectoryEntry, DirectoryKind, DirectorySport } from '@/types/directory';

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
  created_at: string;
};

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

/** Seed JSON first; live submissions override same id or prepend. */
export function mergeDirectoryEntries(
  seed: DirectoryEntry[],
  live: DirectoryEntry[],
): DirectoryEntry[] {
  const byId = new Map<string, DirectoryEntry>();
  for (const e of seed) byId.set(e.id, e);
  for (const e of live) byId.set(e.id, e);

  // Also prefer live over seed when same slug
  const bySlug = new Map<string, DirectoryEntry>();
  for (const e of byId.values()) {
    const prev = bySlug.get(e.slug);
    if (!prev || e.source === 'submitted' || e.verified) {
      bySlug.set(e.slug, e);
    }
  }

  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}
