/**
 * Build the static export with Supabase credentials for Supabase-gated E2E.
 *
 * Supabase-gated pages (/pt/favorites/ gate, the "Entrar com magic link"
 * dialog, account UI) only render their real UI when the build carries
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — the config is
 * baked at build time, so a keyless build shows "Supabase não configurado"
 * instead. CI builds with the real GitHub secrets; this script gives local
 * builds the same shape without requiring a Supabase account.
 *
 * Precedence for the two variables:
 *   1. process environment (CI secrets) — never overridden
 *   2. .env.e2e (gitignored) — put your real local project values here
 *   3. .env.e2e.example (committed) — hermetic placeholders
 *
 * The placeholders are safe: supabase-js only needs an https
 * <project>.supabase.co host to construct the client, and signed-out flows
 * (what the E2E suite exercises) resolve the session from localStorage with
 * no network call — the fake host is never contacted.
 *
 * Everything else is delegated to `npm run build`, so the E2E artifact is
 * identical to the CI build apart from the secrets.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const SUPABASE_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

function loadSupabaseEnv(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (SUPABASE_VARS.includes(key) && process.env[key] === undefined) {
      process.env[key] = line.slice(eq + 1).trim();
    }
  }
}

if (SUPABASE_VARS.some((v) => process.env[v] === undefined)) {
  // .env.e2e wins over the committed example, so a real project can override.
  loadSupabaseEnv('.env.e2e');
  loadSupabaseEnv('.env.e2e.example');
}

const missing = SUPABASE_VARS.filter((v) => process.env[v] === undefined);
if (missing.length > 0) {
  console.warn(
    `[build:e2e] ${missing.join(', ')} not set — the build will be keyless and ` +
      'Supabase-gated E2E pages will show the "não configurado" fallback.',
  );
}

const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
