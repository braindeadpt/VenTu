/**
 * Repetição de fim de run (incidente 2026-11-19, run update-data 44426138146):
 * o fetchWithRetry cobre ~4 s de falha transitória por pedido, mas um outage
 * de rede de ~4 minutos derrubou os primeiros 8 spots do catálogo — 8/189
 * ficou abaixo do limiar de 5 % do coverage gate, a run concluiu sucesso e o
 * ciclo de 3 tentativas do workflow nunca correu. Depois do loop principal
 * esperamos RETRY_PASS_DELAY_MS e repetimos SÓ os spots falhados — os mesmos
 * argumentos, o mesmo `usage` e o mesmo intervalo entre pedidos — no máx.
 * MAX_RETRY_PASSES vezes. O que recuperar conta como sucesso normal (o
 * chamador trata disso dentro de `run`); o que ficar cai no carry-over e no
 * coverage gate como antes.
 *
 * Dois guarda-costas para não gastar quota num outage total:
 *  - se os falhados forem mais de MAX_RETRY_FAILED_SHARE dos primários, a
 *    repetição é saltada — o ciclo de 3 tentativas do workflow trata disso;
 *  - se os primeiros EARLY_ABORT_STREAK pedidos de uma passagem falharem
 *    todos, o outage ainda está ativo — abortam-se essa e as seguintes.
 */

/** Pausa antes de cada passagem (ms) — um outage de minutos recupera. */
const RETRY_PASS_DELAY_MS = 120_000;

/** Passagens extra máximas depois do loop principal. */
const MAX_RETRY_PASSES = 2;

/** Fração máx. de primários em falha para a repetição correr — acima disto é falha generalizada. */
const MAX_RETRY_FAILED_SHARE = 0.25;

/** Falhas seguidas no início de uma passagem que a abortam (outage ainda ativo). */
const EARLY_ABORT_STREAK = 5;

/**
 * @param {string[]} ids — spots primários cujo processSpot falhou no loop.
 * @param {(id: string) => Promise<void>} run — re-pede um spot; throw = falha.
 * @param {(ms: number) => Promise<void>} sleep — injetável (testes sem espera).
 * @param {number} [totalPrimarios] — n.º de primários; habilita o gate de falha generalizada.
 * @param {number} [delayMs] — pausa antes de cada passagem.
 * @param {number} [maxPasses] — máximo de passagens.
 * @param {{warn: Function, log: Function}} [log] — logger injetável.
 * @returns {Promise<string[]>} ids ainda em falha — o carry-over trata deles.
 */
async function retryFailedSpots({ ids, run, sleep, totalPrimarios, delayMs = RETRY_PASS_DELAY_MS, maxPasses = MAX_RETRY_PASSES, log = console }) {
  if (typeof totalPrimarios === 'number' && ids.length > Math.ceil(totalPrimarios * MAX_RETRY_FAILED_SHARE)) {
    log.warn(`⚠️ Falha generalizada: ${ids.length}/${totalPrimarios}, sem repetição — o ciclo de tentativas do workflow trata disto`);
    return [...ids];
  }
  let remaining = [...ids];
  for (let pass = 1; pass <= maxPasses && remaining.length > 0; pass += 1) {
    await sleep(delayMs);
    const recovered = new Set();
    let attempted = 0;
    let aborted = false;
    for (const id of remaining) {
      attempted += 1;
      try {
        await run(id);
        recovered.add(id);
      } catch (error) {
        // `run` pode lançar strings ou erros externos — nunca assumir .message.
        log.warn(`  ✗ repetição ${pass} — ${id} falhou: ${error?.message ?? error}`);
        if (recovered.size === 0 && attempted >= EARLY_ABORT_STREAK) {
          aborted = true;
          break;
        }
      }
    }
    if (aborted) {
      remaining = remaining.filter((id) => !recovered.has(id));
      log.warn(`⚠️ Outage ainda ativo — os primeiros ${EARLY_ABORT_STREAK} pedidos da passagem ${pass} falharam; repetições abortadas, ${remaining.length} spot(s) seguem para carry-over/coverage`);
      break;
    }
    log.log(`🔁 Repetição ${pass}/${maxPasses}: ${remaining.length} spot(s) em falha — recuperados ${recovered.size}`);
    remaining = remaining.filter((id) => !recovered.has(id));
  }
  return remaining;
}

module.exports = { retryFailedSpots, RETRY_PASS_DELAY_MS, MAX_RETRY_PASSES, MAX_RETRY_FAILED_SHARE, EARLY_ABORT_STREAK };
