import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config'

let client: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('Supabase not configured — chat features disabled')
      return null
    }
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return client
}

export const isSupabaseConfigured = () => {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY
}
