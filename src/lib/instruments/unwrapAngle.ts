/**
 * Desenrola uma direcção para a rotação acumulada mais curta.
 *
 * Os feixes dos instrumentos rodam por `transform: rotate(deg)` com
 * transição CSS — sem unwrap, passar de 359° para 1° faria o feixe
 * girar 358° ao contrário. Devolvendo o equivalente modular de `next`
 * mais próximo de `prev` (359 → 361), a rotação toma sempre o caminho
 * curto e o relógio visual nunca dá a volta ao mostrador.
 */
export function unwrapAngle(prev: number, next: number): number {
  return prev + (((next - prev) % 360) + 540) % 360 - 180;
}
