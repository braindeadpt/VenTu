import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { preseedWindRingLegend } from './helpers/map-setup';

/**
 * Automated axe-core scan of the core routes in both themes.
 *
 * Route set: the 14 primary surfaces (home, mapa, news, livecams, alerts,
 * favorites, explorar, modalidades, spots index, diretorio, ferramentas,
 * sazonalidade, fontes) — scanned in the default dark theme and in the
 * light "ocean" theme (28 axe runs total).
 *
 * Gate: zero critical/serious violations. Moderate/minor findings are
 * reported in the summary but do not fail the run, so genuinely blocked
 * issues surface without making the scan brittle.
 *
 * Opt-in: `npm run test:e2e:axe`. Not in the blocking CI core yet —
 * remaining contrast debt would fail the job until those surfaces are
 * cleaned up.
 */
const CORE_ROUTES = [
  '/pt/',
  '/en/',
  '/pt/mapa/',
  '/pt/news/',
  '/pt/livecams/',
  '/pt/alerts/',
  '/pt/favorites/',
  '/pt/explorar/',
  '/pt/modalidades/surf/',
  '/pt/spots/',
  '/pt/diretorio/',
  '/pt/ferramentas/calculadora-kite/',
  '/pt/sazonalidade/',
  '/pt/fontes/',
];

const ROUTE_GROUPS = new Map([
  ['/pt/', 'home'],
  ['/en/', 'home'],
  ['/pt/mapa/', 'map'],
  ['/pt/spots/', 'map'],
]);

const FAILING_IMPACTS = new Set(['critical', 'serious']);

test.describe('axe-core scan (core routes × themes)', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const path of CORE_ROUTES) {
    for (const theme of ['dark', 'ocean'] as const) {
      test(`${path} [${theme}] has no critical/serious a11y violations`, async ({ page }) => {
        test.setTimeout(120_000);
        const group = ROUTE_GROUPS.get(path) ?? 'static';
        await preseedWindRingLegend(page);
        // Reduced motion disables the stagger-fade-in entrance animations
        // (motion-reduce:animate-none), so axe scans the settled DOM instead of a
        // mid-fade frame where translucent text reports false sub-AA contrast.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        // loading.tsx is a skeleton — wait for the real main landmark.
        await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 });
        if (theme === 'ocean') {
          await page.evaluate(() => document.documentElement.classList.add('theme-ocean'));
          await page.waitForTimeout(300);
        }

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
          .analyze();

        const failing = results.violations.filter((v) => FAILING_IMPACTS.has(v.impact ?? ''));
        const summary = failing.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          targets: v.nodes.slice(0, 2).map((n) => (n.target ?? []).join(' ')),
          details: v.nodes.slice(0, 2).map((n) => (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 160)),
        }));

        // Attach the full scan as a readable summary for the HTML report.
        test.info().annotations.push({
          type: 'axe',
          description: JSON.stringify(
            {
              route: path,
              theme,
              group,
              totalViolations: results.violations.length,
              criticalSerious: failing.length,
              minorModerate: results.violations.length - failing.length,
              summary,
            },
            null,
            1,
          ),
        });

        expect(
          summary,
          `${path} [${theme}] axe violations:\n${JSON.stringify(summary, null, 1)}`,
        ).toEqual([]);
      });
    }
  }
});
