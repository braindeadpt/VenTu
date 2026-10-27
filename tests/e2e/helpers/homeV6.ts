import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { forceLiveSpotMode } from './conditions';
import { metaCosta } from '../../../src/lib/home/dadosHomeServidor';
import { compactarCosta, montarCosta } from '../../../src/lib/home/dadosHome';
import { criarModelo } from '../../../src/lib/home/homeV6';
import { estadoHome } from '../../../src/lib/home/estadoHome';
import { homeV6Copy } from '../../../src/lib/translations/homeV6';
import type { LinhaForecast } from '../../../src/lib/horaSpot';

/**
 * #183 — home v6 «Atlântico»: fixture hermética com os dados da maquete aprovada
 * (docs/design/maquetes/v6-atlantico/index.html, `<script id="dados">`: 19 spots,
 * qua 14 out 2026 a partir das 00h, «agora» às 14h de Lisboa).
 *
 * Com o cookie `ventu_live=1` (a costura dos e2e herméticos, a mesma da página de
 * spot) a home lê `/data/forecasts/<série>.json`; aqui servem-se as horas da
 * maquete no formato do pipeline (m/s, maré ao nível médio) e o relógio fica fixo.
 */
const RAIZ = path.resolve(__dirname, '../../..');
const html = fs.readFileSync(path.join(RAIZ, 'docs/design/maquetes/v6-atlantico/index.html'), 'utf8');
const D = JSON.parse(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]) as {
  meta: { inicio: string };
  spots: Array<{ id: string; h: Record<string, number[]> }>;
};
const IDS: Record<string, string> = { viana: 'cabedelo', 'lagoa-obidos': 'obidos-lagoon', caparica: 'costa-caparica', 'meia-praia': 'lagos' };
const KT = 1.94384;

function linhas(h: Record<string, number[]>) {
  const T0 = D.meta.inicio;
  return h.w.map((_, i) => ({
    time: new Date(Date.UTC(+T0.slice(0, 4), +T0.slice(5, 7) - 1, +T0.slice(8, 10), i)).toISOString().slice(0, 16),
    windSpeed: h.w[i] / KT,
    windGust: h.g[i] / KT,
    windDirection: h.wd[i],
    waveHeight: h.hs[i],
    wavePeriod: h.tp[i],
    waveDirection: h.sd[i],
    tideHeight: h.tide[i] - 2.0,
    // a maquete tem chuva e nuvens (o feed actual não): com elas a nota iguala a da maquete
    precipitation: h.rain[i],
    cloudCover: h.cloud[i],
  }));
}
export const FORECASTS_MAQUETE: Record<string, string> = Object.fromEntries(
  D.spots.map((s) => [IDS[s.id] ?? s.id, JSON.stringify(linhas(s.h))]),
);

/** «agora» da maquete: qua 14 out 2026, 14h em Lisboa (WEST). */
export const AGORA_MAQUETE = new Date('2026-10-14T13:00:00Z');
export const NOITE_MAQUETE = new Date('2026-10-14T21:00:00Z');

/**
 * Frase nacional esperada para a fixture da maquete (kite, sem bloco escolhido), calculada
 * em Node com o MESMO motor da home (`metaCosta` → `compactarCosta` → `montarCosta` →
 * `criarModelo` → `estadoHome`) sobre as MESMAS linhas que `fixtureMaquete` serve.
 *
 * Porquê: a frase nomeia os spots das pontas da faixa «bons» e a zona («à volta de
 * Lisboa» / «na costa oeste»), e isso depende dos metadados de cada spot (coordenadas,
 * praia virada, modalidades) — que mudam com correcções de dados aprovadas (#321 pôs o
 * Baleal no Cantinho da Baía, 300°, e a frase passou de «do Guincho à Lagoa» a «do Baleal
 * à Lagoa»). Um literal no teste partia a cada correcção; aqui o teste prova que o HTML
 * mostra o que o motor diz para estes dados, e o spec assere à parte a forma da frase.
 * Texto sem marcas (`<b>`/`<em>`), como o `textContent` do parágrafo.
 */
export function fraseMaquete(locale: 'pt' | 'en' = 'pt', agora: Date = AGORA_MAQUETE): string {
  const meta = metaCosta();
  const linhasPorSpot: Record<string, LinhaForecast[]> = {};
  for (const [id, m] of Object.entries(meta)) {
    const body = FORECASTS_MAQUETE[m.serie];
    linhasPorSpot[id] = body ? (JSON.parse(body) as LinhaForecast[]) : [];
  }
  const t = agora.getTime();
  const costa = montarCosta(compactarCosta(linhasPorSpot, t, meta), t, meta);
  const E = estadoHome(criarModelo(costa.spots, homeV6Copy(locale)), 'kite', costa.agoraI < 0 ? 0 : costa.agoraI, null);
  return E.frase.txt.replace(/<[^>]+>/g, '');
}

/** Cookie + forecasts da maquete + relógio fixo. Chamar ANTES do goto. */
export async function fixtureMaquete(page: Page, agora: Date = AGORA_MAQUETE) {
  await forceLiveSpotMode(page);
  await page.route(/\/data\/forecasts\/([a-z0-9-]+)\.json(\?.*)?$/, (route) => {
    const id = /forecasts\/([a-z0-9-]+)\.json/.exec(route.request().url())![1];
    const body = FORECASTS_MAQUETE[id];
    if (!body) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  await page.clock.setFixedTime(agora);
}

/** Abre a home e espera pela v6 viva (hidratada; com a fixture, pelos dados da maquete). */
export async function abreHome(page: Page, url = '/pt/', opts: { maquete?: boolean } = {}) {
  await page.goto(url);
  await page.waitForSelector('html.is-hydrated', { timeout: 20_000 });
  await expect(page.getByTestId('home-v6')).toHaveClass(/vivo/, { timeout: 20_000 });
  if (opts.maquete) await expect(page.getByTestId('home-v6')).toHaveAttribute('data-hora', /^2026-10-14T/, { timeout: 20_000 });
}

export async function caixa(page: Page, sel: string) {
  return page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right } : null;
  }, sel);
}
