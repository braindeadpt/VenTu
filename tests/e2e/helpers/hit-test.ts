import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * O alvo é clicável (hit-test) quando é o elemento de topo no seu próprio
 * centro (`elementFromPoint`). O clique do Playwright faz o mesmo check, mas
 * falha num timeout de 60s quando um overlay cobre o alvo; este poll espera
 * pela condição real e falha em 5s a NOMEAR o interceptador — o padrão do
 * dismiss do chip de boias, partilhado por todos os specs de overlays do mapa.
 */
export async function expectTopmostHit(page: Page, locator: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const handle = await locator.elementHandle().catch(() => null);
      if (!handle) return 'missing';
      return handle.evaluate((node) => {
        const el = node as HTMLElement;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return 'not-rendered';
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!top) return 'no-element';
        if (top === el || el.contains(top)) return 'ok';
        const t = top as HTMLElement;
        const keys = Object.keys(t.dataset ?? {})
          .slice(0, 2)
          .join('|');
        const cls = typeof t.className === 'string' ? t.className.slice(0, 40) : '';
        return `covered-by:${t.tagName.toLowerCase()}${cls ? ` ${cls}` : ''}${keys ? ` [${keys}]` : ''}`;
      });
    })
    .toBe('ok', { timeout: 5_000 });
}