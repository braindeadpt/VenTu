/** Cadência de refresh partilhada (mapa, home, spot). Folha sem deps: importar
 * daqui não arrasta o motor de scores para o bundle da página. */
export const REFRESH_MS = 15 * 60 * 1000;
/** Voltar ao separador só refresca se o último refresh tiver ≥ 5 min. */
export const VISIBILITY_REFRESH_MIN_MS = 5 * 60 * 1000;

/** Decide se o regresso ao separador justifica um refresh (pura, testável). */
export function shouldRefreshOnVisible(lastRefreshAt: number, nowMs: number): boolean {
  return nowMs - lastRefreshAt >= VISIBILITY_REFRESH_MIN_MS;
}
