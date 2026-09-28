import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { attachPageHealthCollectors } from './helpers/audit-utils';
import { collectInvariants, writeRaw, type Finding } from './helpers/audit-invariants';

/**
 * MEGA AUDIT — INTERACÇÕES, MAPA, MOVIMENTO e CAPTURAS.
 *
 * 1. «Botão a botão»: em cada página-hub carimba os controlos que AGEM na
 *    página (button, tab, role=button, summary, âncoras internas `#…` — os
 *    links de navegação são cobertos pelo `mega-audit-links.mjs`, que verifica
 *    os 114 574 links internos do export) e clica-os um a um, na mesma sessão,
 *    como um utilizador. Depois de cada clique: erro JS novo, ecrã em branco,
 *    diálogo que não fecha com Escape, clique que não fez nada (no-op) e
 *    navegação inesperada.
 * 2. Mapa: menu de camadas (liga/desliga todas) e marcador → popup → Escape.
 * 3. Movimento: com `prefers-reduced-motion: reduce` não pode haver animação a
 *    correr (§7 do SPOT-PAGE-V3 e os `motion-reduce:` do Tailwind).
 * 4. Capturas para revisão HUMANA em `_audit/mega-2026-09-26/shots/`: este
 *    ambiente não deixa o agente ver píxeis, por isso ficam no disco. (Não em
 *    `test-results/`: o Playwright apaga essa pasta no início de cada corrida.)
 */

/** Só controlos que agem: os `select` nativos e os links de navegação ficam fora. */
const CONTROL_SELECTOR = [
  'main button',
  'header button',
  'main [role="tab"]',
  'main [role="button"]',
  'main summary',
  'main a[href^="#"]',
].join(', ');

interface Control {
  i: number;
  tag: string;
  name: string;
}

/** Roda no browser: carimba os controlos com `data-audit-id` e devolve a lista. */
function tagControlsInPage(selector: string): Control[] {
  const out: Control[] = [];
  let i = 0;
  for (const el of Array.from(document.querySelectorAll(selector)) as HTMLElement[]) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden') continue;
    if (el.closest('.leaflet-control')) continue; // controlos da biblioteca
    if (el.hasAttribute('disabled')) continue; // não é clicável (nem devia ser)
    el.setAttribute('data-audit-id', String(i));
    out.push({
      i,
      tag: el.tagName.toLowerCase(),
      name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 48),
    });
    if (++i >= 28) break;
  }
  return out;
}

interface InteractionResult {
  page: string;
  controls: number;
  clicked: number;
  noOps: string[];
  naoClicavel: string[];
  naoFechouComEscape: string[];
  erros: string[];
  navegacoes: string[];
  ecraEmBranco: string[];
  dialogsAbertos: number;
}

const PAGES: { path: string; name: string }[] = [
  { path: '/pt/', name: 'home' },
  { path: '/pt/mapa/', name: 'mapa' },
  { path: '/pt/spots/', name: 'spots-lista' },
  { path: '/pt/spots/guincho/', name: 'spot-detalhe' },
  { path: '/pt/explorar/', name: 'explorar' },
  { path: '/pt/explorar/surf-lisboa/', name: 'explorar-landing' },
  { path: '/pt/modalidades/surf/', name: 'modalidade' },
  { path: '/pt/news/', name: 'news' },
  { path: '/pt/diretorio/', name: 'diretorio' },
  { path: '/pt/ferramentas/calculadora-kite/', name: 'calculadora-kite' },
  { path: '/pt/ferramentas/calculadora-fato/', name: 'calculadora-fato' },
  { path: '/pt/compare/', name: 'compare' },
  { path: '/pt/livecams/', name: 'livecams' },
  { path: '/pt/sazonalidade/', name: 'sazonalidade' },
  { path: '/pt/fontes/', name: 'fontes' },
  { path: '/pt/passaporte/', name: 'passaporte' },
  { path: '/pt/about/', name: 'about' },
  { path: '/pt/alerts/', name: 'alerts' },
];

test.describe.configure({ mode: 'parallel' });

test.describe('MEGA AUDIT — botão a botão', () => {
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

  for (const p of PAGES) {
    test(`${p.name} — todos os controlos da página`, async ({ page }) => {
      test.setTimeout(180_000);
      const health = attachPageHealthCollectors(page);
      const result: InteractionResult = {
        page: p.path,
        controls: 0,
        clicked: 0,
        noOps: [],
        naoClicavel: [],
        naoFechouComEscape: [],
        erros: [],
        navegacoes: [],
        ecraEmBranco: [],
        dialogsAbertos: 0,
      };

      const abrir = async () => {
        await page.goto(p.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForSelector('html.is-hydrated', { timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(600);
      };

      // Sem isto a paleta de pesquisa (o primeiro controlo do header) ficava
      // por cima da página e TODOS os cliques seguintes falhavam por
      // intercepção de ponteiro — o varrimento media-se a si próprio.
      const dialogAberto = async () => {
        const d = page.locator('[role="dialog"]:visible, [aria-modal="true"]:visible').first();
        return (await d.count()) > 0 && (await d.isVisible().catch(() => false));
      };
      const fecharOverlays = async () => {
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          if (!(await dialogAberto())) return;
          await page.keyboard.press('Escape');
          await page.waitForTimeout(250);
          if (await dialogAberto()) {
            await page.mouse.click(4, 4); // clica no backdrop
            await page.waitForTimeout(250);
          }
        }
      };
      const naPagina = () => new URL(page.url()).pathname === p.path;
      // Impressão digital do MAIN: um `outerHTML` completo (a mudar de classe
      // conta) mais um hash simples — comparar só comprimentos dava «no-op» a
      // qualquer alternância de estado que não mudasse o texto.
      const impressao = () =>
        page.evaluate(() => {
          const html = (document.querySelector('main') ?? document.body).outerHTML;
          let h = 5381;
          for (let i = 0; i < html.length; i++) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
          return `${html.length}:${h}`;
        });

      await abrir();
      let controls = await page.evaluate(tagControlsInPage, CONTROL_SELECTOR);
      result.controls = controls.length;

      for (const c of controls) {
        if (!naPagina()) {
          await abrir();
          controls = await page.evaluate(tagControlsInPage, CONTROL_SELECTOR);
        }
        await fecharOverlays();
        const antes = await impressao();
        const errosAntes = health.pageErrors.length;
        const loc = page.locator(`[data-audit-id="${c.i}"]`);

        try {
          await loc.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => undefined);
          await loc.click({ timeout: 4_000 });
        } catch (err) {
          // Um overlay residual não é um defeito do controlo: fecha e tenta uma vez.
          await fecharOverlays();
          try {
            await loc.click({ timeout: 4_000, force: true });
          } catch {
            result.naoClicavel.push(
              `${c.tag}«${c.name}» (${err instanceof Error ? err.message.split('\n')[0].slice(0, 90) : String(err)})`,
            );
            continue;
          }
        }
        result.clicked++;
        await page.waitForTimeout(300);

        // O no-op mede-se ANTES de fechar seja o que for: abrir a paleta de
        // pesquisa é uma acção, não um clique que não fez nada.
        const depois = await impressao();
        const abriuOverlay = await dialogAberto();
        if (depois === antes && !abriuOverlay && naPagina()) result.noOps.push(`${c.tag}«${c.name}»`);

        for (const e of health.pageErrors.slice(errosAntes)) {
          result.erros.push(`${c.tag}«${c.name}» → ${e.slice(0, 160)}`);
        }

        if (abriuOverlay) {
          result.dialogsAbertos++;
          await page.keyboard.press('Escape');
          await page.waitForTimeout(250);
          if (await dialogAberto()) {
            result.naoFechouComEscape.push(`${c.tag}«${c.name}»`);
            await fecharOverlays();
          }
        }

        if (!naPagina()) {
          result.navegacoes.push(
            `${c.tag}«${c.name}» → ${page.url().replace(/^https?:\/\/[^/]+/, '')}`,
          );
          await abrir();
          controls = await page.evaluate(tagControlsInPage, CONTROL_SELECTOR);
          continue;
        }

        const texto = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').trim().length);
        if (texto < 40) result.ecraEmBranco.push(`${c.tag}«${c.name}»`);
      }

      writeRaw(`interactions_${p.name}`, result);
    });
  }
});

test.describe('MEGA AUDIT — mapa', () => {
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });

  /**
   * O menu de camadas é um popover PORTALIZADO com botões `[aria-pressed]`
   * (`data-map-layers-popover`, aberto a partir de `[data-map-layers-menu]`),
   * não um `role="dialog"`. A primeira versão deste teste procurava um
   * diálogo e por isso não encontrava nada — media-se a si própria.
   */
  test('camadas do mapa: ligar e desligar todas', async ({ page }) => {
    test.setTimeout(180_000);
    const health = attachPageHealthCollectors(page);
    const findings: Finding[] = [];
    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await page.waitForTimeout(1_500);

    const gatilho = page.locator('[data-map-layers-menu]').first();
    if ((await gatilho.count()) === 0) {
      findings.push({ kind: 'mapa-sem-menu-camadas', severity: 'error', detail: 'não há botão de camadas' });
      writeRaw('map_layers', { toggles: 0, findings });
      return;
    }
    await gatilho.click();
    await page.waitForTimeout(600);

    const popover = page.locator('[data-map-layers-popover]');
    if ((await popover.count()) === 0) {
      findings.push({
        kind: 'mapa-camadas-nao-abre',
        severity: 'error',
        detail: 'clicar em Camadas não abriu o popover [data-map-layers-popover]',
      });
      writeRaw('map_layers', { toggles: 0, findings });
      return;
    }

    const toggles = page.locator('[data-map-layers-popover] button[aria-pressed]');
    const n = await toggles.count();
    const det: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = toggles.nth(i);
      const label = ((await t.textContent()) ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) || `toggle #${i}`;
      const antes = await t.getAttribute('aria-pressed');
      const errosAntes = health.pageErrors.length;
      try {
        await t.click({ timeout: 4_000, force: true });
        await page.waitForTimeout(320);
      } catch (err) {
        det.push(`${label}: clique falhou (${err instanceof Error ? err.message.split('\n')[0].slice(0, 60) : ''})`);
        continue;
      }
      const agora = await t.getAttribute('aria-pressed');
      if (antes === agora) det.push(`${label}: clicado mas aria-pressed continuou ${antes}`);
      if (health.pageErrors.length > errosAntes) {
        det.push(`${label}: erro JS ${health.pageErrors[errosAntes].slice(0, 110)}`);
      }
      if ((await page.locator('.leaflet-container').count()) === 0) det.push(`${label}: mapa desapareceu`);
    }

    // O popover fecha com Escape (contrato do próprio componente).
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const fechou = (await page.locator('[data-map-layers-popover]').count()) === 0;
    if (!fechou) det.push('popover de camadas não fechou com Escape');

    findings.push({
      kind: 'mapa-camadas',
      severity: det.length ? 'warn' : 'info',
      detail: `${n} toggle(s) de camada; ${det.length} problema(s)`,
      selector: det.slice(0, 6).join(' | '),
    });
    writeRaw('map_layers', { toggles: n, fechouComEscape: fechou, findings });
  });

  /**
   * O mapa NÃO usa `L.popup`: o painel do spot é um `aside role="complementary"`
   * com `data-map-panel`. A primeira versão deste teste esperava
   * `.leaflet-popup` e por isso dava um falso positivo.
   */
  test('marcador abre o painel do spot e o painel recolhe', async ({ page }) => {
    test.setTimeout(120_000);
    const findings: Finding[] = [];
    await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-marker-icon', { timeout: 30_000 });
    await page.waitForTimeout(1_500);

    const camadas = await page.locator('.leaflet-marker-icon').count();
    let abriuPanel = false;
    let det = '';
    // Clica até 5 marcadores: alguns podem estar sob o painel/controlos.
    for (let i = 0; i < Math.min(5, camadas); i++) {
      const box = await page.locator('.leaflet-marker-icon').nth(i).boundingBox();
      if (!box) continue;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(900);
      if ((await page.locator('[data-map-panel="open"]:visible').count()) > 0) {
        abriuPanel = true;
        det = ((await page.locator('[data-map-panel="open"]').first().textContent()) ?? '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 120);
        break;
      }
    }
    if (!abriuPanel) {
      findings.push({
        kind: 'mapa-marcador-sem-painel',
        severity: 'warn',
        detail: `clicar em 5 de ${camadas} marcadores não abriu [data-map-panel="open"]`,
      });
    } else if (det.length < 10) {
      findings.push({ kind: 'mapa-painel-vazio', severity: 'warn', detail: 'painel do spot sem conteúdo' });
    } else {
      // O painel recolhe pelo seu próprio botão «Recolher painel».
      const botao = page.getByRole('button', { name: /Recolher painel|Collapse/i }).first();
      if ((await botao.count()) > 0) {
        await botao.click();
        await page.waitForTimeout(500);
        if ((await page.locator('[data-map-panel="open"]:visible').count()) > 0) {
          findings.push({
            kind: 'mapa-painel-nao-recolhe',
            severity: 'warn',
            detail: 'botão «Recolher painel» não fechou o painel',
          });
        }
      } else {
        findings.push({ kind: 'mapa-painel-sem-recolher', severity: 'info', detail: 'painel sem botão de recolher' });
      }
    }
    writeRaw('map_popup', { marcadores: camadas, abriuPanel, texto: det, findings });
  });
});

test.describe('MEGA AUDIT — movimento reduzido', () => {
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

  for (const p of ['/pt/', '/pt/mapa/', '/pt/spots/guincho/', '/pt/modalidades/surf/', '/pt/livecams/', '/pt/news/']) {
    test(`${p} sem animação a correr`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(p, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForSelector('html.is-hydrated', { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(1_800);
      const findings = await page.evaluate(collectInvariants, { locale: 'pt', viewport: 'mobile' as const });
      writeRaw(`motion_${p.replace(/[^a-z0-9]+/gi, '_')}`, {
        path: p,
        findings: findings.filter((f) =>
          ['movimento-reduzido', 'animacao-em-curso', 'animacao-infinita'].includes(f.kind),
        ),
      });
    });
  }
});

test.describe('MEGA AUDIT — capturas para revisão humana', () => {
  const SHOTS = [
    '/pt/',
    '/pt/mapa/',
    '/pt/spots/guincho/',
    '/pt/spots/nazare/',
    '/pt/spots/',
    '/pt/modalidades/surf/',
    '/pt/explorar/',
    '/pt/explorar/surf-lisboa/',
    '/pt/news/',
    '/pt/diretorio/',
    '/pt/ferramentas/calculadora-kite/',
    '/pt/compare/',
    '/pt/livecams/',
    '/pt/fontes/',
    '/pt/sazonalidade/',
    '/pt/about/',
  ];

  for (const theme of ['dark', 'light'] as const) {
    for (const vp of [
      { name: '390', width: 390, height: 844 },
      { name: '1440', width: 1440, height: 900 },
    ] as const) {
      test(`capturas ${theme} @${vp.name}`, async ({ page }) => {
        test.setTimeout(300_000);
        await page.context().addInitScript((t: string) => {
          try {
            localStorage.setItem('windspot:theme', t);
          } catch {
            /* sem storage */
          }
        }, theme);
        await page.setViewportSize({ width: vp.width, height: vp.height });

        let escritas = 0;
        for (const p of SHOTS) {
          await page.goto(p, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          await page.waitForSelector('html.is-hydrated', { timeout: 20_000 }).catch(() => undefined);
          await page.waitForTimeout(900);
          const nome = `${theme}-${vp.name}-${p.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')}`;
          const destino = `_audit/mega-2026-09-26/shots/${nome}.png`;
          fs.mkdirSync('_audit/mega-2026-09-26/shots', { recursive: true });
          await page.screenshot({ path: destino, fullPage: true });
          if (fs.existsSync(destino) && fs.statSync(destino).size > 5_000) escritas++;
        }
        expect(escritas, `capturas escritas (de ${SHOTS.length})`).toBe(SHOTS.length);
      });
    }
  }
});
