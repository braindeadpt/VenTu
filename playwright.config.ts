import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Local E2E with Supabase-gated pages (/pt/favorites/ gate, the magic-link
 * login dialog, account UI): the site config is baked at build time, so the
 * served `out/` must be built with `npm run build:e2e` — that script exports
 * the hermetic placeholders from `.env.e2e.example` (or your real project
 * from `.env.e2e`) into the build, making the artifact match CI's keyed
 * build. Loading the same file here keeps the values visible to this config
 * and to spec helpers. CI builds with real secrets and needs none of this.
 */
function loadE2eEnv(): void {
  const file = existsSync('.env.e2e') ? '.env.e2e' : '.env.e2e.example';
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (key.startsWith('NEXT_PUBLIC_') && process.env[key] === undefined) {
      process.env[key] = line.slice(eq + 1).trim();
    }
  }
}
loadE2eEnv();

const PORT = process.env.PLAYWRIGHT_PORT || '4173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: !process.env.CI,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI: 2 workers no runner ubuntu-latest (4 vCPU) — browsers isolados por
  // worker (page.route/localStorage), sem estado partilhado entre specs.
  // Medido: test:e2e:core (75 testes, max 5.2s/teste) desce de ~2m51s para
  // ~1m30s com workers=2; o timeout de 60s por teste fica folgado ~11×.
  workers: process.env.CI ? 2 : undefined,
  timeout: process.env.CI ? 60_000 : 30_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Visual regression (tests/e2e/visual-regression.spec.ts): zero-diff by
  // default. Baselines are platform-bound — record on the same OS as the
  // CI gate (Linux). Thresholds stay at 0: a deliberate visual change must
  // re-record baselines consciously via `npm run test:visual:update`.
  expect: {
    toHaveScreenshot: {
      // Per-pixel YIQ tolerance: absorbs subpixel anti-aliasing jitter (the
      // same text can AA slightly differently run-to-run) while any real
      // layout shift or color change still differs far above 0.3. Contrast
      // regressions are gated separately by the axe-audit suite.
      threshold: 0.3,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Serves the prebuilt static export (`out/`). Supabase config is baked at
  // build time, so Supabase-gated specs need the site built with
  // `npm run build:e2e` (hermetic placeholders — see .env.e2e.example) or
  // with real secrets in `.env.e2e`; a plain keyless `npm run build` shows
  // the "Supabase não configurado" fallback on those pages instead. CI
  // always builds with real secrets, so the gate specs only run there unless
  // you use the e2e build locally.
  webServer: {
    command: `npx serve out -l ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: process.env.CI ? 120_000 : 60_000,
  },
});
