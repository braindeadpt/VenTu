import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { deleteOwnAccount } from '@/lib/deleteAccount';

// Estes testes cobrem apenas o wrapper cliente (mapeamento de erros). O
// comportamento REAL da eliminação — cascata, sweep de alertas legacy por
// email, scrub do directório contra os protect triggers, refs de moderação
// NO ACTION e a perda de acesso admin pós-delete — é exercitado contra
// Postgres real em supabase/tests/test-delete-account.sql (CI: job
// supabase-sql), porque aqui só conseguiríamos mockar o RPC.

function supabaseWithRpc(rpc: ReturnType<typeof vi.fn>): SupabaseClient {
  return { rpc } as unknown as SupabaseClient;
}

describe('deleteOwnAccount', () => {
  it('calls the delete_own_account RPC and succeeds without an error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const sb = supabaseWithRpc(rpc);

    await expect(deleteOwnAccount(sb)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('delete_own_account');
  });

  it('returns the RPC error message', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'not authenticated' },
    });

    await expect(deleteOwnAccount(supabaseWithRpc(rpc))).resolves.toEqual({
      ok: false,
      error: 'not authenticated',
    });
  });

  it('falls back to a stable error key when the RPC error has no message', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: {} });

    await expect(deleteOwnAccount(supabaseWithRpc(rpc))).resolves.toEqual({
      ok: false,
      error: 'delete_failed',
    });
  });

  it('converts a rejected RPC promise into an error result', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(deleteOwnAccount(supabaseWithRpc(rpc))).resolves.toEqual({
      ok: false,
      error: 'network down',
    });
  });
});
