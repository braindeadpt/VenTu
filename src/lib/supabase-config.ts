// Supabase config — uses environment variables ONLY
// Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
// via GitHub Secrets or .env.local
//
// Used for:
//  - Public feedback form (anonymous INSERT with rate limit)
//  - Admin contributions panel (Supabase Auth + RLS)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('[VenTu] Supabase not configured — feedback/admin features disabled')
}

export const SUPABASE_URL = url || ''
export const SUPABASE_ANON_KEY = key || ''
