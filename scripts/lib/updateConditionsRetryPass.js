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
 */

/** Pausa antes de cada passagem (ms) — um outage de minutos recupera. */
const RETRY_PASS_DELAY_MS = 120_000;

/** Passagens extra máximas depois do loop principal. */
const MAX_RETRY_PASSES = 2;

/**
 * @param {string[]} ids — spots primários cujo processSpot falhou no loop.
 * @param {(id: string) => Promise<void>} run — re-pede um spot; throw = falha.
 * @param {(ms: number) => Promise<void>} sleep — injetável (testes sem espera).
 * @param {number} [delayMs] — pausa antes de cada passagem.
 * @param {number} [maxPasses] — máximo de passagens.
 * @param {{warn: Function, log: Function}} [log] — logger injetável.
 * @returns {Promise<string[]>} ids ainda em falha — o carry-over trata deles.
 */
async function retryFailedSpots({ ids, run, sleep, delayMs = RETRY_PASS_DELAY_MS, maxPasses = MAX_RETRY_PASSES, log = console }) {
  let remaining = [...ids];
  for (let pass = 1; pass <= maxPasses && remaining.length > 0; pass += 1) {
    await sleep(delayMs);
    const recovered = new Set();
    for (const id of remaining) {
      try {
        await run(id);
        recovered.add(id);
      } catch (error) {
        log.warn(`  ✗ repetição ${pass} — ${id} falhou: ${error.message}`);
      }
    }
    log.log(`🔁 Repetição ${pass}/${maxPasses}: ${remaining.length} spot(s) em falha — recuperados ${recovered.size}`);
    remaining = remaining.filter((id) => !recovered.has(id));
  }
  return remaining;
}

module.exports = { retryFailedSpots, RETRY_PASS_DELAY_MS, MAX_RETRY_PASSES };
