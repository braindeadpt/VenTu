import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Config SÓ do varrimento visual em píxeis (`tests/e2e/visual-sweep.spec.ts`).
 *
 * Porque separada da `playwright.config.ts`: aquela tem `globalTimeout` de
 * 20 min (o varrimento demora horas) e um reporter de lista (5 238 testes
 * imprimiriam megabytes). Aqui o que muda é só o que tem de mudar — o resto
 * (servidor do `out/`, baseURL) é igual, para o artefacto medido ser o mesmo.
 *
 * Uso: PLAYWRIGHT_PORT=4321 npx playwright test --config=playwright.vsweep.config.ts
 */

function loadE2eEnv(): void {
  const file = existsSync('.env.e2e') ? '.env.e2e' : '.env.e2e.example';
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (key.startsWith('NEXT_PUBLIC_') && process.env[key] === undefined) {
      process.env[key] = line.slice(eq + 1).trim();
    }
  }
}
loadE2eEnv();

const PORT = process.env.PLAYWRIGHT_PORT || '4321';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /visual-sweep\.spec\.ts/,
  globalTimeout: Number(process.env.VS_GLOBAL_TIMEOUT_H ?? 12) * 3_600_000,
  fullyParallel: true,
  forbidOnly: false,
  retries: 0,
  // 8 GB de RAM nesta máquina: 3 browsers em paralelo, cada um a fotografar
  // páginas de 4 000 px, é o ponto em que o sistema deixa de paginar.
  workers: Number(process.env.VS_WORKERS ?? 3),
  timeout: 180_000,
  reporter: [['dot']],
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  // O servidor é o `scripts/visual-sweep-server.mjs`, arrancado À PARTE (por
  // `reuseExistingServer: true` o Playwright adopta-o): o `serve` morria a meio
  // das corridas longas — duas vezes, uma delas com EMFILE — e deixava centenas
  // de capturas com ERR_CONNECTION_REFUSED. O teste de identidade do spec
  // garante que o servidor adoptado é o do `out/` descrito no manifesto.
  webServer: {
    command: `node scripts/visual-sweep-server.mjs out ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
