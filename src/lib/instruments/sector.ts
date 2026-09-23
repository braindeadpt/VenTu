/**
 * Sectores ideais dos instrumentos (docs/design/SPOT-PAGE.md §4).
 *
 * `spot.bestWind`/`spot.bestSwell` são listas de pontos cardeais de 16
 * ("N, NNW", "SW, W"). O sector ideal é o MENOR arco que contém todas as
 * direcções listadas — encontrado como o complemento do maior intervalo
 * livre entre elas — alargado ±11,25° (meia distância entre pontos
 * cardeais) para cobrir as direcções vizinhas implícitas.
 *
 * Convenção meteorológica: graus = direcção de ONDE VEM o vento/onda,
 * 0 = N, 90 = E. Sectores podem exceder 360° (wrap no N): [326.25, 371.25].
 */

const CARD16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

const CARD16_DEG: Record<string, number> = Object.fromEntries(
  CARD16.map((c, i) => [c, i * 22.5]),
);

/** Metade da distância entre pontos cardeais de 16 — margem do sector. */
const SECTOR_PAD = 11.25;

export type Sector = readonly [number, number];

/** Normaliza graus para [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Cardinal de 16 pontos mais próximo de `deg` («N», «SSW», …). */
export function cardinal16(deg: number): string {
  return CARD16[Math.round(normalizeDeg(deg) / 22.5) % 16];
}

/**
 * Sector ideal [a0, a1] em graus a partir de uma lista «N, NNW».
 * Devolve null para listas vazias ou sem pontos cardeais reconhecidos
 * (ex.: «Rio», «Lagoa» — spots de rio/lagoa não têm sector de mar).
 */
export function idealSector(spec?: string | null): Sector | null {
  const bounds = String(spec ?? '')
    .split(',')
    .map((s) => CARD16_DEG[s.trim()])
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);
  if (bounds.length === 0) return null;

  // Maior intervalo livre entre direcções consecutivas (com wrap).
  let gapStart = 0;
  let gapMax = -1;
  for (let i = 0; i < bounds.length; i += 1) {
    const next = i + 1 < bounds.length ? bounds[i + 1] : bounds[0] + 360;
    const gap = next - bounds[i];
    if (gap > gapMax) {
      gapMax = gap;
      gapStart = i;
    }
  }

  // O sector é o complemento do maior intervalo livre.
  const start = bounds[(gapStart + 1) % bounds.length];
  let end = bounds[gapStart];
  if (end < start) end += 360;

  let a0 = start - SECTOR_PAD;
  let a1 = end + SECTOR_PAD;
  if (a0 < 0) {
    a0 += 360;
    a1 += 360;
  }
  return [a0, a1];
}

/** `deg` dentro do sector? O sector pode exceder 360° (wrap no N). */
export function inSector(deg: number, sector: Sector | null | undefined): boolean {
  if (!sector) return false;
  let x = normalizeDeg(deg);
  while (x < sector[0]) x += 360;
  return x <= sector[1];
}
