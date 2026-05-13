// Supabase config — uses environment variables ONLY
// ⚠️  IMPORTANT: Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
//     via GitHub Secrets or your deployment platform.
//
// 🔒  SECURITY NOTE: The RLS policy in supabase-schema.sql enforces:
//     - Content length: 1-280 characters
//     - Rate limit: max 1 message per username per 10 seconds
//     - Auto-cleanup: delete messages older than 24 hours (see cron options in SQL)
//
//     However, the anon key IS client-side visible — determined abusers can still:
//     - Rotate usernames to bypass per-user rate limits
//     - For production with public chat, consider:
//       (a) Cloudflare Turnstile / hCaptcha
//       (b) Supabase Edge Functions for stricter validation
//       (c) Signed JWTs via auth provider

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('[VenTu] Supabase not configured — chat features will be disabled')
}

export const SUPABASE_URL = url || ''
export const SUPABASE_ANON_KEY = key || ''
