import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { preseedWindRingLegend } from './helpers/map-setup';

/**
 * Satélite NASA (GIBS true-color) — a opção liga com IMAGEM, não com o mapa
 * vazio, e os botões da pilha de controlos continuam legíveis por cima dela.
 *
 * Auditoria 30 set: o slot `default` do GIBS é HOJE e o mosaico de hoje só se
 * preenche depois do passe (Terra ~10:30 UTC sobre Ibéria + ~3 h): de manhã
 * todos os tiles vinham «sem dados» (pretos), a camada escondia-os todos e a
 * opção ficava ligada sem mostrar nada (28 de 28 tiles escondidos, desktop e
 * telemóvel). A camada passou a empilhar o mosaico de ONTEM por baixo do de hoje.
 *
 * Hermética: o GIBS é simulado — hoje = tile preto, ontem = tile com imagem.
 */

/** PNG 1×1 RGB opaco, sem dependências (CRC32 à mão). */
function png1x1(r: number, g: number, b: number): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // largura
  ihdr.writeUInt32BE(1, 4); // altura
  ihdr[8] = 8; // profundidade
  ihdr[9] = 2; // RGB
  const raw = Buffer.from([0, r, g, b]); // filtro 0 + 1 pixel
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BLANK = png1x1(0, 0, 0); // «sem dados»
const CLOUD = png1x1(180, 190, 205); // imagem real

async function openMapaWithNasa(page: Page) {
  await preseedWindRingLegend(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('ventu.map.gibsSat', '1');
    } catch {
      /* noop */
    }
  });
  const requested: string[] = [];
  await page.route('**/gibs.earthdata.nasa.gov/**', async (route) => {
    const url = route.request().url();
    requested.push(url);
    // GIBS manda ACAO:* — sem isto o canvas não lê os pixels (máscara).
    const headers = { 'access-control-allow-origin': '*' };
    const today = /\/default\/default\//.test(url);
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers,
      body: today ? BLANK : CLOUD,
    });
  });
  await page.goto('/pt/mapa/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  return requested;
}

test.describe('Satélite NASA (GIBS) — mosaico de ontem por baixo do de hoje', () => {
  test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  test.describe.configure({ timeout: 90_000 });

  test('com o mosaico de hoje vazio a camada mostra o de ontem (não o mapa vazio)', async ({ page }) => {
    const requested = await openMapaWithNasa(page);

    // Duas camadas de tiles GIBS: zIndex 1 = ontem (data explícita), 2 = hoje.
    // A máscara corre no `tileload` (assíncrona) — espera o estado assentar.
    const stats = () =>
      page.evaluate(() => {
        const layers = Array.from(document.querySelectorAll('.leaflet-layer.ventu-gibs-sat'));
        const stat = (z: string) => {
          const el = layers.find((l) => (l as HTMLElement).style.zIndex === z);
          const imgs = el ? Array.from(el.querySelectorAll('img.leaflet-tile')) : [];
          return {
            total: imgs.length,
            shown: imgs.filter((i) => (i as HTMLElement).style.display !== 'none').length,
          };
        };
        return { yesterday: stat('1'), today: stat('2') };
      });

    await expect
      .poll(
        async () => {
          const r = await stats();
          return r.yesterday.total > 0 && r.today.total > 0 && r.today.shown === 0;
        },
        { timeout: 20_000, message: 'tiles de hoje (vazios) escondidos e de ontem carregados' },
      )
      .toBe(true);

    const result = await stats();
    expect(result.yesterday.total, 'a camada de ontem carregou tiles').toBeGreaterThan(0);
    expect(result.yesterday.shown, 'os tiles de ontem ficam VISÍVEIS').toBe(result.yesterday.total);
    expect(result.today.total, 'a camada de hoje carregou tiles').toBeGreaterThan(0);
    expect(result.today.shown, 'os tiles de hoje, vazios, ficam escondidos').toBe(0);

    // A camada de baixo pede uma data UTC anterior a hoje.
    const dated = requested.find((u) => /\/default\/\d{4}-\d{2}-\d{2}\//.test(u));
    expect(dated, 'pedido com data explícita').toBeTruthy();
    const day = dated!.match(/\/default\/(\d{4}-\d{2}-\d{2})\//)![1];
    const todayUtc = new Date().toISOString().slice(0, 10);
    expect(day < todayUtc, `a data pedida (${day}) é anterior a hoje UTC (${todayUtc})`).toBe(true);
  });

  test('os botões da pilha de controlos têm fundo sólido (legíveis sobre imagem clara)', async ({ page }) => {
    // Telemóvel: aí «Vento» e «Legenda» não vêm ligados por defeito — 4 a 5 botões normais.
    await page.setViewportSize({ width: 390, height: 844 });
    await openMapaWithNasa(page);
    const stack = page.locator('[data-map-control-stack]');
    await expect(stack).toBeVisible({ timeout: 20_000 });

    const alphas = await stack.evaluate((el) =>
      Array.from(el.querySelectorAll(':scope > .map-cb > button'))
        // «ligado» tem o seu próprio fundo sólido (--fg) — o alvo é o estado normal.
        .filter((b) => b.getAttribute('aria-pressed') !== 'true')
        .map((b) => {
          const m = getComputedStyle(b).backgroundColor.match(/rgba?\(([^)]+)\)/);
          const parts = m ? m[1].split(',').map((x) => parseFloat(x)) : [];
          return { label: b.getAttribute('aria-label') ?? '', alpha: parts.length === 4 ? parts[3] : 1 };
        }),
    );
    expect(alphas.length, 'a pilha tem botões directos').toBeGreaterThanOrEqual(4);
    for (const b of alphas) {
      expect(b.alpha, `«${b.label}» com fundo translúcido (vidro a 4 %) some sobre nuvens`).toBe(1);
    }
  });
});
