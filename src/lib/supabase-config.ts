// Supabase config — uses environment variables ONLY
// Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
// via GitHub Secrets or .env.local
//
// Used for:
//  - Public feedback form (anonymous INSERT with rate limit)
//  - Admin contributions panel (Supabase Auth + RLS)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

/** API host only — rejects dashboard URLs pasted by mistake. */
export function isValidSupabaseUrl(value: string): boolean {
  try {
    const { hostname, protocol } = new URL(value)
    return protocol === 'https:' && hostname.endsWith('.supabase.co')
  } catch {
    return false
  }
}

if (!url || !key) {
  console.warn('[VenTu] Supabase not configured — feedback/admin features disabled')
} else if (!isValidSupabaseUrl(url)) {
  console.warn(
    '[VenTu] NEXT_PUBLIC_SUPABASE_URL must be https://<project>.supabase.co — not the dashboard URL',
  )
}

export const SUPABASE_URL = url && isValidSupabaseUrl(url) ? url : ''
export const SUPABASE_ANON_KEY = key || ''
