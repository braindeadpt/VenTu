/** Max lengths aligned with directory_* CHECKs in supabase-directory.sql */
export const DIRECTORY_FIELD_LIMITS = {
  name: 120,
  displayName: 120,
  website: 300,
  phone: 40,
  email: 160,
  address: 300,
  bio: 2000,
} as const;
