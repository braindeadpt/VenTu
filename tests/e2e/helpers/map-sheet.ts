import { expect, type Page } from '@playwright/test';

/**
 * Espera o mapa parado: `data-map-settled` é reposto no moveend e tirado
 * no movestart, por isso cobre fits e flyTos animados. A pausa curta no
 * início deixa arrancar um fit desencadeado pelo settle do sheet — sem
 * ela o selector passava antes do movestart e a espera não servia.
 */
export async function waitMapSettled(page: Page) {
  await page.waitForTimeout(500);
  await page.waitForSelector('.leaflet-container[data-map-settled="true"]', {
    timeout: 30_000,
  });
}

/**
 * Desfaz o cluster pelo toggle real do sheet. O mobile força cluster no
 * arranque (ignora o LS), por isso o único caminho é a UI: peek → half →
 * «Mostrar todos», voltando ao peek no fim. Só devolve com o sheet em
 * peek E o mapa parado — o fit depende da altura medida do peek e ainda
 * move os marcadores durante a animação.
 */
export async function showAllMapMarkers(page: Page) {
  const showAll = page.getByRole('button', { name: /Mostrar todos|Show all/i }).first();
  const sheet = page.locator('[data-explore-sheet]');
  const grabber = page.locator('[data-sheet-grabber]');
  // Sobe o sheet até aos extras ficarem visíveis (peek→half; open→peek→half).
  for (let i = 0; i < 2 && !(await showAll.isVisible().catch(() => false)); i += 1) {
    await grabber.click();
  }
  if (await showAll.isVisible().catch(() => false)) {
    await showAll.click();
    await page.waitForSelector('.leaflet-marker-icon.spot-marker', { timeout: 30_000 });
  }
  // Volta ao peek mesmo quando o cluster já estava desfeito — no half/open
  // o sheet tapa a faixa de marcadores onde o clique iria cair.
  for (let i = 0; i < 3; i += 1) {
    if ((await sheet.getAttribute('data-explore-sheet')) === 'peek') break;
    await grabber.click();
  }
  await expect(sheet).toHaveAttribute('data-explore-sheet', 'peek');
  await waitMapSettled(page);
}

/**
 * Índice de um spot-marker clicável: dentro do viewport, acima do sheet
 * (o peek tapa a faixa inferior) e o elemento de topo no seu centro —
 * um marcador tapado por outro falharia a verificação de hit do clique.
 */
async function pickSpotMarkerIndex(page: Page): Promise<number> {
  let index = -1;
  await expect
    .poll(
      async () => {
        index = await page.evaluate(() => {
          const markers = Array.from(
            document.querySelectorAll<HTMLElement>('.leaflet-marker-icon.spot-marker'),
          );
          const sheet = document.querySelector<HTMLElement>('[data-explore-sheet]');
          const sheetTop = sheet ? sheet.getBoundingClientRect().top : window.innerHeight;
          for (let i = 0; i < markers.length; i += 1) {
            const r = markers[i].getBoundingClientRect();
            if (
              r.width === 0 ||
              r.left < 0 ||
              r.right > window.innerWidth ||
              r.top < 56 ||
              r.bottom > sheetTop - 4
            ) {
              continue;
            }
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            if (top === markers[i] || markers[i].contains(top)) return i;
          }
          return -1;
        });
        return index;
      },
      { timeout: 30_000 },
    )
    .not.toBe(-1);
  return index;
}

/**
 * Toca num spot-marker escolhido no viewport útil e espera o sheet de
 * detalhe abrir. Clique normal (sem force): o marcador escolhido é o
 * elemento de topo no seu centro; se for re-renderizado a meio, tenta
 * outro.
 */
export async function tapSpotMarker(page: Page) {
  const sheet = page.getByRole('dialog');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const index = await pickSpotMarkerIndex(page);
    const marker = page.locator('.leaflet-marker-icon.spot-marker').nth(index);
    try {
      await marker.click({ timeout: 8_000 });
    } catch {
      continue;
    }
    try {
      await sheet.waitFor({ state: 'visible', timeout: 4_000 });
      return;
    } catch {
      /* tenta outro marcador */
    }
  }
  await expect(sheet).toBeVisible({ timeout: 10_000 });
}

/** Open mobile map spot sheet (retries marker click until dialog is visible). */
export async function openMapSpotSheet(page: Page) {
  await page.waitForSelector('[data-map-hud="visible"]', { timeout: 35_000 });
  await showAllMapMarkers(page);

  await page.waitForFunction(() => window.matchMedia('(max-width: 767px)').matches);
  await tapSpotMarker(page);
  return page.getByRole('dialog');
}
