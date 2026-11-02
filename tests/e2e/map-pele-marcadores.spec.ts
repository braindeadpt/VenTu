import { test, expect, type Page } from '@playwright/test';
import { preseedWindRingLegend } from './helpers/map-setup';
import { waitHydrated } from './helpers/hydration';

/**
 * Fase B do /mapa, PR B1 — marcadores, grupos «+N» e noite nas bandas v6
 * (pele `?pele=v6`). O disco de cada marcador tem de estar na banda v6 da nota
 * que mostra (Não dá < 3 ≤ Fraco < 5 ≤ Dá < 7 ≤ Bom < 9 ≤ Muito bom), com o
 * número a ≥ 4,5:1; a noite continua #56677B com a lua. Com a pele desligada
 * os mesmos discos ficam na paleta de hoje (nenhuma banda v6).
 */
const BANDA_RGB: Array<[number, string]> = [
  [9, 'rgb(255, 240, 122)'], // mb #FFF07A
  [7, 'rgb(64, 220, 208)'], // bom #40DCD0
  [5, 'rgb(201, 158, 42)'], // dá #C99E2A
  [3, 'rgb(68, 121, 238)'], // fraco #4479EE
  [0, 'rgb(168, 70, 74)'], // não dá #A8464A
];
const bandaDaNota = (nota: number) => BANDA_RGB.find(([min]) => nota >= min)![1];
const NIGHT_FILL_RGB = 'rgb(86, 103, 123)';

async function abrir(page: Page, path: string): Promise<void> {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    localStorage.setItem('ventu.map.cluster', '0');
    localStorage.setItem('ventu.map.hours', JSON.stringify({ paused: true, frame: 0 }));
  });
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await waitHydrated(page);
  await page.waitForFunction(() => document.querySelectorAll('[data-v3spot]').length > 0, undefined, {
    timeout: 30_000,
    polling: 250,
  });
}

type Disco = { nota: number; bg: string; ratio: number };

/** Lê os discos com número: nota visível, fill e contraste WCAG número/fill. */
function lerDiscos(page: Page): Promise<Disco[]> {
  return page.evaluate(() => {
    const lum = (rgb: string) => {
      const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const c = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
    };
    return [...document.querySelectorAll<HTMLElement>('.v3mk[data-spot-score] .v3in')].slice(0, 40).map((el) => {
      const cs = getComputedStyle(el);
      const a = lum(cs.backgroundColor);
      const b = lum(cs.color);
      const [hi, lo] = a >= b ? [a, b] : [b, a];
      return { nota: Number((el.textContent ?? '').trim()), bg: cs.backgroundColor, ratio: (hi + 0.05) / (lo + 0.05) };
    });
  });
}

test.describe('/mapa pele v6 — marcadores nas bandas (B1)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });

  test('com ?pele=v6: disco na banda da nota e número ≥ 4,5:1', async ({ page }) => {
    await abrir(page, '/pt/mapa/?pele=v6&sport=all');
    await expect(page.locator('[data-pele="v6"]')).toBeAttached({ timeout: 15_000 });
    await expect.poll(async () => (await lerDiscos(page)).length, { timeout: 20_000 }).toBeGreaterThan(3);
    const discos = await lerDiscos(page);
    for (const d of discos) {
      expect(Number.isFinite(d.nota), JSON.stringify(d)).toBe(true);
      expect(d.bg, `nota ${d.nota}`).toBe(bandaDaNota(d.nota));
      expect(d.ratio, `contraste nota ${d.nota} (${d.bg})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('sem a pele: os mesmos discos não usam as bandas v6', async ({ page }) => {
    await abrir(page, '/pt/mapa/?pele=0&sport=all');
    await expect(page.locator('[data-pele="v6"]')).toHaveCount(0);
    await expect.poll(async () => (await lerDiscos(page)).length, { timeout: 20_000 }).toBeGreaterThan(3);
    const v6 = new Set(BANDA_RGB.map(([, rgb]) => rgb));
    for (const d of await lerDiscos(page)) expect(v6.has(d.bg), `nota ${d.nota} (${d.bg})`).toBe(false);
  });

  test('com ?pele=v6: arco do vento na cor do ventoRel e centrado na direcção do tique', async ({ page }) => {
    await abrir(page, '/pt/mapa/?pele=v6&sport=kitesurf&wind=1');
    const scope = page.locator('[data-pele="v6"]');
    await expect(scope).toBeAttached({ timeout: 15_000 });
    // Determinístico, sem depender do vento do build: um tique sintético por relação, com o
    // mesmo markup de buildV3MarkerIcon, dentro do âmbito da pele. Lê-se o ::before (arco),
    // a ponta e a direcção real no ecrã (centro da ponta face ao centro do tique).
    const lidos = await scope.evaluate((root) => {
      const casos: Array<[string | null, number]> = [['offshore', 0], ['cross', 90], ['onshore', 225], [null, 135]];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:200px;top:200px;width:80px;height:80px;z-index:99999';
      root.appendChild(host);
      const out = casos.map(([rel, deg]) => {
        host.innerHTML = `<i class="v3tick" data-wind-tick="true"${rel ? ` data-vento-rel="${rel}"` : ''} style="position:absolute;left:50%;top:50%;width:0;height:0;transform:rotate(${deg}deg)"><i class="v3tip" style="position:absolute;left:-4px;top:-27px"></i></i>`;
        const tick = host.querySelector<HTMLElement>('.v3tick')!;
        const tip = host.querySelector<HTMLElement>('.v3tip')!;
        const arco = getComputedStyle(tick, '::before');
        const h = host.getBoundingClientRect();
        const p = tip.getBoundingClientRect();
        const dx = p.left + p.width / 2 - (h.left + h.width / 2);
        const dy = p.top + p.height / 2 - (h.top + h.height / 2);
        return {
          rel, deg,
          arcoCor: arco.borderTopColor,
          arcoConteudo: arco.content,
          arcoLargura: arco.width,
          mascara: arco.maskImage || (arco as unknown as Record<string, string>).webkitMaskImage || '',
          pontaCor: getComputedStyle(tip).backgroundColor,
          // ângulo no ecrã, 0° = cima, sentido horário (o mesmo do rotate)
          angulo: (Math.atan2(dx, -dy) * 180) / Math.PI,
        };
      });
      host.remove();
      return out;
    });
    const COR: Record<string, string> = {
      offshore: 'rgb(127, 231, 255)', // gelo
      cross: 'rgb(169, 194, 212)', // névoa
      onshore: 'rgb(255, 138, 128)', // coral
    };
    const dif = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    for (const l of lidos) {
      expect(dif(l.angulo, l.deg), `direcção ${l.rel} ${l.deg}° (${l.angulo.toFixed(1)}°)`).toBeLessThan(3);
      if (l.rel) {
        expect(l.arcoConteudo, `arco ${l.rel}`).not.toBe('none');
        expect(l.arcoLargura).toBe('46px');
        expect(l.mascara, `máscara de 60° ${l.rel}`).toContain('conic-gradient');
        expect(l.arcoCor, `cor do arco ${l.rel}`).toBe(COR[l.rel]);
        expect(l.pontaCor, `cor da ponta ${l.rel}`).toBe(COR[l.rel]);
      } else {
        // sem relação (água interior): sem arco, só a ponta em névoa
        expect(l.arcoConteudo).toBe('none');
        expect(l.pontaCor).toBe(COR.cross);
      }
    }
    // E os tiques reais, quando o vento do build os desenha: cada um com a cor da sua relação.
    const reais = await page.locator('[data-v3spot] .v3tick[data-vento-rel]').evaluateAll((els) =>
      els.slice(0, 30).map((el) => ({ rel: el.getAttribute('data-vento-rel')!, cor: getComputedStyle(el, '::before').borderTopColor })),
    );
    test.info().annotations.push({ type: 'arcos-reais', description: String(reais.length) });
    for (const r of reais) expect(r.cor, `arco real ${r.rel}`).toBe(COR[r.rel]);
  });

  test('com ?pele=v6 numa frame de noite: disco #56677B, sem número', async ({ page }) => {
    await page.route('**/data/map-hours.json', async (route) => {
      const res = await route.fetch();
      const j = (await res.json()) as { spots?: Record<string, Record<string, Array<number | null>>> };
      for (const row of Object.values(j.spots ?? {})) {
        for (const k of ['kitesurf', 'surf']) if (Array.isArray(row[k])) row[k] = row[k].map(() => null);
      }
      await route.fulfill({ response: res, json: j });
    });
    await abrir(page, '/pt/mapa/?pele=v6&hours=1&sport=surf');
    const disc = page.locator('.leaflet-marker-icon.spot-marker[data-spot-id="nazare"] .v3mk[data-spot-night] .v3in');
    await expect(disc).toBeAttached({ timeout: 20_000 });
    expect(await disc.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(NIGHT_FILL_RGB);
    expect(((await disc.textContent()) ?? '').trim()).not.toMatch(/\d/);
  });
});
