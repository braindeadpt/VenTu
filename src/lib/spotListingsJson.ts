/**
 * Listagem de spots do /mapa como UMA string JSON nas props do RSC (TBT).
 *
 * Um array de objectos nas props de um client component é codificado pelo
 * React Flight como um modelo que o cliente reconstrói valor a valor (~700 KB
 * no /mapa, no arranque e outra vez no prefetch da própria rota). Uma string
 * grande vai como bloco de texto e o cliente faz um único `JSON.parse`
 * nativo. As listagens são dados JSON puros (sem Date/Map/undefined/NaN) —
 * o teste de ida e volta garante que nada se perde.
 */
export function serializeSpotListings<T>(rows: T[]): string {
  return JSON.stringify(rows);
}

export function parseSpotListings<T>(json: string): T[] {
  return JSON.parse(json) as T[];
}
