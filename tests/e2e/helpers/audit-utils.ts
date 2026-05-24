import type { Page } from '@playwright/test';

/** Benign browser / third-party noise — not app regressions. */
const IGNORED_CONSOLE_PATTERNS = [
  /Supabase not configured/i,
  /Download the React DevTools/i,
  /Content Security Policy.*frame-ancestors/i,
  /Failed to load resource.*404/i,
  /favicon/i,
  /manifest/i,
  /_leaflet/i,
  /leaflet/i,
];

const IGNORED_PAGE_ERROR_PATTERNS = [
  /_leaflet_pos/i,
  /leaflet/i,
];

const IGNORED_REQUEST_PATTERNS = [
  /googletagmanager\.com/i,
  /google-analytics\.com/i,
  /doubleclick\.net/i,
  /hotjar\.com/i,
  /favicon/i,
  /manifest\.json/i,
];

export interface PageHealth {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

export function attachPageHealthCollectors(page: Page): PageHealth {
  const health: PageHealth = { consoleErrors: [], pageErrors: [], failedRequests: [] };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))) return;
    health.consoleErrors.push(text);
  });

  page.on('pageerror', (err) => {
    if (IGNORED_PAGE_ERROR_PATTERNS.some((re) => re.test(err.message))) return;
    health.pageErrors.push(err.message);
  });

  page.on('response', (response) => {
    const url = response.url();
    if (IGNORED_REQUEST_PATTERNS.some((re) => re.test(url))) return;
    if (response.status() >= 400) {
      health.failedRequests.push(`${response.status()} ${url}`);
    }
  });

  return health;
}

export async function assertHealthyPage(
  page: Page,
  health: PageHealth,
  opts: {
    allowLoadingState?: boolean;
    strictNetwork?: boolean;
    strictConsole?: boolean;
  } = {},
) {
  const notFound = page.getByRole('heading', { name: /Página não encontrada|Page not found/i });
  if (await notFound.isVisible().catch(() => false)) {
    throw new Error('Unexpected 404 page');
  }

  const main = page.locator('main');
  if ((await main.count()) > 0) {
    await main.first().waitFor({ state: 'visible', timeout: 15_000 });
  } else {
    await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 });
  }

  if (!opts.allowLoadingState) {
    const loadingOnly = await page
      .locator('body')
      .evaluate((el) => (el.textContent ?? '').trim().length < 15);
    if (loadingOnly) {
      throw new Error('Page appears empty or stuck loading');
    }
  }

  if (health.pageErrors.length > 0) {
    throw new Error(`Uncaught page errors:\n${health.pageErrors.join('\n')}`);
  }

  if (opts.strictConsole && health.consoleErrors.length > 0) {
    throw new Error(`Console errors:\n${health.consoleErrors.join('\n')}`);
  }

  if (opts.strictNetwork !== false && health.failedRequests.length > 0) {
    throw new Error(`Failed requests:\n${health.failedRequests.join('\n')}`);
  }
}
