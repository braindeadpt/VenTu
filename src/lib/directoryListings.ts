import type { SupabaseClient } from '@supabase/supabase-js';
import type { DirectoryEntry, DirectoryKind, DirectorySport, DirectoryTier } from '@/types/directory';
import { sortDirectoryEntries } from '@/lib/directoryClient';
import { safeExternalUrl } from '@/lib/safeUrl';
import { DIRECTORY_FIELD_LIMITS as L } from '@/lib/directoryFieldLimits';

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
  owner_user_id: string | null;
  display_name: string | null;
  bio: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  sports: string[] | null;
  spot_ids: string[] | null;
  tier: string;
  verified: boolean;
};

export type DirectoryProfileOverlay = {
  ownerUserId?: string;
  tier: DirectoryTier;
  verified: boolean;
  displayName?: string;
  bio?: string;
  website?: string;
  phone?: string;
  email?: string;
  sports?: DirectorySport[];
  spotIds?: string[];
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

function profileRowToOverlay(row: DirectoryProfileRow): DirectoryProfileOverlay {
  return {
    ownerUserId: row.owner_user_id || undefined,
    tier: parseTier(row.tier),
    verified: !!row.verified,
    displayName: row.display_name || undefined,
    bio: row.bio || undefined,
    website: row.website || undefined,
    phone: row.phone || undefined,
    email: row.email || undefined,
    sports: (row.sports || undefined) as DirectorySport[] | undefined,
    spotIds: row.spot_ids || undefined,
  };
}

/** Premium + owner overlays for seed entry ids (aesp-*, osm-*, …). */
export async function fetchDirectoryProfiles(
  sb: SupabaseClient,
): Promise<Map<string, DirectoryProfileOverlay>> {
  const map = new Map<string, DirectoryProfileOverlay>();
  const { data, error } = await sb.from('directory_profiles').select('*');
  if (error) {
    if (/relation .*directory_profiles.* does not exist|Could not find the table/i.test(error.message)) {
      return map;
    }
    throw error;
  }
  for (const row of (data as DirectoryProfileRow[]) || []) {
    map.set(row.entry_id, profileRowToOverlay(row));
  }
  return map;
}

export function applyDirectoryProfiles(
  entries: DirectoryEntry[],
  profiles: Map<string, DirectoryProfileOverlay>,
): DirectoryEntry[] {
  if (profiles.size === 0) return entries;
  return entries.map((e) => {
    const p = profiles.get(e.id);
    if (!p) return { ...e, tier: e.tier ?? 'free' };
    return {
      ...e,
      name: p.displayName || e.name,
      bio: p.bio ?? e.bio,
      website: p.website ?? e.website,
      phone: p.phone ?? e.phone,
      email: p.email ?? e.email,
      sports: p.sports && p.sports.length > 0 ? p.sports : e.sports,
      spotIds: p.spotIds && p.spotIds.length > 0 ? p.spotIds : e.spotIds,
      tier: p.tier,
      verified: p.verified || e.verified,
      source: p.verified ? 'claimed' : e.source,
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
    name: input.name.trim().slice(0, L.name),
    kind: input.kind,
    sports: input.sports,
    lat: input.lat,
    lon: input.lon,
    region: input.region || null,
    region_en: input.regionEn || null,
    spot_ids: input.spotIds,
    website: input.website?.trim().slice(0, L.website) || null,
    phone: input.phone?.trim().slice(0, L.phone) || null,
    email: input.email?.trim().slice(0, L.email) || null,
    address: input.address?.trim().slice(0, L.address) || null,
    source: 'submitted',
    owner_user_id: input.userId,
    verified: false,
    tier: 'free',
    updated_at: new Date().toISOString(),
  };

  const safeSite = safeExternalUrl(row.website);
  row.website = safeSite ? safeSite.slice(0, L.website) : null;
  if (input.website?.trim() && !safeSite) {
    return { ok: false, error: 'Invalid website URL — use http:// or https://' };
  }

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

export type OwnerListingFields = {
  name?: string;
  kind?: DirectoryKind;
  sports?: DirectorySport[];
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  spotIds?: string[];
  lat?: number;
  lon?: number;
  region?: string | null;
  regionEn?: string | null;
};

export async function fetchMyDirectoryListings(
  sb: SupabaseClient,
  userId: string,
): Promise<DirectoryEntry[]> {
  const { data, error } = await sb
    .from('directory_listings')
    .select('*')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    if (/relation .*directory_listings.* does not exist|Could not find the table/i.test(error.message)) {
      return [];
    }
    throw error;
  }
  return ((data as DirectoryListingRow[]) || []).map(listingToEntry);
}

export async function updateDirectoryListing(
  sb: SupabaseClient,
  listingId: string,
  fields: OwnerListingFields,
): Promise<{ ok: true; entry: DirectoryEntry } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (fields.name !== undefined) patch.name = fields.name.trim().slice(0, L.name);
  if (fields.kind !== undefined) patch.kind = fields.kind;
  if (fields.sports !== undefined) patch.sports = fields.sports;
  if (fields.website !== undefined) {
    const raw = fields.website?.trim() || null;
    if (raw) {
      const safe = safeExternalUrl(raw);
      if (!safe) return { ok: false, error: 'Invalid website URL — use http:// or https://' };
      patch.website = safe.slice(0, L.website);
    } else {
      patch.website = null;
    }
  }
  if (fields.phone !== undefined) patch.phone = fields.phone?.trim().slice(0, L.phone) || null;
  if (fields.email !== undefined) patch.email = fields.email?.trim().slice(0, L.email) || null;
  if (fields.address !== undefined) patch.address = fields.address?.trim().slice(0, L.address) || null;
  if (fields.spotIds !== undefined) patch.spot_ids = fields.spotIds;
  if (fields.lat !== undefined) patch.lat = fields.lat;
  if (fields.lon !== undefined) patch.lon = fields.lon;
  if (fields.region !== undefined) patch.region = fields.region;
  if (fields.regionEn !== undefined) patch.region_en = fields.regionEn;

  const { data, error } = await sb
    .from('directory_listings')
    .update(patch)
    .eq('id', listingId)
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, entry: listingToEntry(data as DirectoryListingRow) };
}

export type OwnerProfileFields = {
  displayName?: string | null;
  bio?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  sports?: DirectorySport[];
  spotIds?: string[];
};

export async function fetchMyDirectoryProfiles(
  sb: SupabaseClient,
  userId: string,
): Promise<Array<DirectoryProfileRow & { overlay: DirectoryProfileOverlay }>> {
  const { data, error } = await sb
    .from('directory_profiles')
    .select('*')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    if (/relation .*directory_profiles.* does not exist|Could not find the table/i.test(error.message)) {
      return [];
    }
    throw error;
  }
  return ((data as DirectoryProfileRow[]) || []).map((row) => ({
    ...row,
    overlay: profileRowToOverlay(row),
  }));
}

export async function updateDirectoryProfile(
  sb: SupabaseClient,
  entryId: string,
  fields: OwnerProfileFields,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (fields.displayName !== undefined) {
    patch.display_name = fields.displayName?.trim().slice(0, L.displayName) || null;
  }
  if (fields.bio !== undefined) patch.bio = fields.bio?.trim().slice(0, L.bio) || null;
  if (fields.website !== undefined) {
    const raw = fields.website?.trim() || null;
    if (raw) {
      const safe = safeExternalUrl(raw);
      if (!safe) return { ok: false, error: 'Invalid website URL — use http:// or https://' };
      patch.website = safe.slice(0, L.website);
    } else {
      patch.website = null;
    }
  }
  if (fields.phone !== undefined) patch.phone = fields.phone?.trim().slice(0, L.phone) || null;
  if (fields.email !== undefined) patch.email = fields.email?.trim().slice(0, L.email) || null;
  if (fields.sports !== undefined) patch.sports = fields.sports;
  if (fields.spotIds !== undefined) patch.spot_ids = fields.spotIds;

  const { error } = await sb.from('directory_profiles').update(patch).eq('entry_id', entryId);
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
