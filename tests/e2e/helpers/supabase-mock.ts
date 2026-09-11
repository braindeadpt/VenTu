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
