/**
 * Trabalho em fatias (TBT): um gerador que faz `yield` nos pontos de corte
 * naturais (uma linha de grelha, um passo de tempo) corre-se de duas formas
 * com o MESMO código e o mesmo resultado:
 *  - `drainSteps` — síncrono, de uma vez (testes, scripts, fallback);
 *  - `runSliced` — em fatias de ≤ `budgetMs`, cedendo a main thread entre
 *    fatias (macrotask), para nenhum task passar os 50 ms que o Lighthouse
 *    conta como bloqueio. Resolve `null` se `isCancelled()` ficar true.
 */
export type Steps<T> = Generator<void, T, void>;

export function drainSteps<T>(it: Steps<T>): T {
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

export function runSliced<T>(
  it: Steps<T>,
  isCancelled: () => boolean = () => false,
  budgetMs = 8,
): Promise<T | null> {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return new Promise((resolve, reject) => {
    const slice = () => {
      if (isCancelled()) return resolve(null);
      const t0 = now();
      try {
        for (;;) {
          const r = it.next();
          if (r.done) return resolve(r.value);
          if (now() - t0 >= budgetMs) break;
        }
      } catch (e) {
        return reject(e);
      }
      setTimeout(slice, 0);
    };
    slice();
  });
}
