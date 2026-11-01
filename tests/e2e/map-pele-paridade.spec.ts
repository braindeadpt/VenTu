import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend, openMapLayersMenu } from './helpers/map-setup';
import { interceptMapHours } from './helpers/conditions';
import { waitHydrated } from './helpers/hydration';
import { expandMapHudFilters } from './helpers/map-hud';
import { MAP_PELE_LS_KEY } from '../../src/lib/mapPele';

/**
 * Fase B do /mapa (pele v6 «Atlântico»), PR B0 — harness de paridade.
 *
 * A tabela de paridade do estudo aprovado a 01/11 (58 linhas: «nada se perde
 * quando a pele muda») passa a e2e: cada linha é um passo `#NN` sobre os
 * selectores estáveis do /mapa (`data-map-*`, `aria-*`, roles) e os deep links.
 * TODO o bloco corre duas vezes — com a pele DESLIGADA (o /mapa de hoje) e com
 * `?pele=v6`/localStorage LIGADA — e tem de dar o mesmo resultado nas duas.
 * As PR B1–B9 mudam o visual por baixo destes selectores; este spec é a rede.
 *
 * Linhas que só a implementação muda (⚠ no estudo: 16/49 arcos por ventoRel,
 * 51 nota/10, 53 SUP/wake, 54 cabeçalho, 56 noite na régua) ficam aqui como o
 * contrato de HOJE; a PR que as mudar actualiza o passo no mesmo commit.
 */

type Pele = { nome: 'desligada' | 'v6'; on: boolean };
const PELES: readonly Pele[] = [
  { nome: 'desligada', on: false },
  { nome: 'v6', on: true },
];

// map-hours determinístico (o mesmo desenho do mapa-route #273): 16 passos de 3 h
// ancorados em Lisboa, horas ≡ 2 mod 3 — 08h, 11h e 14h existem em todos os dias.
const lisboa = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  })
    .formatToParts(new Date())
    .filter((x) => x.type !== 'literal')
    .map((x) => [x.type, x.value]),
);
const diaLisboa = (desvio: number) =>
  new Date(Date.UTC(Number(lisboa.year), Number(lisboa.month) - 1, Number(lisboa.day) + desvio))
    .toISOString()
    .slice(0, 10);
const horaAgora = Number(lisboa.hour) % 24;
const recua = (horaAgora - 2 + 24) % 3;
const TIMES_48H = Array.from({ length: 16 }, (_, i) => {
  const total = horaAgora - recua + i * 3;
  const dia = Math.floor(total / 24);
  return `${diaLisboa(dia)}T${String(((total % 24) + 24) % 24).padStart(2, '0')}:00`;
});
/** Guincho: kitesurf 6/10 (×10 no map-hours v6), surf 4/10, em todas as frames. */
const HOURS_STUB = {
  generatedAt: new Date().toISOString(),
  stepHours: 3,
  times: TIMES_48H,
  sports: ['surf', 'kitesurf'],
  spots: {
    guincho: { best: TIMES_48H.map(() => 60), surf: TIMES_48H.map(() => 40), kitesurf: TIMES_48H.map(() => 60) },
  },
};

/** map-hours real com as séries v6 de surf e kite a `null` (frame de noite), como o map-night. */
async function stubNoite(page: Page): Promise<void> {
  await page.route('**/data/map-hours.json', async (route) => {
    const res = await route.fetch();
    const j = (await res.json()) as { spots?: Record<string, Record<string, Array<number | null>>> };
    for (const row of Object.values(j.spots ?? {})) {
      for (const k of ['kitesurf', 'surf']) if (Array.isArray(row[k])) row[k] = row[k].map(() => null);
    }
    await route.fulfill({ response: res, json: j });
  });
}

interface AbreOpts {
  /** valor de `ventu.map.cluster` ('0' = agrupar desligado; omisso = o de origem). */
  cluster?: '0' | '1';
  /** nível gravado (`ventu:map:difficulty`). */
  nivel?: string;
  /** map-hours a usar: o stub determinístico, o real com noite, ou o real. */
  horas?: 'stub' | 'noite' | 'real';
}

/** Erros de hidratação (React #418/#423/#425) vistos na página. */
function vigiaHidratacao(page: Page): string[] {
  const erros: string[] = [];
  const e = (t: string) => {
    if (/#418|#423|#425|[Hh]ydrat/.test(t)) erros.push(t.slice(0, 200));
  };
  page.on('pageerror', (err) => e(String(err?.message ?? err)));
  page.on('console', (m) => {
    if (m.type() === 'error') e(m.text());
  });
  return erros;
}

/**
 * Abre o /mapa com a pele pedida. Ligada = `localStorage['ventu:map:pele']='v6'`
 * (o caminho do `?pele=v6` está nos testes da flag, em baixo). Confirma sempre o
 * estado da flag no contentor: um harness que corresse duas vezes «desligado»
 * passaria a verde sem provar nada.
 */
async function abre(page: Page, pele: Pele, query = '', opts: AbreOpts = {}): Promise<string[]> {
  const erros = vigiaHidratacao(page);
  await preseedWindRingLegend(page);
  await page.addInitScript(
    ({ key, on, cluster, nivel }) => {
      try {
        if (on) localStorage.setItem(key, 'v6');
        else localStorage.removeItem(key);
        if (cluster) localStorage.setItem('ventu.map.cluster', cluster);
        if (nivel) localStorage.setItem('ventu:map:difficulty', nivel);
        localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame: 0 }));
      } catch {
        /* noop */
      }
    },
    { key: MAP_PELE_LS_KEY, on: pele.on, cluster: opts.cluster, nivel: opts.nivel },
  );
  if (opts.horas === 'stub') await interceptMapHours(page, HOURS_STUB);
  if (opts.horas === 'noite') await stubNoite(page);
  await page.goto(`/pt/mapa/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  if (pele.on) {
    await expect(page.locator('[data-pele="v6"]')).toHaveCount(1, { timeout: 10_000 });
    // o cromo do mapa vive DENTRO do âmbito da pele
    await expect(page.locator('[data-pele="v6"] [data-map-fullscreen="true"]')).toHaveCount(1, { timeout: 20_000 });
  } else {
    await expect(page.locator('[data-map-fullscreen="true"]')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator('[data-pele]')).toHaveCount(0);
  }
  return erros;
}

const painel = (page: Page) => page.locator('[data-map-panel="open"]');
const marcador = (page: Page, id: string) => page.locator(`.leaflet-marker-icon.spot-marker[data-spot-id="${id}"]`);

for (const pele of PELES) {
  test.describe(`/mapa — paridade da fase B, pele ${pele.nome}`, () => {
    test.describe.configure({ timeout: 120_000 });
    test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

    test.describe('desktop 1440', () => {
      test.use({ viewport: { width: 1440, height: 900 } });

      test('Explorar: modalidades, contagem, filtros, chips, lista e saltos (#1–#3, #5–#12)', async ({ page }) => {
        const erros = await abre(page, pele, '?sport=all', { cluster: '0' });
        const p = painel(page);
        await test.step('#1 Leaflet: contentor e marcadores de spot', async () => {
          await expect(page.locator('.leaflet-container')).toBeVisible();
          await expect.poll(() => page.locator('.leaflet-marker-icon.spot-marker').count(), { timeout: 30_000 }).toBeGreaterThan(20);
        });
        await test.step('#2 8 modalidades + «Todos» no grupo «Modalidade»', async () => {
          await expect(p).toBeVisible({ timeout: 20_000 });
          const grupo = p.getByRole('group', { name: /Modalidade/ });
          await expect(grupo).toBeVisible();
          await expect(grupo.locator('button[aria-pressed]')).toHaveCount(9);
          await expect(grupo.locator('button[aria-pressed="true"]')).toHaveCount(1);
        });
        await test.step('#3 contagem «N spots nesta vista»', async () => {
          await expect(p.getByText(/\d+ spots nesta vista/)).toBeVisible();
        });
        await test.step('#5 «Agrupar spots» e #6 «Só a bombar» (interruptores com rótulo)', async () => {
          await expect(p.getByRole('switch', { name: 'Agrupar spots' })).toBeVisible();
          await expect(p.getByRole('switch', { name: 'Só a bombar' })).toBeVisible();
          await expect(p.locator('[data-map-only-on-toggle]')).toHaveCount(1);
        });
        await test.step('#7 Região (com «Continente») e #8 Nível', async () => {
          const regiao = p.getByLabel('Região');
          await expect(regiao).toBeVisible();
          await expect(regiao.locator('option', { hasText: 'Continente' })).toHaveCount(1);
          await expect(p.getByLabel('Nível')).toBeVisible();
        });
        await test.step('#9 chip removível + «Limpar» (a modalidade fica)', async () => {
          const modalidade = p.getByRole('group', { name: /Modalidade/ }).locator('button[aria-pressed="true"]');
          const antes = await modalidade.textContent();
          await p.getByLabel('Região').selectOption('Alentejo');
          await expect(p.getByRole('button', { name: 'Remover filtro Alentejo' })).toBeVisible();
          await p.getByRole('button', { name: /Limpar/i }).click();
          await expect(p.getByLabel('Região')).toHaveValue('Todos');
          await expect(modalidade).toHaveText(antes ?? '');
        });
        await test.step('#10 saltos Continente / Açores / Madeira', async () => {
          await expect(p.locator('[data-map-jump]')).toHaveCount(3);
        });
        await test.step('#11 lista sincronizada (linhas com data-spot-id)', async () => {
          await expect.poll(() => p.locator('[role="listbox"] [role="option"][data-spot-id]').count(), { timeout: 20_000 }).toBeGreaterThan(5);
        });
        await test.step('#12 recolher o painel e voltar', async () => {
          await page.getByRole('button', { name: 'Recolher painel' }).click();
          await expect(page.locator('[data-map-panel="rail"]')).toBeVisible();
          await page.getByRole('button', { name: /Abrir lista/i }).click();
          await expect(painel(page)).toBeVisible();
        });
        expect(erros, 'sem erros de hidratação').toEqual([]);
      });

      test('clusters «+N» com a melhor nota (#4)', async ({ page }) => {
        await abre(page, pele, '?sport=all', { cluster: '1' });
        await expect.poll(() => page.locator('[data-v3spot]').count(), { timeout: 30_000 }).toBeGreaterThan(0);
        await expect(page.locator('.v3more').first()).toBeVisible({ timeout: 20_000 });
        const grupos = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('.v3more')).map((el) => {
            const host = el.closest<HTMLElement>('[data-v3spot]');
            const ids = (el.dataset.v3members ?? '').split(',').filter(Boolean);
            const notas = ids.map((id) =>
              Number(document.querySelector<HTMLElement>(`[data-v3spot="${CSS.escape(id)}"]`)?.dataset.spotScore),
            );
            return { nota: Number(host?.dataset.spotScore), notas, badge: (el.textContent ?? '').trim(), n: ids.length };
          }),
        );
        expect(grupos.length).toBeGreaterThan(0);
        for (const g of grupos) {
          const numericas = g.notas.filter((x) => Number.isFinite(x));
          if (numericas.length && Number.isFinite(g.nota)) expect(g.nota).toBe(Math.max(...numericas));
          expect(g.badge).toBe(`+${g.n - 1}`);
        }
      });

      test('Vento | Ondulação | Nenhum, traços, arcos e «Como ler o vento» (#13, #14, #16, #29, #49, #58)', async ({ page }) => {
        await abre(page, pele, '?sport=kitesurf&wind=1', { cluster: '0' });
        await test.step('#13 selector Vento | Ondulação | Nenhum', async () => {
          const sw = page.locator('[data-map-sea-mode]').first();
          await expect(sw).toBeAttached({ timeout: 20_000 });
          await expect(sw.locator('[data-map-sea-mode-option]')).toHaveCount(3);
        });
        await test.step('#14/#58 traços de vento sobre a grelha assíncrona (o atributo chega depois)', async () => {
          await expect(page.locator('[data-map-wind="true"]')).toHaveCount(1, { timeout: 15_000 });
          await expect(page.locator('.leaflet-container')).toHaveAttribute('data-map-windfield', 'true', { timeout: 20_000 });
        });
        await test.step('#29 botão Vento na pilha (aria-pressed)', async () => {
          const b = page.locator('[data-map-wind-toggle]');
          await expect(b).toBeVisible();
          await expect(b).toHaveAttribute('aria-pressed', /true|false/);
        });
        await test.step('#16/#49 arcos do vento nos pins + «Como ler o vento»', async () => {
          await expect.poll(() => page.locator('.ventu-wind-ring, .ventu-wind-wedge, [data-wind-tick]').count(), { timeout: 20_000 }).toBeGreaterThan(0);
          await page.getByRole('button', { name: /Como ler o vento no mapa/i }).first().click();
          await expect(page.getByRole('dialog', { name: /Ler o vento no mapa/i })).toBeVisible({ timeout: 10_000 });
        });
      });

      test('régua de 48 h e pill da hora (#17, #18, #56)', async ({ page }) => {
        await abre(page, pele, '?sport=kitesurf&hours=1', { horas: 'stub', cluster: '0' });
        await test.step('#18 pill «Agora» / «dia hh:00»', async () => {
          const pill = page.locator('[data-map-time-pill]').first();
          await expect(pill).toBeVisible({ timeout: 20_000 });
          await expect(pill).toHaveText(/Agora|\d{1,2}:\d{2}|\d{1,2}h/);
        });
        await test.step('#17/#56 16 passos, play e «Agora» (range invisível e data-map-hours-* intactos)', async () => {
          const track = page.locator('[data-map-time-track-mode="hours"]');
          await expect(track).toBeVisible({ timeout: 15_000 });
          const range = page.locator('[data-map-hours-scrubber] input[type="range"]');
          await expect(range).toHaveAttribute('max', '15');
          await expect(page.locator('[data-map-hours-play]').first()).toBeAttached();
          await range.fill('3');
          await expect(range).toHaveValue('3');
          await page.locator('[data-map-hours-now]').first().click();
          await expect(range).toHaveValue('0');
        });
      });

      test('pilha, menu Camadas, limite de 2 raster e legendas (#20–#28, #30, #31)', async ({ page }) => {
        await abre(page, pele, '?sport=all', { cluster: '0' });
        const stack = page.locator('[data-map-control-stack]');
        await test.step('#27 zoom +/− (pointer:fine), #28 localizar, #31 partilhar', async () => {
          await expect(stack).toBeVisible({ timeout: 20_000 });
          await expect(stack).toHaveAttribute('role', 'toolbar');
          for (const sel of ['[data-map-zoom-in]', '[data-map-zoom-out]', '[data-map-locate]', '[data-map-share]', '[data-map-layers-menu]']) {
            await expect(stack.locator(sel).first(), sel).toBeVisible();
          }
        });
        await test.step('#30 legenda (bandas) abre e fecha', async () => {
          await stack.locator('[data-map-legend-toggle]').click();
          await expect(page.locator('[data-map-legend-card]').first()).toBeVisible();
          await stack.locator('[data-map-legend-toggle]').click();
        });
        await openMapLayersMenu(page);
        const pop = page.locator('[data-map-layers-popover="true"]');
        await test.step('#20 Base Mapa / Satélite (rádio com aria-checked)', async () => {
          await expect(pop).toBeVisible({ timeout: 15_000 });
          await expect(pop.locator('[data-map-basemap-radio="map"]')).toHaveAttribute('aria-checked', 'true');
          await expect(pop.locator('[data-map-basemap-radio="satellite"]')).toHaveAttribute('aria-checked', 'false');
          for (const g of ['Base', 'Tempo', 'Mar', 'Navegação']) await expect(pop.getByText(g, { exact: true }).first()).toBeVisible();
        });
        await test.step('#21 Tempo (48 h, radar, satélite IR), #22 Mar (SST, correntes), #23 Navegação, #24 tempestades e áreas', async () => {
          for (const t of [
            'hours', 'radar', 'goes-ir', 'sst', 'currents', 'buoys', 'nautical-chart', 'coastal-warnings', 'storms', 'warn-areas',
          ]) {
            await expect(pop.locator(`[data-map-${t}-toggle]`).first(), t).toBeAttached();
          }
        });
        await test.step('#25 limite de 2 raster pesadas (a 3.ª desliga a mais antiga, com toast) e #26 mini-legenda', async () => {
          await pop.locator('[data-map-nautical-chart-toggle]').click();
          await expect(pop.locator('[data-map-nautical-chart-toggle]')).toHaveAttribute('aria-pressed', 'true');
          await expect(pop.locator('[data-map-layer-minilegend="nauticalChart"]')).toBeVisible();
          await pop.locator('[data-map-goes-ir-toggle]').click();
          await expect(pop.locator('[data-map-goes-ir-toggle]')).toHaveAttribute('aria-pressed', 'true');
          await pop.locator('[data-map-radar-toggle]').click();
          await expect(pop.locator('[data-map-radar-toggle]')).toHaveAttribute('aria-pressed', 'true');
          await expect(page.getByText(/Carta náutica — camada desligada para manter o mapa fluido/)).toBeVisible({ timeout: 10_000 });
          await expect(pop.locator('[data-map-nautical-chart-toggle]')).toHaveAttribute('aria-pressed', 'false');
        });
      });

      test('cabeçalho, atribuição, pesquisa e rodapé (#37–#39, #42, #54)', async ({ page }) => {
        await abre(page, pele, '?sport=all', { cluster: '0' });
        await test.step('#38/#54 cabeçalho do /mapa e o shell colado a ele até ao fundo', async () => {
          const geo = await page.evaluate(() => {
            const h = document.querySelector('header.site-header')?.getBoundingClientRect();
            const m = document.querySelector('[data-map-fullscreen="true"]')?.getBoundingClientRect();
            return h && m ? { hb: Math.round(h.bottom), top: Math.round(m.top), bottom: Math.round(m.bottom), vh: innerHeight } : null;
          });
          expect(geo).not.toBeNull();
          expect(Math.abs(geo!.top - geo!.hb)).toBeLessThanOrEqual(1);
          expect(geo!.bottom).toBe(geo!.vh);
        });
        await test.step('#37 atribuição: uma superfície, à direita do painel', async () => {
          const attr = page.locator('.leaflet-control-attribution');
          await expect(attr).toBeVisible({ timeout: 15_000 });
          await expect(attr).toContainText('OpenStreetMap');
        });
        await test.step('#39 pesquisa no cabeçalho', async () => {
          await expect(page.getByRole('banner').getByRole('button', { name: /Pesquisar/i }).first()).toBeVisible();
        });
        await test.step('#42 rodapé escondido (scroll lock)', async () => {
          expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
          const visivel = await page.evaluate(() => {
            const f = document.querySelector('footer');
            return f ? f.getBoundingClientRect().top < innerHeight : false;
          });
          expect(visivel).toBe(false);
        });
      });

      test('nível com tecto por modalidade + pré-visualização do spot (#8, #33, #44, #55, #57)', async ({ page }) => {
        await abre(page, pele, '?sport=kitesurf', { nivel: 'intermediate', cluster: '0' });
        const p = painel(page);
        await test.step('#55 o nível vem do localStorage', async () => {
          await expect(p.getByLabel('Nível')).toHaveValue('intermediate', { timeout: 20_000 });
        });
        await test.step('#44 tecto por modalidade: Guincho (kite = avançado) fica fora «até intermédio»', async () => {
          await expect.poll(() => p.locator('[role="option"][data-spot-id]').count(), { timeout: 20_000 }).toBeGreaterThan(0);
          await expect(p.locator('[role="option"][data-spot-id="guincho"]')).toHaveCount(0);
          await expect(marcador(page, 'guincho')).toHaveCount(0);
        });
        await test.step('#44 em surf (base intermédio) o Guincho volta', async () => {
          await p.getByRole('group', { name: /Modalidade/ }).getByRole('button', { name: /^Surf$/ }).click();
          await expect(p.locator('[role="option"][data-spot-id="guincho"]')).toHaveCount(1, { timeout: 15_000 });
        });
        await test.step('#33/#57 pré-visualização do spot, etiqueta de nível pela modalidade', async () => {
          await p.getByLabel('Nível').selectOption('all');
          await page.goto('/pt/mapa/?sport=kitesurf&spot=guincho', { waitUntil: 'domcontentloaded' });
          await waitHydrated(page);
          const card = page.locator('[data-testid="map-spot-card"]');
          await expect(card).toBeVisible({ timeout: 20_000 });
          await expect(card).toHaveAttribute('data-spot-id', 'guincho');
          await expect(card.getByRole('link', { name: /Ver spot/i })).toBeVisible();
          await expect(card).toContainText(/Avançado/i);
        });
      });

      test('noite: pin, cluster, lista e pré-visualização (#43, #45, #46)', async ({ page }) => {
        await abre(page, pele, '?hours=1&sport=surf', { horas: 'noite', cluster: '0' });
        await test.step('#43 pin de noite sem número, aria «noite, sem nota»', async () => {
          const m = marcador(page, 'nazare');
          await expect(m.locator('[data-spot-night="true"]')).toBeAttached({ timeout: 20_000 });
          await expect(m.locator('[data-spot-score]')).toHaveCount(0);
          await expect(m).toHaveAttribute('aria-label', 'Nazaré · noite, sem nota');
        });
        await test.step('#46 lista: «noite» no fim', async () => {
          const p = painel(page);
          const row = p.locator('[role="option"][data-spot-id="nazare"]');
          await row.scrollIntoViewIfNeeded();
          await expect(row.locator('[data-row-night="true"]')).toHaveText('noite', { timeout: 15_000 });
          const kinds = await p
            .locator('[role="listbox"] [role="option"]')
            .evaluateAll((els) => els.map((r) => (r.querySelector('[data-row-night]') ? 'n' : 's')).join(''));
          expect(kinds).toMatch(/^s*n*$/);
        });
        await test.step('#33 pré-visualização de noite: «noite» no lugar da nota', async () => {
          await marcador(page, 'nazare').click();
          await expect(page.locator('[data-card-night="true"]')).toHaveText('noite', { timeout: 15_000 });
          await expect(page.locator('[data-card-score]')).toHaveCount(0);
        });
        await test.step('#45 agrupado: grupos todo-noite sem número; mistos com o melhor numérico', async () => {
          await page.evaluate(() => localStorage.setItem('ventu.map.cluster', '1'));
          await page.reload({ waitUntil: 'domcontentloaded' });
          await waitHydrated(page);
          await expect.poll(() => page.locator('[data-v3spot]').count(), { timeout: 30_000 }).toBeGreaterThan(0);
          const grupos = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLElement>('.v3more')).map((el) => {
              const host = el.closest<HTMLElement>('.leaflet-marker-icon');
              return { noite: !!host?.querySelector('[data-spot-night]'), score: host?.querySelector('[data-spot-score]') ? 1 : 0 };
            }),
          );
          for (const g of grupos) expect(g.noite && g.score, 'grupo com noite E nota').toBeFalsy();
        });
      });

      test('motor único e map-hours ×10; SUP no motor antigo (#50, #51, #53)', async ({ page }) => {
        await abre(page, pele, '?sport=kitesurf&hours=1&lat=38.73&lon=-9.47&z=11', { horas: 'stub', cluster: '0' });
        await test.step('#50/#51 o marcador lê o map-hours v6 (60 = 6/10)', async () => {
          await expect(marcador(page, 'guincho').locator('[data-spot-score]')).toHaveAttribute('data-spot-score', '60', { timeout: 20_000 });
        });
        await test.step('#53 SUP: escala antiga, nunca noite', async () => {
          await painel(page).getByRole('group', { name: /Modalidade/ }).getByRole('button', { name: /^SUP$/ }).click();
          await expect.poll(() => page.locator('.leaflet-marker-icon.spot-marker').count(), { timeout: 20_000 }).toBeGreaterThan(0);
          await expect(page.locator('.leaflet-marker-icon.spot-marker [data-spot-night]')).toHaveCount(0);
        });
      });

      test('deep links (#36): ?t&dia, ?spot&de=home, ?basemap=sat, ?swell, ?radar, ?sst, ?currents, ?buoys, ?nauticalChart (#15, #47, #48, #52)', async ({ page }) => {
        await test.step('#47 ?t=10&dia=1 chega na frame de amanhã às 11h', async () => {
          const amanha11 = TIMES_48H.indexOf(`${diaLisboa(1)}T11:00`);
          await abre(page, pele, '?sport=kitesurf&t=10&dia=1&lat=39.35&lon=-8.95&z=7', { horas: 'stub' });
          await expect(page.locator('[data-map-hours-scrubber] input[type="range"]')).toHaveValue(String(amanha11), { timeout: 15_000 });
        });
        await test.step('#48 ?spot=guincho&de=home abre a pré-visualização', async () => {
          await page.goto(`/pt/mapa/?sport=kitesurf&spot=guincho&de=home`, { waitUntil: 'domcontentloaded' });
          await waitHydrated(page);
          await expect(page.locator('[data-testid="map-spot-card"]')).toHaveAttribute('data-spot-id', 'guincho', { timeout: 20_000 });
        });
        await test.step('#52/#20 ?basemap=sat (máscara do oceano só no satélite)', async () => {
          await page.goto('/pt/mapa/?basemap=sat', { waitUntil: 'domcontentloaded' });
          await waitHydrated(page);
          await expect(page.locator('.leaflet-container')).toHaveAttribute('data-basemap', 'satellite', { timeout: 15_000 });
        });
        await test.step('#15 ?swell=1 liga a Ondulação (e desliga o vento)', async () => {
          await page.goto('/pt/mapa/?swell=1', { waitUntil: 'domcontentloaded' });
          await waitHydrated(page);
          await expect(page.locator('[data-map-sea-mode-option][aria-checked="true"], [data-map-sea-mode-option][aria-pressed="true"]').first()).toHaveAttribute('data-map-sea-mode-option', 'swell', { timeout: 15_000 });
        });
        await test.step('#21–#23 ?radar ?sst ?currents ?buoys ?nauticalChart ligam os toggles', async () => {
          await page.goto('/pt/mapa/?sst=1&buoys=1&nauticalChart=1', { waitUntil: 'domcontentloaded' });
          await waitHydrated(page);
          await openMapLayersMenu(page);
          const pop = page.locator('[data-map-layers-popover="true"]');
          for (const t of ['sst', 'buoys', 'nautical-chart']) {
            await expect(pop.locator(`[data-map-${t}-toggle]`).first(), t).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
          }
          await page.goto('/pt/mapa/?radar=1&currents=1', { waitUntil: 'domcontentloaded' });
          await waitHydrated(page);
          await openMapLayersMenu(page);
          for (const t of ['radar', 'currents']) {
            await expect(pop.locator(`[data-map-${t}-toggle]`).first(), t).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
          }
        });
        await test.step('a pele mantém-se em todas as navegações', async () => {
          if (pele.on) await expect(page.locator('[data-pele="v6"]')).toHaveCount(1);
          else await expect(page.locator('[data-pele]')).toHaveCount(0);
        });
      });
    });

    test.describe('telemóvel 390', () => {
      test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

      test('folha Explorar, «Melhor agora», filtros, folha do spot e sair (#19, #32, #34, #35, #40, #41)', async ({ page }) => {
        await abre(page, pele, '?sport=all');
        const sheet = page.locator('[data-explore-sheet]');
        await test.step('#35 peek com «Melhor agora» e «Mostrar filtros»', async () => {
          await expect(sheet).toHaveAttribute('data-explore-sheet', /peek|half/, { timeout: 20_000 });
          await expect(page.locator('[data-sheet-best]')).toBeVisible({ timeout: 20_000 });
        });
        await test.step('#35 filtros no estado half (modalidade, região, nível)', async () => {
          await expandMapHudFilters(page);
          const half = page.locator('[data-sheet-half]');
          await expect(half.getByLabel('Região')).toBeVisible();
          await expect(half.getByLabel('Nível')).toBeVisible();
        });
        await test.step('#19 chips de maré/brisa só no desktop', async () => {
          await expect(page.locator('[data-map-tide-chip]:visible')).toHaveCount(0);
        });
        await test.step('#32 «Sair do ecrã inteiro»', async () => {
          await expect(page.getByRole('button', { name: /Sair do ecrã inteiro/i }).first()).toBeAttached();
        });
        await test.step('#40/#41 idioma e entrar na gaveta do cabeçalho', async () => {
          await page.locator('button[aria-controls="mobile-nav"]').click();
          const nav = page.locator('#mobile-nav');
          await expect(nav).toBeVisible();
          await expect(nav.locator('select').first()).toBeAttached();
          await expect(nav.getByText(/Entrar/).first()).toBeAttached();
          await page.keyboard.press('Escape');
        });
        await test.step('#34 ?spot=guincho abre a folha do spot', async () => {
          await page.goto('/pt/mapa/?sport=kitesurf&spot=guincho&de=home', { waitUntil: 'domcontentloaded' });
          await waitHydrated(page);
          const s = page.locator('[data-testid="map-spot-sheet"]');
          await expect(s).toBeVisible({ timeout: 20_000 });
          await expect(s).toContainText('Guincho');
        });
      });
    });
  });
}

/**
 * A flag em si: `?pele=v6` liga e grava, sem parâmetro vale o gravado, qualquer
 * outro `?pele=` desliga e apaga. Desligada: nenhuma fonte Barlow pedida, nenhum
 * atributo, nenhum token. Ligada: tokens v6 e Barlow só no âmbito do /mapa.
 */
test.describe('/mapa — flag da pele v6 (B0)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('desligada por omissão: sem atributo, sem tokens, sem fontes Barlow, sem #418', async ({ page }) => {
    const fontes: string[] = [];
    page.on('request', (r) => {
      if (/\/fonts\/barlow\//.test(r.url())) fontes.push(r.url());
    });
    const erros = await abre(page, { nome: 'desligada', on: false }, '?sport=all');
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    const t = await page.evaluate(() => {
      const el = document.querySelector('[data-map-fullscreen="true"]') as HTMLElement | null;
      const cs = el ? getComputedStyle(el) : null;
      return { abismo: cs?.getPropertyValue('--abismo').trim() ?? '', font: cs?.fontFamily ?? '' };
    });
    expect(t.abismo).toBe('');
    expect(t.font).not.toMatch(/Barlow/);
    expect(fontes, 'nenhuma fonte Barlow com a pele desligada').toEqual([]);
    expect(erros).toEqual([]);
  });

  test('?pele=v6 liga, grava e aplica tokens + Barlow só no /mapa; ?pele=0 desliga e apaga', async ({ page }) => {
    const erros = vigiaHidratacao(page);
    await preseedWindRingLegend(page);
    await page.goto('/pt/mapa/?pele=v6&sport=all', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await waitHydrated(page);
    const c = page.locator('[data-pele="v6"]');
    await expect(c).toHaveCount(1, { timeout: 10_000 });
    expect(await page.evaluate((k) => localStorage.getItem(k), MAP_PELE_LS_KEY)).toBe('v6');

    const tok = await c.evaluate((el) => {
      const cs = getComputedStyle(el);
      const v = (n: string) => cs.getPropertyValue(n).trim().toUpperCase();
      return {
        abismo: v('--abismo'), fundo: v('--fundo'), mar: v('--mar'), linha: v('--linha'), espuma: v('--espuma'),
        nevoa: v('--nevoa'), sol: v('--sol'), gelo: v('--gelo'),
        nao: v('--b-nao'), fraco: v('--b-fraco'), da: v('--b-da'), bom: v('--b-bom'), mb: v('--b-mb'), noite: v('--b-noite'),
        font: cs.fontFamily,
      };
    });
    expect(tok).toMatchObject({
      abismo: '#030E18', fundo: '#071B2C', mar: '#0C2A42', linha: '#1E4361', espuma: '#F3F8FB',
      nevoa: '#A9C2D4', sol: '#FFC93C', gelo: '#7FE7FF',
      nao: '#A8464A', fraco: '#4479EE', da: '#C99E2A', bom: '#40DCD0', mb: '#FFF07A', noite: '#56677B',
    });
    expect(tok.font).toMatch(/^"?Barlow"?/);
    // a fonte chega (auto-alojada) e o cromo do mapa usa-a
    await expect
      .poll(() => page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check('600 16px Barlow');
      }), { timeout: 15_000 })
      .toBe(true);
    const shellFont = await page.locator('[data-map-fullscreen="true"]').evaluate((el) => getComputedStyle(el).fontFamily);
    expect(shellFont).toMatch(/Barlow/);
    // o cabeçalho do site fica fora do âmbito (B8)
    const headerFont = await page.locator('header.site-header').evaluate((el) => getComputedStyle(el).fontFamily);
    expect(headerFont).not.toMatch(/Barlow/);

    // sem parâmetro: lembra-se
    await page.goto('/pt/mapa/?sport=all', { waitUntil: 'domcontentloaded' });
    await waitHydrated(page);
    await expect(page.locator('[data-pele="v6"]')).toHaveCount(1, { timeout: 10_000 });

    // ?pele=0: desliga e apaga
    await page.goto('/pt/mapa/?pele=0&sport=all', { waitUntil: 'domcontentloaded' });
    await waitHydrated(page);
    await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
    await expect(page.locator('[data-pele]')).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), MAP_PELE_LS_KEY)).toBeNull();
    expect(erros).toEqual([]);
  });

  test('a pele não sai do /mapa: a home e uma página de spot ficam como estão', async ({ page }) => {
    await page.addInitScript((k) => localStorage.setItem(k, 'v6'), MAP_PELE_LS_KEY);
    await page.goto('/pt/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitHydrated(page);
    await expect(page.locator('[data-pele]')).toHaveCount(0);
  });
});
