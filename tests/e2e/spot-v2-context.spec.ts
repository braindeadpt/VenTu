import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { interceptMapHours } from './helpers/conditions';

/**
 * S2C — secções 6–7 da página de spot (docs/design/SPOT-PAGE.md):
 * «No local» · «Chegar e estar» · «Perto daqui» · «Como sabemos».
 *
 * «Perto daqui» lê a hora escolhida do eixo partilhado; nesta worktree a
 * régua da S2A ainda não existe — o índice move-se pelo CustomEvent
 * «ventu:spot-timeline-set» (detail = índice), a mesma convenção da S2B.
 * A S3 pode trocar pelo slider da régua.
 */

const SPOT_SLUG = 'guincho';
const LIVECAM_SLUG = 'moledo';

test.describe('Spot context (S2C)', () => {
  test.use({ serviceWorkers: 'block' });

  test('âncoras §6/§7 existem e «No local» está visível sem interacção', async ({
    page,
  }) => {
    await page.goto(`/pt/spots/${SPOT_SLUG}/`);
    await expect(
      page.getByRole('heading', { level: 1, name: /Guincho/i }),
    ).toBeVisible({ timeout: 20_000 });

    for (const id of ['no-local', 'chegar', 'perto', 'como-sabemos']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }

    const onSite = page.getByRole('group', { name: 'No local' });
    await expect(onSite).toBeVisible();
    // Conteúdo sem interacção: o bloco de avisos resolve sozinho.
    await expect(
      onSite.getByText(/Sem avisos activos|Avisos/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('desktop 1440px: três colunas lado a lado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/pt/spots/${SPOT_SLUG}/`);
    await expect(
      page.getByRole('heading', { level: 1, name: /Guincho/i }),
    ).toBeVisible({ timeout: 20_000 });

    const a = await page.locator('#no-local').boundingBox();
    const b = await page.locator('#chegar').boundingBox();
    const c = await page.locator('#perto').boundingBox();
    expect(a && b && c).toBeTruthy();
    expect(b!.x).toBeGreaterThan(a!.x);
    expect(c!.x).toBeGreaterThan(b!.x);
    // Sem overflow horizontal da página.
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);
  });

  test('mobile 390px: «No local» aberto, restantes em accordion por teclado', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/pt/spots/${SPOT_SLUG}/`);
    await expect(
      page.getByRole('heading', { level: 1, name: /Guincho/i }),
    ).toBeVisible({ timeout: 20_000 });

    const noLocal = page.locator('#no-local details');
    const chegar = page.locator('#chegar details');
    const perto = page.locator('#perto details');
    const comoSabemos = page.locator('#como-sabemos details');

    await expect(noLocal).toHaveAttribute('open', '');
    await expect(chegar).not.toHaveAttribute('open', '');
    await expect(perto).not.toHaveAttribute('open', '');
    await expect(comoSabemos).not.toHaveAttribute('open', '');

    // Teclado: Tab até ao <summary> de «Chegar e estar» e Enter abre-o.
    await chegar.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(chegar).toHaveAttribute('open', '');

    // Conteúdo monta ao abrir (lazy): logística + cards de dicas/perigos.
    await expect(
      chegar.getByRole('heading', { name: 'Logística' }),
    ).toBeVisible();
    await expect(chegar.getByText('Perigos', { exact: true })).toBeVisible();
    await expect(chegar.getByText('Estacionamento', { exact: true })).toBeVisible();

    await perto.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(perto).toHaveAttribute('open', '');
    await expect(perto.getByTestId('nearby-spots')).toBeVisible();

    // Sem overflow horizontal.
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);
  });

  test('livecam é link externo com rel/target correctos', async ({ page }) => {
    await page.goto(`/pt/spots/${LIVECAM_SLUG}/`);
    await expect(
      page.getByRole('heading', { level: 1 }).first(),
    ).toBeVisible({ timeout: 20_000 });

    const link = page.locator('#spot-livecam a[href^="http"]').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = await link.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');

    // S2C-fix: em «No local» o cartão da livecam usa layout="stacked"
    // (botão em largura total, como no mobile) mesmo em desktop.
    await page.setViewportSize({ width: 1440, height: 900 });
    const stacked = page.locator('#spot-livecam [data-layout="stacked"]');
    await expect(stacked).toBeVisible();
    const btn = stacked.locator('a[href^="http"]').first();
    const row = btn.locator('..');
    expect(await row.evaluate((el) => getComputedStyle(el).flexDirection)).toBe(
      'column',
    );
    const [btnBox, rowBox] = await Promise.all([
      btn.boundingBox(),
      row.boundingBox(),
    ]);
    expect(btnBox && rowBox).toBeTruthy();
    // Botão esticado à largura total da linha (tolerância sub-pixel).
    expect(btnBox!.width).toBeGreaterThanOrEqual(rowBox!.width - 1);
  });

  test('avisos costeiros em «No local» têm tone="info" (sem alarme)', async ({
    page,
  }) => {
    await page.goto(`/pt/spots/${SPOT_SLUG}/`);
    await expect(
      page.getByRole('heading', { level: 1, name: /Guincho/i }),
    ).toBeVisible({ timeout: 20_000 });

    const block = page.locator('#no-local [data-testid="coastal-nav-warnings"]');
    await expect(block).toBeVisible({ timeout: 15_000 });
    await expect(block).toHaveAttribute('data-tone', 'info');
    await expect(block).not.toHaveClass(/score-poor/);

    // O background computado não é a tonalidade de alerta (score-poor 6%):
    // lê os canais da var e compara com o backgroundColor real.
    const [bg, poor] = await Promise.all([
      block.evaluate((el) => getComputedStyle(el).backgroundColor),
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--score-poor')
          .trim(),
      ),
    ]);
    const [r, g, b] = poor.split(/\s+/);
    expect(bg).not.toBe(`rgba(${r}, ${g}, ${b}, 0.06)`);
    // Tom neutro: o canal vermelho não domina (alerta seria r≫g,b).
    const m = bg.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThan(Number(m![3]) + 12);
  });

  test('«Perto daqui»: score muda com a hora escolhida (passo ±3 h)', async ({
    page,
  }) => {
    // Ficheiro real com score distinto por passo (10 + i) — qualquer mudança
    // de passo altera o valor lido, sem depender dos dados do dia.
    const real = JSON.parse(
      readFileSync(join(process.cwd(), 'public/data/map-hours.json'), 'utf-8'),
    ) as {
      times: string[];
      spots: Record<string, Record<string, number[]>>;
    };
    const crafted = {
      ...real,
      spots: Object.fromEntries(
        Object.entries(real.spots).map(([id, row]) => [
          id,
          Object.fromEntries(
            Object.entries(row).map(([sport, series]) => [
              sport,
              series.map((_: number, i: number) => 10 + i),
            ]),
          ),
        ]),
      ),
    };
    await interceptMapHours(page, crafted);

    // Dois índices da timeline cujas horas caem em passos diferentes do
    // ficheiro — derivados do forecast real (o mesmo que a página carrega
    // em modo ventu_live).
    const forecast = JSON.parse(
      readFileSync(
        join(process.cwd(), 'public/data/forecasts/guincho.json'),
        'utf-8',
      ),
    ) as Array<{ time: string }>;
    const stepFor = (iso: string) => {
      const key = iso.slice(0, 13);
      let best = 0;
      for (let i = 0; i < real.times.length; i++) {
        if (real.times[i].slice(0, 13) <= key) best = i;
        else break;
      }
      return best;
    };
    let idxA = -1;
    let idxB = -1;
    for (let i = 0; i < forecast.length; i++) {
      if (idxA < 0 && stepFor(forecast[i].time) === 0) idxA = i;
      if (idxA >= 0 && stepFor(forecast[i].time) > stepFor(forecast[idxA].time)) {
        idxB = i;
        break;
      }
    }
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThan(idxA);

    await page.goto(`/pt/spots/${SPOT_SLUG}/`);
    await expect(
      page.getByRole('heading', { level: 1, name: /Guincho/i }),
    ).toBeVisible({ timeout: 20_000 });

    const list = page.getByTestId('nearby-spots');
    await list.scrollIntoViewIfNeeded();
    const firstScore = list.locator('[data-nearby-score]').first();
    await expect(firstScore).not.toHaveText('—', { timeout: 15_000 });

    const setIndex = (i: number) =>
      page.evaluate(
        (n) =>
          document.dispatchEvent(
            new CustomEvent('ventu:spot-timeline-set', { detail: n }),
          ),
        i,
      );

    await setIndex(idxA);
    await expect(firstScore).toHaveText(
      String(10 + stepFor(forecast[idxA].time)),
      { timeout: 10_000 },
    );
    await setIndex(idxB);
    await expect(firstScore).toHaveText(
      String(10 + stepFor(forecast[idxB].time)),
      { timeout: 10_000 },
    );
  });
});
