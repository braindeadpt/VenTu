import type { SupabaseClient } from '@supabase/supabase-js';

export type DeleteOwnAccountResult = { ok: true } | { ok: false; error: string };

export async function deleteOwnAccount(sb: SupabaseClient): Promise<DeleteOwnAccountResult> {
  try {
    const { error } = await sb.rpc('delete_own_account');
    if (error) {
      return { ok: false, error: error.message || 'delete_failed' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : 'delete_failed',
    };
  }
}
