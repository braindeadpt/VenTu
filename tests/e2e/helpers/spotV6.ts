import { expect, type Page } from '@playwright/test';
import { alignClockToForecast } from './conditions';

/**
 * Página de spot v6 «Atlântico» (#184) — sondas partilhadas pelas specs que
 * antes mediam o herói, a barra unificada e a régua antigos.
 *
 *  - veredicto: `#agora` (SpotHero) com a Nota `role="meter"` (0–10);
 *  - régua: `[data-testid="regua-48h"]` com o `role="slider"`; fixa em baixo
 *    no telemóvel, sticky no topo no desktop (≥ 1024 px);
 *  - acções: `[data-testid="spot-acoes"]` (linha própria por baixo do Porquê e
 *    da praia em 3D).
 */
export const SPOT_URL = '/pt/spots/guincho/';

export async function openSpotV6(
  page: Page,
  { url = SPOT_URL, name = /Guincho/i, alinhar = true }: { url?: string; name?: RegExp; alinhar?: boolean } = {},
) {
  if (alinhar) await alignClockToForecast(page);
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('slider')).toBeVisible({ timeout: 20_000 });
  await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
  // Montado: a raiz v6 ganha `.vivo` depois de ler o relógio real e a URL.
  await page.waitForSelector('[data-testid="spot-v6"].vivo', { timeout: 20_000 });
}

export const slider = (page: Page) => page.getByRole('slider');
/** Nota do veredicto (só existe de dia; de noite é a lua, `role="img"`). */
export const meter = (page: Page) => page.locator('#agora').getByRole('meter');
export const reguaHora = (page: Page) => page.getByTestId('regua-hora');

/** Nota que a régua anuncia para a hora escolhida («…, 7 em 10»). */
export function notaDoValueText(vt: string | null): number {
  const m = (vt ?? '').match(/(\d{1,2}) (?:em|in|out of) 10/);
  return m ? Number(m[1]) : Number.NaN;
}

/** Hora escolhida (raiz v6) e índice da régua. */
export async function horaEscolhida(page: Page) {
  return page.evaluate(() => {
    const raiz = document.querySelector('[data-testid="spot-v6"]') as HTMLElement | null;
    const s = raiz?.querySelector('[role="slider"]');
    return { hora: raiz?.dataset.hora ?? null, i: Number(s?.getAttribute('aria-valuenow')) };
  });
}

export const overlaps = (rects: { left: number; right: number }[], minGap = 0): [number, number][] => {
  const bad: [number, number][] = [];
  for (let i = 1; i < rects.length; i++) {
    if (rects[i].left < rects[i - 1].right + minGap) bad.push([i - 1, i]);
  }
  return bad;
};

/** Rects das etiquetas VISÍVEIS do eixo da régua (6h só no desktop). */
export async function axisRects(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="regua-48h"] .eixo span'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, w: r.width, text: el.textContent ?? '' };
      })
      .filter((r) => r.w > 0)
      .sort((a, b) => a.left - b.left),
  );
}

/** h1/p do hero e cabeçalho da régua com texto cortado por overflow. */
export async function heroClipped(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const els = [
      ...Array.from(document.querySelectorAll('#agora h1, #agora p, #agora .pal, #agora .l1')),
      ...Array.from(document.querySelectorAll('[data-testid="regua-48h"] h2, [data-testid="regua-hora"]')),
    ];
    els.forEach((el) => {
      if (el.classList.contains('truncate')) return;
      if (el.scrollWidth > el.clientWidth + 1) out.push(el.tagName + ':' + (el.textContent ?? '').slice(0, 30));
    });
    return out;
  });
}
