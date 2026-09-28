import { test } from '@playwright/test';
import { LOCALES, MODALITY_SLUGS } from './helpers/discover-routes';
import { attachPageHealthCollectors } from './helpers/audit-utils';
import { collectInvariants, writeRaw, type Finding } from './helpers/audit-invariants';
import { settlePage } from './helpers/settle';

/**
 * MEGA AUDIT — varrimento de LAYOUT.
 *
 * Cada rota × locale × viewport × tema é uma visita: bateria de invariantes
 * (`helpers/audit-invariants.ts`) + saúde da página (erros JS, requests
 * falhados). Nada aqui afirma — recolhe para `test-results/mega-audit/*.json`,
 * que o relatório agrega. Não está em nenhum gate de CI de propósito.
 *
 * Cobre os templates que o `full-audit` de CI NÃO visita: o `STATIC_PATHS` do
 * `discover-routes.js` não inclui /diretorio/ (nem os ~130 registos),
 * /ferramentas/ (nem as 2 calculadoras), /passaporte/, /conta/, /fontes/,
 * /admin/diretorio/ nem /auth/callback/ — existem no export e não tinham
 * nenhuma auditoria de BROWSER (só HTTP, pelo check-export-routes.js).
 */

/** Templates distintos: todos os locales, todos os viewports. */
const DISTINCT = [
  '/',
  '/about/',
  '/mapa/',
  '/spots/',
  '/explorar/',
  '/diretorio/',
  '/ferramentas/',
  '/ferramentas/calculadora-kite/',
  '/ferramentas/calculadora-fato/',
  '/news/',
  '/modalidades/',
  '/sazonalidade/',
  '/livecams/',
  '/fontes/',
  '/passaporte/',
  '/compare/',
  '/conta/',
  '/favorites/',
  '/alerts/',
  '/admin/contributions/',
  '/admin/diretorio/',
  '/auth/callback/',
  ...MODALITY_SLUGS.map((s) => `/modalidades/${s}/`),
];

/** Mesmo template, dados diferentes: amostra fixa (determinística). */
const SAMPLE = [
  ...[
    'guincho',
    'nazare',
    'supertubos',
    'moledo',
    'sao-vicente-madeira',
    'praia-37',
    'foil-cabedelo',
    'cabedelo-wakepark',
    'zavial',
  ].map((s) => `/spots/${s}/`),
  '/news/4-5-bilioes-de-cigarros-espalhados-uma-solucao-simples-452-30/',
  '/news/a-manha-apos-a-noite-da-festa-de-abertura-452-29/',
  '/news/video-de-entrada-do-king-of-the-air-kitesurfing-incredible-597-35/',
  '/explorar/surf-lisboa/',
  '/explorar/kitesurf-algarve/',
  '/explorar/big-wave-madeira/',
  '/explorar/sup-lisboa/',
  '/explorar/surf-norte/',
  '/explorar/windsurf-norte/',
  '/diretorio/3-surfers/',
  '/diretorio/escola-de-surf-de-peniche/',
  '/diretorio/salty-wave-surf-school-algarve/',
];

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, kind: 'mobile' as const },
  { name: '1440', width: 1440, height: 900, kind: 'desktop' as const },
];

type Theme = 'dark' | 'light';

interface Target {
  path: string;
  locale: string;
  viewport: (typeof VIEWPORTS)[number];
  theme: Theme;
}

function buildTargets(): Target[] {
  const targets: Target[] = [];
  const push = (locale: string, paths: string[], viewport: (typeof VIEWPORTS)[number], theme: Theme) => {
    for (const p of paths) targets.push({ path: `/${locale}${p}`, locale, viewport, theme });
  };

  for (const locale of LOCALES) {
    for (const vp of VIEWPORTS) push(locale, DISTINCT, vp, 'dark');
  }
  // Conteúdo (mesmo template): pt+en, para não multiplicar 5× o mesmo markup.
  for (const locale of ['pt', 'en']) {
    for (const vp of VIEWPORTS) push(locale, SAMPLE, vp, 'dark');
  }
  // Tema claro: os templates distintos, só pt — é onde vivem as classes de cor.
  for (const vp of VIEWPORTS) push('pt', DISTINCT, vp, 'light');
  return targets;
}

const TARGETS = buildTargets();

const slugOf = (t: Target) =>
  `${t.theme}-${t.viewport.name}-${t.locale}-${t.path.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'raiz'}`;

test.describe.configure({ mode: 'parallel' });

test.describe('MEGA AUDIT — layout', () => {
  for (const t of TARGETS) {
    test(`${t.theme} ${t.viewport.name} ${t.path}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.context().addInitScript((theme: string) => {
        try {
          localStorage.setItem('windspot:theme', theme);
        } catch {
          /* sem storage */
        }
      }, t.theme);
      await page.setViewportSize({ width: t.viewport.width, height: t.viewport.height });

      const health = attachPageHealthCollectors(page);
      // O console só diz «Failed to load resource» sem URL. Aqui apanha-se o
      // pedido que falhou, com o URL — é a evidência que serve.
      const requestsFailed: string[] = [];
      page.on('requestfailed', (req) => {
        const url = req.url();
        if (/googletagmanager|google-analytics|doubleclick|hotjar|favicon|manifest\.json/i.test(url)) return;
        const err = req.failure()?.errorText ?? 'falhou';
        // `net::ERR_ABORTED` é o PRÓPRIO varrimento: o Next aborta prefetches
        // quando a página seguinte é pedida, e o runner muda de página a meio
        // do voo. Não é falha de rede nossa — e eram 2 594 linhas de ruído que
        // oscilavam ±150 entre corridas idênticas, a esconder o que interessa.
        if (/ERR_ABORTED/.test(err)) return;
        // O build hermético de e2e aponta o Supabase para um host que NÃO
        // resolve (`ventu-local-e2e.supabase.co`, ver .env.e2e.example): falhar
        // ali é o desenho, não um defeito do produto. Sem isto, cada página que
        // monta o cliente faz uma falha de DNS conforme o tempo que a corrida
        // lhe deu — era a maior fonte de oscilação que restava.
        if (/ventu-local-e2e\.supabase\.co/.test(url)) return;
        requestsFailed.push(`${err} ${url}`);
      });
      const started = Date.now();
      let status = 0;
      let finalUrl = '';
      // Findings decididos antes da bateria (o assentamento) entram por aqui.
      const writeRawLater: Finding[] = [];

      try {
        const response = await page.goto(t.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        status = response?.status() ?? 0;
        await page.waitForSelector('html.is-hydrated', { timeout: 20_000 }).catch(() => undefined);
        // Estado observável em vez de 700 ms arbitrários (ver helpers/settle.ts).
        const settle = await settlePage(page);
        if (!settle.ok) {
          writeRawLater.push({
            kind: 'nao-assentou',
            severity: 'warn',
            detail: `quiescência não atingida em ${settle.ms} ms (${settle.samples} leituras) — última assinatura: ${settle.signature}`,
          });
        }
        finalUrl = page.url();
      } catch (err) {
        writeRaw(slugOf(t), {
          path: t.path,
          locale: t.locale,
          theme: t.theme,
          viewport: t.viewport.name,
          status,
          finalUrl,
          navigationError: err instanceof Error ? err.message : String(err),
          findings: [],
        });
        return;
      }

      const findings: Finding[] = [...writeRawLater];
      try {
        findings.push(
          ...(await page.evaluate(collectInvariants, {
            locale: t.locale,
            viewport: t.viewport.kind,
          })),
        );
      } catch (err) {
        findings.push({
          kind: 'bateria-falhou',
          severity: 'error',
          detail: err instanceof Error ? err.message : String(err),
        });
      }

      for (const e of health.pageErrors) findings.push({ kind: 'js-uncaught', severity: 'error', detail: e });
      // «Failed to load resource» no console não traz URL e duplica o
      // `requestfailed` abaixo — fica só o que tem URL.
      for (const e of health.consoleErrors) {
        if (/Failed to load resource/i.test(e)) continue;
        findings.push({ kind: 'console-error', severity: 'warn', detail: e });
      }
      for (const e of requestsFailed) findings.push({ kind: 'request-falhado', severity: 'warn', detail: e });
      for (const e of health.failedRequests) findings.push({ kind: 'resposta-erro', severity: 'warn', detail: e });
      if (status >= 400) findings.push({ kind: 'http', severity: 'error', detail: `status ${status}` });
      if (finalUrl && !finalUrl.includes(t.path)) {
        findings.push({ kind: 'redirect', severity: 'info', detail: `foi para ${finalUrl}` });
      }

      writeRaw(slugOf(t), {
        path: t.path,
        locale: t.locale,
        theme: t.theme,
        viewport: t.viewport.name,
        status,
        finalUrl,
        ms: Date.now() - started,
        findings,
      });
    });
  }
});

test('a matriz cobre os templates que o full-audit de CI não visita', () => {
  const paths = new Set(TARGETS.map((t) => t.path));
  for (const p of [
    '/pt/diretorio/',
    '/pt/diretorio/3-surfers/',
    '/pt/ferramentas/',
    '/pt/ferramentas/calculadora-kite/',
    '/pt/passaporte/',
    '/pt/conta/',
    '/pt/fontes/',
    '/pt/admin/diretorio/',
    '/pt/auth/callback/',
  ]) {
    if (!paths.has(p)) throw new Error(`matriz sem ${p}`);
  }
  if (TARGETS.length < 300) throw new Error(`matriz pequena de mais: ${TARGETS.length}`);
});
