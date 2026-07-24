import { describe, expect, it, vi } from 'vitest';
import { approveDirectoryClaim } from '../directoryClaims';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('approveDirectoryClaim', () => {
  it('calls approve_directory_claim RPC once (atomic)', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const sb = { rpc } as unknown as SupabaseClient;

    const res = await approveDirectoryClaim(sb, {
      claimId: 42,
      entryId: 'sub-abc',
      claimantUserId: '11111111-1111-1111-1111-111111111111',
      adminUserId: '22222222-2222-2222-2222-222222222222',
    });

    expect(res).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('approve_directory_claim', {
      p_claim_id: 42,
      p_entry_id: 'sub-abc',
      p_claimant: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('returns error message when RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: { message: 'not authorized' },
    });
    const sb = { rpc } as unknown as SupabaseClient;

    const res = await approveDirectoryClaim(sb, {
      claimId: 1,
      entryId: 'escola-x',
      claimantUserId: '11111111-1111-1111-1111-111111111111',
      adminUserId: '22222222-2222-2222-2222-222222222222',
    });

    expect(res).toEqual({ ok: false, error: 'not authorized' });
  });
});
