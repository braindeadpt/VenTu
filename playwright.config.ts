import { defineConfig, devices } from '@playwright/test';

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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx serve out -l ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: process.env.CI ? 120_000 : 60_000,
  },
});
