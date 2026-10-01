import type { Page } from '@playwright/test';

/**
 * Hermetic signed-out state for account-gated pages: install a fake Supabase
 * client before any page script runs, so the gate renders without CI secrets
 * (a keyless build — e.g. the daily full-route audit, which builds without
 * NEXT_PUBLIC_SUPABASE_* — would otherwise show "Supabase não configurado").
 * The mock only answers auth.getSession/onAuthStateChange with a null session
 * — it never touches the network, and production never sets this global.
 * Read by src/lib/supabase.ts (getSupabaseClient/hasTestSupabaseClient) and
 * the gated pages (FavoritesClient, AccountClient, PassaporteClient).
 */
export async function installSupabaseMock(page: Page) {
  await page.addInitScript(() => {
    const testClient = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOtp: async () => ({ error: null }),
        signOut: async () => {},
      },
    };
    (window as unknown as { __VENTU_TEST_SUPABASE_CLIENT__?: unknown }).__VENTU_TEST_SUPABASE_CLIENT__ =
      testClient;
  });
}

/**
 * O mesmo seam, mas COM sessão e um favorito (`guincho`), para medir os ecrãs
 * que só existem depois de entrar (painel de alertas dos favoritos, conta).
 * As tabelas do Supabase são um stub encadeável que devolve a mesma linha em
 * qualquer consulta — o produto não contacta a rede e o resultado é
 * determinístico. Só o que estas páginas pedem está implementado.
 */
export async function installSupabaseSignedIn(
  page: Page,
  opts: { userId?: string; favoriteSpotIds?: string[] } = {},
) {
  const userId = opts.userId ?? 'e2e-alerts-user';
  const favoriteSpotIds = opts.favoriteSpotIds ?? ['guincho'];
  await page.addInitScript(
    ({ userId, favoriteSpotIds }) => {
      const rows = favoriteSpotIds.map((spot_id) => ({ spot_id }));
      const result = { data: rows, error: null, code: null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        update: () => chain,
        delete: () => chain,
        upsert: () => Promise.resolve({ data: null, error: null }),
        insert: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        // Torna a cadeia `await`-ável: `await sb.from(t).select(c).eq(k, v)`.
        then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
      };
      const testClient = {
        auth: {
          getSession: async () => ({
            data: { session: { user: { id: userId, email: 'e2e@ventu.test' } } },
            error: null,
          }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithOtp: async () => ({ error: null }),
          signOut: async () => {},
        },
        from: () => chain,
      };
      (window as unknown as { __VENTU_TEST_SUPABASE_CLIENT__?: unknown }).__VENTU_TEST_SUPABASE_CLIENT__ =
        testClient;
    },
    { userId, favoriteSpotIds },
  );
}
