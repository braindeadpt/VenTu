/** Directory entities: schools, shops, kite centers (B2B claim later). */

export type DirectoryKind =
  | 'surf_school'
  | 'kite_center'
  | 'windsurf'
  | 'shop'
  | 'club'
  | 'rental'
  | 'other';

export type DirectorySource = 'osm' | 'curated' | 'claimed' | 'submitted';

/** B2B premium — riders never pay. */
export type DirectoryTier = 'free' | 'featured' | 'pro';

export type DirectorySport =
  | 'surf'
  | 'kitesurf'
  | 'windsurf'
  | 'foil'
  | 'sup'
  | 'bodyboard'
  | 'wakeboard';

export interface DirectoryEntry {
  id: string;
  slug: string;
  name: string;
  nameEn?: string;
  kind: DirectoryKind;
  sports: DirectorySport[];
  lat: number;
  lon: number;
  region?: string;
  regionEn?: string;
  /** Nearby VenTu spot ids (closest first). */
  spotIds: string[];
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  /** Short owner-written blurb (from profile overlay). */
  bio?: string;
  source: DirectorySource;
  osmType?: 'node' | 'way' | 'relation';
  osmId?: number;
  /** Claimed + admin-approved (runtime merge from Supabase in F2). */
  verified?: boolean;
  /** B2B tier — default free. */
  tier?: DirectoryTier;
}

export interface DirectoryFile {
  generatedAt: string;
  source: string;
  count: number;
  entries: DirectoryEntry[];
}
