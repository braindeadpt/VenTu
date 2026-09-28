import type { Page } from '@playwright/test';

/**
 * Assentamento determinístico de uma página, para substituir `waitForTimeout`.
 *
 * Porque existe: medir 700 ms depois do `html.is-hydrated` produz resultados
 * diferentes entre corridas do MESMO build (medido: 174 de 477 provas mudavam
 * de findings entre duas corridas). A causa não é o produto — é o momento da
 * medição: a camada de clusters carrega em chunk lazy, as imagens assentam
 * depois, e as animações começam e acabam em momentos distintos. Uma auditoria
 * que não consegue repetir-se não consegue afirmar nada.
 *
 * Aqui espera-se por um estado OBSERVÁVEL, não por tempo:
 *   1. fontes prontas (`document.fonts.ready`) — muda métricas de texto;
 *   2. o mapa assentado, se houver mapa (`data-map-settled="true"`);
 *   3. quiescência: uma impressão digital de CONTAGENS igual em três leituras
 *      seguidas. Contagens (nós, altura, imagens pendentes, animações a correr)
 *      são estáveis mesmo com relógios e marquees a mexer — o que não é estável
 *      é a página a meio de carregar.
 *
 * Se não convergir, NÃO se inventa: o chamador regista `nao-assentou` com a
 * assinatura, porque uma página que nunca assenta é em si um defeito.
 */

const SIGNATURE = `() => {
  const nosso = (a) => {
    const el = (a.effect && a.effect.target) || null;
    return !(el && el.closest && el.closest('.leaflet-container'));
  };
  return [
    document.querySelectorAll('*').length,
    document.documentElement.scrollHeight,
    document.querySelectorAll('main *').length,
    document.images.length,
    [...document.images].filter((i) => !i.complete).length,
    document.querySelectorAll('.leaflet-container:not([data-map-settled="true"])').length,
    document.getAnimations().filter((a) => a.playState === 'running' && nosso(a)).length,
    document.querySelectorAll('img[loading="lazy"]').length,
  ].join('|');
}`;

export interface SettleResult {
  ok: boolean;
  samples: number;
  signature: string;
  ms: number;
}

export async function settlePage(
  page: Page,
  opts: {
    intervalMs?: number;
    stableReads?: number;
    timeoutMs?: number;
    /**
     * Tecto da espera pelo mapa. ARMADILHA (medida 2026-09-27): esta espera
     * corre DENTRO do orçamento de `timeoutMs`, por isso um mapa que nunca
     * assenta consome-o todo e o laço de quiescência sai com `samples` baixo.
     * Pior: com `timeoutMs` generoso (12 s) sobram ~2 s, chegam para as três
     * leituras e o resultado sai `ok: true` — «assentou» sem o mapa ter
     * assentado. E o mapa de PRÉ-VISUALIZAÇÃO da página de spot (344×214) NUNCA
     * recebe `data-map-settled` (o contrato só é cumprido pelo `useMapCore`, que
     * o põe no `moveend`): eram 10 s mortos por cada captura de spot. Passar
     * `mapTimeoutMs` curto quando o mapa pode não assentar.
     */
    mapTimeoutMs?: number;
  } = {},
): Promise<SettleResult> {
  const intervalMs = opts.intervalMs ?? 200;
  const stableReads = opts.stableReads ?? 3;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const mapTimeoutMs = opts.mapTimeoutMs ?? 10_000;
  const started = Date.now();

  // 1. Fontes: mudam a largura de tudo, e chegam depois do `is-hydrated`.
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);

  // 2. Mapa: o varrimento mede depois de ele assentar; sem isto a
  //    translação do pane do Leaflet entra na conta como se fosse layout.
  const hasMap = await page.locator('.leaflet-container').count().catch(() => 0);
  if (hasMap > 0) {
    await page
      .locator('.leaflet-container[data-map-settled="true"]')
      .first()
      .waitFor({ timeout: mapTimeoutMs })
      .catch(() => undefined);
  }

  // 3. Quiescência por contagens.
  let last = '';
  let streak = 0;
  let samples = 0;
  while (Date.now() - started < timeoutMs) {
    // `(${SIGNATURE})()` e não `SIGNATURE`: o Playwright avalia uma string como
    // EXPRESSÃO — uma arrow function entrega-se a si mesma e serializa para
    // `undefined`, pelo que o laço nunca veria duas leituras iguais.
    const sig = (await page.evaluate(`(${SIGNATURE})()`).catch(() => '')) as string;
    if (!sig) throw new Error('settle: impressão digital não devolveu nada');
    samples++;
    if (sig && sig === last) streak++;
    else streak = 1;
    last = sig;
    if (streak >= stableReads) {
      return { ok: true, samples, signature: sig, ms: Date.now() - started };
    }
    await page.waitForTimeout(intervalMs);
  }
  return { ok: false, samples, signature: last, ms: Date.now() - started };
}
