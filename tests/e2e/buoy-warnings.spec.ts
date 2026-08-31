import { test, expect } from '@playwright/test';
import {
  interceptConditions,
  interceptIhBuoys,
  interceptWmoBuoys,
  withoutObservedWave,
} from './helpers/conditions';

/**
 * Aviso de boias — BuoyLayerNotice.
 *
 * The notice explains WHY there is no observedWave, deriving the state from
 * public/data/ih-buoys.json (apiKeyConfigured / hasWaveData / station latest)
 * combined with public/data/wmo-buoys.json (the keyless Copernicus fallback):
 *   - no-key  → «Onda observada desactivada» (IH_API_KEY não configurada);
 *   - down    → «Boias do IH indisponíveis»;
 *   - stale   → «Leituras das boias antigas» (>3h);
 *   - ok      → no notice.
 *
 * The notice only renders when NEITHER source is fresh — if the WMO fallback
 * covers the spot there is data and nothing to warn about. When the WMO also
 * fails, the copy names it («WMO em baixo» / «só tem leituras antigas»).
 *
 * The conditions.json helper strips the spot's observedWave (the parent gate
 * `!freshObservedWave && !conditions.observedWave`), and ih-buoys.json +
 * wmo-buoys.json are crafted per state.
 */

const STALE_ISO = new Date(Date.now() - 5 * 3_600_000).toISOString();
const FRESH_ISO = new Date().toISOString();

/** WMO fallback fixture: sem wave data (em baixo) — determinístico por teste. */
const WMO_DOWN = { buoys: {}, hasWaveData: false, day: '20260815' };
/** WMO fallback fixture: leituras antigas (>6h). */
const WMO_STALE = {
  buoys: {
    6200084: {
      code: '6200084',
      name: 'Cabo Silleiro',
      latest: { date: new Date(Date.now() - 12 * 3_600_000).toISOString() },
    },
  },
  hasWaveData: true,
  day: '20260815',
};
/** WMO fallback fixture: leitura fresca (≤6h). */
const WMO_OK = {
  buoys: {
    6200084: {
      code: '6200084',
      name: 'Cabo Silleiro',
      latest: { date: new Date().toISOString() },
    },
  },
  hasWaveData: true,
  day: '20260815',
};

test.describe('Aviso de boias (BuoyLayerNotice)', () => {
  // O SW serve /data/* do cache e burla o page.route — ver helpers/conditions.ts.
  test.use({ serviceWorkers: 'block' });

  /** Sem leitura fresca no spot (gate do aviso) + página do spot. `wmo` controla o fallback. */
  async function gotoSpot(page: import('@playwright/test').Page, wmo = WMO_DOWN) {
    await interceptConditions(page, { spots: { guincho: withoutObservedWave } });
    await interceptWmoBuoys(page, wmo);
    await page.goto('/pt/spots/guincho/');
    await expect(page.getByRole('heading', { level: 1, name: /Guincho/i })).toBeVisible({
      timeout: 20_000,
    });
  }

  test('no-key: «Onda observada desactivada» sem IH_API_KEY (+ WMO em baixo)', async ({ page }) => {
    await interceptIhBuoys(page, {
      fetchedAt: new Date().toISOString(),
      apiKeyConfigured: false,
      hasWaveData: false,
      stations: {},
    });
    await gotoSpot(page);

    await expect(page.getByText('Onda observada desactivada')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/IH_API_KEY não está configurada na pipeline/)).toBeVisible();
    // Ambas as fontes sem dados → a nota WMO aparece.
    await expect(page.getByText(/fallback WMO \(Copernicus\) também está em baixo/)).toBeVisible();
  });

  test('down: «Boias do IH indisponíveis» com key mas sem dados (+ WMO em baixo)', async ({ page }) => {
    await interceptIhBuoys(page, {
      apiKeyConfigured: true,
      hasWaveData: false,
      stations: {},
    });
    await gotoSpot(page);

    await expect(page.getByText('Boias do IH indisponíveis')).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/serviço de boias do Instituto Hidrográfico está em baixo/),
    ).toBeVisible();
    await expect(page.getByText(/fallback WMO \(Copernicus\) também está em baixo/)).toBeVisible();
  });

  test('stale: «Leituras das boias antigas» com leituras >3h (+ WMO antigas)', async ({ page }) => {
    await interceptIhBuoys(page, {
      apiKeyConfigured: true,
      hasWaveData: true,
      stations: {
        4: { status: 'active', latest: { date: STALE_ISO } },
      },
    });
    await gotoSpot(page, WMO_STALE);

    await expect(page.getByText('Leituras das boias antigas')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/leituras das boias têm mais de 3 h/)).toBeVisible();
    await expect(page.getByText(/fallback WMO \(Copernicus\) só tem leituras antigas/)).toBeVisible();
  });

  test('ok: leitura fresca → nenhum aviso', async ({ page }) => {
    await interceptIhBuoys(page, {
      apiKeyConfigured: true,
      hasWaveData: true,
      stations: {
        4: { status: 'active', latest: { date: FRESH_ISO } },
      },
    });
    await gotoSpot(page);

    await expect(
      page.getByText(/Onda observada desactivada|Boias do IH indisponíveis|Leituras das boias antigas/),
    ).toHaveCount(0);
  });

  test('IH sem key mas WMO fresco → NENHUM aviso (o fallback cobre)', async ({ page }) => {
    await interceptIhBuoys(page, {
      fetchedAt: new Date().toISOString(),
      apiKeyConfigured: false,
      hasWaveData: false,
      stations: {},
    });
    await gotoSpot(page, WMO_OK);

    await expect(
      page.getByText(/Onda observada desactivada|Boias do IH indisponíveis|Leituras das boias antigas/),
    ).toHaveCount(0);
  });
});

test.describe('Aviso de boias na homepage (BuoyLayerNotice scope=home)', () => {
  test.use({ serviceWorkers: 'block' });

  /** Homepage com ih-buoys.json + wmo-buoys.json interceptados (estado por teste). */
  async function gotoHome(page: import('@playwright/test').Page) {
    await interceptWmoBuoys(page, WMO_DOWN);
    await page.goto('/pt/');
    await expect(page.getByRole('heading', { name: /A bombar agora/i })).toBeVisible({
      timeout: 20_000,
    });
  }

  test('no-key: «Onda observada desactivada» também na homepage (zona dos cards)', async ({ page }) => {
    await interceptIhBuoys(page, {
      fetchedAt: new Date().toISOString(),
      apiKeyConfigured: false,
      hasWaveData: false,
      stations: {},
    });
    await gotoHome(page);

    await expect(page.getByText('Onda observada desactivada')).toBeVisible({ timeout: 20_000 });
    // Copy adaptada à homepage: fala do mapa e dos cards, não de "esta página".
    await expect(
      page.getByText(/alturas de onda no mapa e nos cards são previsão do modelo/),
    ).toBeVisible();
    // WMO também sem dados → nota visível na homepage.
    await expect(page.getByText(/fallback WMO \(Copernicus\) também está em baixo/)).toBeVisible();
  });

  test('down: «Boias do IH indisponíveis» na homepage', async ({ page }) => {
    await interceptIhBuoys(page, {
      apiKeyConfigured: true,
      hasWaveData: false,
      stations: {},
    });
    await gotoHome(page);

    await expect(page.getByText('Boias do IH indisponíveis')).toBeVisible({ timeout: 20_000 });
  });

  test('ok: homepage sem aviso quando a camada está saudável', async ({ page }) => {
    await interceptIhBuoys(page, {
      apiKeyConfigured: true,
      hasWaveData: true,
      stations: {
        4: { status: 'active', latest: { date: FRESH_ISO } },
      },
    });
    await gotoHome(page);

    await expect(
      page.getByText(/Onda observada desactivada|Boias do IH indisponíveis|Leituras das boias antigas/),
    ).toHaveCount(0);
  });
});

test.describe('Chip de diagnóstico no ticker (pipeline-meta.json → HeroTicker)', () => {
  test.use({ serviceWorkers: 'block' });

  // O chip vem do pipeline-meta.json (SSG, server-rendered) — o estado actual
  // do build é no-key, logo o ticker da homepage mostra «Boias: sem key».
  test('no-key no pipeline-meta.json → «Boias: sem key» no ticker do hero', async ({ page }) => {
    await page.goto('/pt/');

    await expect(page.getByText('Boias: sem key')).toBeVisible({ timeout: 20_000 });
    // O aviso completo da secção de cards também está presente.
    await expect(page.getByText('Onda observada desactivada')).toBeVisible();
  });
});
