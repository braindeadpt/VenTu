import { test, expect, type Page } from '@playwright/test';
import { installSupabaseMock } from './helpers/supabase-mock';
import { waitHydrated } from './helpers/hydration';

/**
 * Guarda do contrato de DIÁLOGO MODAL do `LoginModal` (achado A1 da mega
 * audit de 2026-09-26).
 *
 * O elemento declara `role="dialog" aria-modal="true"` — o que AFIRMA ao leitor
 * de ecrã que o resto da página está inerte. Medido antes do fix: o foco ficava
 * no botão que abria (fora do diálogo), 8 `Tab` seguidos saíam todos para a
 * página por trás e `Escape` não fechava (único de 32 diálogos do produto).
 *
 * Estes quatro testes são o contrato mínimo que `aria-modal="true"` promete:
 *   1. o foco entra no diálogo (primeiro campo);
 *   2. `Tab`/`Shift+Tab` ficam presos lá dentro (10 voltas cada);
 *   3. `Escape` fecha e devolve o foco ao botão que abriu;
 *   4. o fundo fica bloqueado (scroll) enquanto o diálogo está aberto.
 */

const EMAIL = '#login-email';

async function openLogin(page: Page) {
  await installSupabaseMock(page);
  await page.goto('/pt/favorites/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await waitHydrated(page);
  const trigger = page.getByRole('button', { name: /Entrar com magic link/i }).first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return { dialog, trigger };
}

async function focusInsideDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    return dialog.contains(document.activeElement);
  });
}

test.describe('LoginModal — contrato de modal (aria-modal deixa de mentir)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ao abrir, o foco entra no diálogo (primeiro campo)', async ({ page }) => {
    const { dialog } = await openLogin(page);
    await expect(dialog.locator(EMAIL)).toBeVisible();
    await expect(page.locator(EMAIL)).toBeFocused();
    expect(await focusInsideDialog(page)).toBe(true);
  });

  test('10 Tab e 10 Shift+Tab mantêm o foco dentro do diálogo', async ({ page }) => {
    const { dialog } = await openLogin(page);

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInsideDialog(page), `Tab #${i + 1} saiu do diálogo`).toBe(true);
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInsideDialog(page), `Shift+Tab #${i + 1} saiu do diálogo`).toBe(true);
    }

    await expect(dialog).toBeVisible();
  });

  test('Escape fecha e devolve o foco ao botão que abriu', async ({ page }) => {
    const { trigger } = await openLogin(page);

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('o fundo fica bloqueado enquanto o diálogo está aberto', async ({ page }) => {
    await openLogin(page);

    // O efeito de bloqueio corre na commit seguinte ao render: com `poll`
    // espera-se pelo estado observável, sem apostar no timing.
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.body).overflow))
      .toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Ao fechar, o scroll do documento volta ao que era (nenhum `inert`/overflow a sobrar).
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.body).overflow))
      .not.toBe('hidden');
  });
});
