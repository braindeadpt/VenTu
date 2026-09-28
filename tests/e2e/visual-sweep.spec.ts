import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { settlePage } from './helpers/settle';
import { collectVisual, type VisualMeasure } from './helpers/visual-measure';

/**
 * VARRIMENTO VISUAL EM PÍXEIS — todas as rotas do export × 2 temas × 2 larguras.
 *
 * Não afirma nada: captura. Cada captura deixa dois artefactos em `_audit/`:
 *   · `shots/<tema>-<largura>/<slug>.jpg` — a página inteira em JPEG q62;
 *   · `records/<tema>-<largura>/<slug>.json` — o que se mediu naquele momento
 *     (tema aplicado, mapas, esqueletos, imagens quebradas, caixas de texto
 *     para contraste, tempos).
 *
 * O analisador (`scripts/visual-sweep-analyze.mjs`) é que olha para os píxeis:
 * nenhum invariante de DOM aqui.
 *
 * Autolimitado: se o manifesto não existir (só existe depois de correr
 * `scripts/visual-sweep-manifest.mjs`, e `_audit/` é ignorado pelo git), toda a
 * suite é saltada — por isso pode viver em `tests/e2e/` sem entrar em CI.
 *
 * Uso:
 *   node scripts/visual-sweep-manifest.mjs
 *   PLAYWRIGHT_PORT=4321 npx playwright test --config=playwright.vsweep.config.ts
 *
 * Variáveis: VS_MANIFEST, VS_OUT, VS_RESUME=1 (não repetir o que já existe),
 * VS_THEMES (lista separada por vírgulas), VS_WIDTHS, VS_FAMILIES (filtro).
 */

const MANIFEST = process.env.VS_MANIFEST
  ? path.resolve(process.env.VS_MANIFEST)
  : path.join(process.cwd(), '_audit', 'visual-sweep', 'manifest.json');
const OUT = process.env.VS_OUT ? path.resolve(process.env.VS_OUT) : path.join(process.cwd(), '_audit', 'visual-sweep');
const RESUME = process.env.VS_RESUME === '1';
const CAP_MS = Number(process.env.VS_CAP_MS ?? 15_000);

interface ManifestRoute {
  path: string;
  file: string;
  family: string;
  locale: string;
  slug: string;
  bytes: number;
}
interface Manifest {
  generatedAt: string;
  total: number;
  families: Record<string, number>;
  routes: ManifestRoute[];
  fingerprint: Record<string, unknown>;
}

const hasManifest = fs.existsSync(MANIFEST);
const manifest: Manifest | null = hasManifest
  ? (JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as Manifest)
  : null;

const THEMES = (process.env.VS_THEMES ?? 'dark,light').split(',') as ('dark' | 'light')[];
const WIDTHS: { name: string; width: number; height: number }[] = (
  process.env.VS_WIDTHS ?? '390,1440'
)
  .split(',')
  .map((w) => ({ name: w, width: Number(w), height: Number(w) <= 500 ? 844 : 900 }));
const FAMILIES = (process.env.VS_FAMILIES ?? '').split(',').filter(Boolean);

const ROUTES = (manifest?.routes ?? []).filter((r) => (FAMILIES.length ? FAMILIES.includes(r.family) : true));

interface VisualRecord {
  path: string;
  slug: string;
  family: string;
  locale: string;
  theme: string;
  width: string;
  viewport: { width: number; height: number };
  status: number;
  finalUrl: string;
  navError: string | null;
  settle: { ok: boolean; ms: number; samples: number; signature: string };
  measure: VisualMeasure | null;
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  shotBytes: number;
  ms: number;
  sweep: { manifest: string; generatedAt: string; fingerprint: Record<string, unknown> };
}

test.describe('varrimento visual em píxeis', () => {
  test.skip(!hasManifest, `sem manifesto em ${MANIFEST} — correr \`node scripts/visual-sweep-manifest.mjs\``);

  test('o servidor serve o artefacto que o manifesto descreve', async ({ request }) => {
    // Sem isto, uma porta ocupada por outro worktree faria o varrimento medir
    // o build errado e assinar os resultados com a impressão digital errada
    // (o Playwright reutiliza qualquer servidor que já responda na porta).
    const res = await request.get('/pt/index.html');
    expect(res.status()).toBe(200);
    const body = await res.body();
    const sha = crypto.createHash('sha256').update(body).digest('hex');
    const expected = String((manifest?.fingerprint as { anchorSha256?: string })?.anchorSha256 ?? '');
    expect(sha, 'o servidor não está a servir o out/ do manifesto').toBe(expected);
  });

  for (const theme of THEMES) {
    for (const route of ROUTES) {
      test(`${theme} ${route.path}`, async ({ browser }) => {
        test.setTimeout(180_000);
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 1,
          // O tema em produção é cookie/localStorage, não media query — mas o
          // sistema do utilizador costuma acompanhar a escolha, e é assim que
          // um ecrã escuro vê a página.
          colorScheme: theme,
          locale: 'pt-PT',
        });
        await context.addInitScript(
          ([t, l]: [string, string]) => {
            try {
              localStorage.setItem('windspot:theme', t);
              localStorage.setItem('ventu:locale', l);
              document.cookie = `ventu-theme=${t};path=/;max-age=31536000;samesite=lax`;
            } catch {
              /* storage indisponível (modo privado) */
            }
          },
          [theme, route.locale === '—' ? 'pt' : route.locale] as [string, string],
        );

        for (const w of WIDTHS) {
          const combo = `${theme}-${w.name}`;
          const recordFile = path.join(OUT, 'records', combo, `${route.slug}.json`);
          const shotFile = path.join(OUT, 'shots', combo, `${route.slug}.jpg`);
          if (RESUME && fs.existsSync(recordFile) && fs.existsSync(shotFile)) continue;

          const page = await context.newPage();
          const pageErrors: string[] = [];
          const consoleErrors: string[] = [];
          const failedRequests: string[] = [];
          page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e).slice(0, 300)));
          page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
          });
          page.on('requestfailed', (req) => {
            const url = req.url();
            if (/googletagmanager|google-analytics|doubleclick|hotjar|favicon/i.test(url)) return;
            const err = req.failure()?.errorText ?? 'falhou';
            if (/ERR_ABORTED/.test(err)) return; // prefetch abortado pela navegação seguinte
            if (/ventu-local-e2e\.supabase\.co/.test(url)) return; // build hermético de e2e
            failedRequests.push(`${err} ${url}`);
          });
          page.on('response', (res) => {
            if (res.status() >= 400 && !/ventu-local-e2e\.supabase\.co/.test(res.url())) {
              failedRequests.push(`HTTP ${res.status()} ${res.url()}`);
            }
          });

          await page.setViewportSize({ width: w.width, height: w.height });
          const started = Date.now();
          let status = 0;
          let finalUrl = '';
          let navError: string | null = null;
          let settle = { ok: false, ms: 0, samples: 0, signature: '' };
          let measure: VisualMeasure | null = null;

          try {
            const response = await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            status = response?.status() ?? 0;
            // 3 s e não 20: as páginas que NÃO hidratam (o widget B2B em
            // /embed/spot/*, as 404) faziam-me pagar o tempo-onde-tudo-falha por
            // cada captura — 20,8 s medidos em 740 capturas de embed, ~1,4 h de
            // espera morta. Quem hidrata, hidrata em menos de 1 s (é o que a
            // auditoria de DOM mede há meses); quem não hidrata fica registado
            // em `measure.htmlClass` e sai como achado `sem-hidratacao`.
            await page.waitForSelector('html.is-hydrated', { timeout: 3_000 }).catch(() => undefined);
            // Tecto curto para o mapa: o de pré-visualização da página de spot
            // NUNCA põe `data-map-settled` e a espera por omissão (10 s) gastava
            // o orçamento todo em cada uma das ~3 700 capturas de spot.
            settle = await settlePage(page, { mapTimeoutMs: 1_000, timeoutMs: 8_000 });
            finalUrl = page.url();
            measure = (await page.evaluate(collectVisual)) as VisualMeasure;
          } catch (err) {
            navError = err instanceof Error ? err.message.slice(0, 300) : String(err);
          }

          let shotBytes = 0;
          try {
            fs.mkdirSync(path.dirname(shotFile), { recursive: true });
            await page.screenshot({
              path: shotFile,
              fullPage: true,
              type: 'jpeg',
              quality: 62,
              animations: 'disabled',
              caret: 'hide',
              timeout: 60_000,
            });
            shotBytes = fs.statSync(shotFile).size;
          } catch (err) {
            navError = `${navError ? navError + ' | ' : ''}captura falhou: ${err instanceof Error ? err.message : String(err)}`;
          }

          const record: VisualRecord = {
            path: route.path,
            slug: route.slug,
            family: route.family,
            locale: route.locale,
            theme,
            width: w.name,
            viewport: { width: w.width, height: w.height },
            status,
            finalUrl,
            navError,
            settle,
            measure,
            pageErrors,
            consoleErrors: consoleErrors.filter((e) => !/Failed to load resource/i.test(e)),
            failedRequests: [...new Set(failedRequests)].slice(0, 8),
            shotBytes,
            ms: Date.now() - started,
            sweep: {
              manifest: path.relative(process.cwd(), MANIFEST),
              generatedAt: manifest?.generatedAt ?? '',
              fingerprint: manifest?.fingerprint ?? {},
            },
          };
          fs.mkdirSync(path.dirname(recordFile), { recursive: true });
          fs.writeFileSync(recordFile, JSON.stringify(record));
          await page.close();

          if (record.ms > CAP_MS) {
            console.log(
              `[varrimento] lento: ${combo} ${route.path} ${record.ms} ms (assentou=${settle.ok} ${settle.ms} ms)`,
            );
          }
        }
        await context.close();
      });
    }
  }
});
