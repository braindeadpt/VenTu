import type { Page } from '@playwright/test';
import { encodeSeaGrid } from '../../../scripts/lib/seaGrid.js';

/**
 * Grelha do mar sintética e FRESCA para specs do /mapa — o cliente rejeita um
 * sea-grid.json com mais de ~30 h, por isso o stub é sempre gerado a correr.
 * Cobre o continente (passo 0,5°) e o Atlântico (1°) com vento constante de
 * 8 m/s de norte e ondulação suave — partículas e pintura determinísticas.
 * Nascida em map-sea-mode.spec.ts; partilhada desde #464 para o spec do vento.
 */
export function seaGridStub() {
  const boxes = [
    { id: 'mainland', west: -11, south: 36, nx: 9, ny: 13, step: 0.5 },
    { id: 'atlantic', west: -34.5, south: 26.5, nx: 35, ny: 21, step: 1 },
  ];
  const nodes: Array<{ lat: number; lon: number; fetch: boolean; store: boolean }> = [];
  for (const b of boxes) {
    for (let j = 0; j < b.ny; j++) {
      for (let i = 0; i < b.nx; i++) nodes.push({ lat: b.south + j * b.step, lon: b.west + i * b.step, fetch: true, store: true });
    }
  }
  const nowH = Math.floor(Date.now() / 3600_000) * 3600;
  const times = Array.from({ length: 56 }, (_, k) => nowH - 3600 + k * 3600);
  const idx = times.map((_, k) => k);
  const wind = nodes.map(() => ({ wind_speed_10m: times.map(() => 8), wind_direction_10m: times.map(() => 0) }));
  const marine = nodes.map((n) => ({
    wave_height: times.map(() => 1 + (n.lat - 26) / 10),
    swell_wave_direction: times.map(() => 300),
    swell_wave_period: times.map(() => 12),
  }));
  return encodeSeaGrid({ boxes, nodes, wind, marine, times, idx, generatedAt: new Date().toISOString(), source: 'e2e' });
}

/** Serve a grelha sintética em /data/sea-grid.json (o que o campo de vento/ondulação lê). */
export async function interceptSeaGrid(page: Page): Promise<void> {
  const grid = JSON.stringify(seaGridStub());
  await page.route('**/data/sea-grid.json*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: grid }),
  );
}
