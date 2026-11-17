import { test, expect, type Page } from '@playwright/test';
import { interceptWarnings, readRealConditions } from './helpers/conditions';
import { installSupabaseSignedIn } from './helpers/supabase-mock';

/**
 * #459 V1 — a página de spot v6 é sempre escura: com o tema claro do site
 * (ventu-theme=light → html.theme-ocean) a faixa de segurança, as acções e o
 * rodapé continuam na pele v6, com contraste AA e algarismos tabulares.
 */

const SEA_STATE = {
  areaCode: 'LRA',
  areaLabel: 'Leiria',
  type: 'Agitação Marítima',
  level: 'orange',
  text: 'Ondulação de oeste com 4 a 5 metros',
  relevant: true,
  endTime: new Date(Date.now() + 12 * 3_600_000).toISOString(),
};

function warningsAllSeaState(): Record<string, unknown> {
  const spotWarnings: Record<string, unknown> = {};
  for (const id of Object.keys(readRealConditions())) spotWarnings[id] = [SEA_STATE];
  return { source: 'ipma', fetchedAt: new Date().toISOString(), warnings: [SEA_STATE], spotWarnings };
}

async function temaClaro(page: Page) {
  await page.addInitScript(() => {
    try {
      document.cookie = 'ventu-theme=light;path=/;max-age=31536000;samesite=lax';
      localStorage.setItem('windspot:theme', 'light');
    } catch {
      /* storage desligado */
    }
  });
}

/** Contraste WCAG entre a cor do texto e o primeiro fundo opaco por trás (mistura alfa). */
async function contrasteDe(page: Page, seletor: string): Promise<number> {
  return page.locator(seletor).first().evaluate((el) => {
    const rgba = (s: string) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const camadas: number[][] = [];
    let n: Element | null = el;
    while (n) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) camadas.push(c);
      if (c[3] >= 1) break;
      n = n.parentElement;
    }
    let fundo = [255, 255, 255];
    for (const c of camadas.reverse()) fundo = fundo.map((v, i) => c[i] * c[3] + v * (1 - c[3]));
    const t = rgba(getComputedStyle(el).color);
    const texto = fundo.map((v, i) => t[i] * t[3] + v * (1 - t[3]));
    const lum = (x: number[]) => {
      const c = x.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const [a, b] = [lum(texto), lum(fundo)].sort((p, q) => q - p);
    return (a + 0.05) / (b + 0.05);
  });
}

test.describe('Spot v6 em tema claro (#459 V1)', () => {
  test.use({ serviceWorkers: 'block' });

  test('faixa de segurança, acções e rodapé na pele v6', async ({ page }) => {
    await temaClaro(page);
    await interceptWarnings(page, warningsAllSeaState());
    await page.goto('/pt/spots/nazare/');
    await expect(page.locator('html')).toHaveClass(/theme-ocean/);

    const faixa = page.locator('.v6 [data-faixa=perigo]');
    await expect(faixa).toBeVisible({ timeout: 20_000 });
    await expect(faixa).toHaveAttribute('data-nivel', 'orange');
    expect(await contrasteDe(page, '.v6 [data-faixa=perigo] [data-faixa-t]')).toBeGreaterThanOrEqual(4.5);
    expect(await contrasteDe(page, '.v6 [data-faixa=perigo] [data-faixa-meta]')).toBeGreaterThanOrEqual(4.5);
    expect(await contrasteDe(page, '.v6 [data-faixa-nivel]')).toBeGreaterThanOrEqual(4.5);
    const fonte = await faixa.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fonte).toContain('Barlow');

    const acoes = page.getByTestId('spot-acoes');
    await acoes.scrollIntoViewIfNeeded();
    expect(await contrasteDe(page, '.v6 .acoes .acao-mais button[aria-haspopup]')).toBeGreaterThanOrEqual(4.5);

    // pill compacta «Laranja» na régua: texto AA — o fill da banda fica para fills
    const pilula = page.locator('.v6 [data-map-warning=compact]');
    await expect(pilula).toBeVisible();
    await expect(pilula).toHaveAttribute('data-ipma-nivel', 'orange');
    expect(await contrasteDe(page, '.v6 [data-map-warning=compact]')).toBeGreaterThanOrEqual(4.5);

    const num = await page.locator('.v6 .r-cab output').first().evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(num).toContain('tabular-nums');

    const rodape = page.locator('[data-site-footer]');
    const fundoRodape = await rodape.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fundoRodape).toBe('rgb(3, 14, 24)');
  });

  test('popovers das acções abrem e ficam legíveis (estilos renderizados)', async ({ page }) => {
    await temaClaro(page);
    await installSupabaseSignedIn(page);
    await page.goto('/pt/spots/nazare/');
    const acoes = page.getByTestId('spot-acoes');
    await acoes.scrollIntoViewIfNeeded();

    // «Mais»: partilhar + check-in dentro do popover sólido
    await page.locator('.v6 .acoes .acao-mais button[aria-haspopup]').click();
    const mais = page.locator('.v6 .acoes .acao-mais [role=group]');
    await expect(mais).toBeVisible();
    expect(await mais.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 27, 44)');
    expect(await contrasteDe(page, '.v6 .acoes .acao-mais [role=group] .text-fg')).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');
    await expect(mais).toBeHidden();

    // «Alerta-me»: o diálogo abre com sessão; o erro de gravação renderiza a tinta AA
    await page.locator('.v6 .acoes .acao-alerta > div > button').click();
    const alerta = page.locator('.v6 .acoes .acao-alerta [role=dialog]');
    await expect(alerta).toBeVisible();
    expect(await alerta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 27, 44)');
    expect(await contrasteDe(page, '.v6 .acoes .acao-alerta [role=dialog] p')).toBeGreaterThanOrEqual(4.5);
    // o stub de teste não implementa rpc — gravar falha e o erro real aparece
    await alerta.getByRole('button').last().click();
    const erro = alerta.locator('p.text-score-poor');
    await expect(erro).toBeVisible();
    expect(await contrasteDe(page, '.v6 .acoes .acao-alerta [role=dialog] p.text-score-poor')).toBeGreaterThanOrEqual(4.5);
  });
});
