import type { SupabaseClient } from '@supabase/supabase-js';

export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export async function submitDirectoryClaim(
  sb: SupabaseClient,
  opts: {
    entryId: string;
    userId: string;
    evidence?: string;
    contactEmail?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.from('directory_claims').upsert(
    {
      entry_id: opts.entryId,
      user_id: opts.userId,
      status: 'pending',
      evidence: opts.evidence?.slice(0, 2000) || null,
      contact_email: opts.contactEmail || null,
    },
    { onConflict: 'entry_id,user_id' },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function fetchMyClaimForEntry(
  sb: SupabaseClient,
  userId: string,
  entryId: string,
): Promise<{ status: ClaimStatus } | null> {
  const { data, error } = await sb
    .from('directory_claims')
    .select('status')
    .eq('user_id', userId)
    .eq('entry_id', entryId)
    .maybeSingle();

  if (error || !data) return null;
  return { status: data.status as ClaimStatus };
}
