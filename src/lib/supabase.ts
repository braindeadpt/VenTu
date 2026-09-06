import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isValidSupabaseUrl } from './supabase-config'

let client: ReturnType<typeof createClient> | null = null

type TestSupabaseClient = ReturnType<typeof createClient>

declare global {
  interface Window {
    /**
     * E2E seam (mirrors the ventu_live cookie pattern): installed by
     * tests/e2e/mobile-playtest.spec.ts via addInitScript so the signed-out
     * gate renders in keyless builds that lack NEXT_PUBLIC_SUPABASE_*. Never
     * set by production code — a plain window property, inert on the real
     * site.
     */
    __VENTU_TEST_SUPABASE_CLIENT__?: TestSupabaseClient
  }
}

function getTestSupabaseClient(): TestSupabaseClient | undefined {
  if (typeof window === 'undefined') return undefined
  return window.__VENTU_TEST_SUPABASE_CLIENT__
}

/** True when the E2E seam installed a fake client (test builds only). */
export function hasTestSupabaseClient(): boolean {
  return typeof window !== 'undefined' && !!window.__VENTU_TEST_SUPABASE_CLIENT__
}

export function getSupabaseClient() {
  if (!client) {
    const testClient = getTestSupabaseClient()
    if (testClient) {
      client = testClient
      return client
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('Supabase not configured — feedback/admin features disabled')
      return null
    }
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export const isSupabaseConfigured = () => {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY && isValidSupabaseUrl(SUPABASE_URL)
}
