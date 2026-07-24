import type { SupabaseClient } from '@supabase/supabase-js';

export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export type DirectoryClaimRow = {
  id: number;
  entry_id: string;
  user_id: string;
  status: ClaimStatus;
  evidence: string | null;
  contact_email: string | null;
  admin_note: string | null;
  created_at: string;
};

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

export async function fetchPendingClaims(
  sb: SupabaseClient,
): Promise<DirectoryClaimRow[]> {
  const { data, error } = await sb
    .from('directory_claims')
    .select('id, entry_id, user_id, status, evidence, contact_email, admin_note, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    if (/relation .*directory_claims.* does not exist|Could not find the table/i.test(error.message)) {
      return [];
    }
    throw error;
  }
  return (data as DirectoryClaimRow[]) || [];
}

/**
 * Approve claim via transactional RPC (claim + profile + optional listing).
 * `adminUserId` is unused client-side — Postgres uses auth.uid() as reviewed_by.
 */
export async function approveDirectoryClaim(
  sb: SupabaseClient,
  opts: { claimId: number; entryId: string; claimantUserId: string; adminUserId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.rpc('approve_directory_claim', {
    p_claim_id: opts.claimId,
    p_entry_id: opts.entryId,
    p_claimant: opts.claimantUserId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function rejectDirectoryClaim(
  sb: SupabaseClient,
  opts: { claimId: number; adminUserId: string; adminNote?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb
    .from('directory_claims')
    .update({
      status: 'rejected',
      reviewed_by: opts.adminUserId,
      reviewed_at: new Date().toISOString(),
      admin_note: opts.adminNote?.slice(0, 500) || null,
    })
    .eq('id', opts.claimId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
