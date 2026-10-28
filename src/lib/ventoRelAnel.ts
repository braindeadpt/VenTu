/**
 * Anel do vento do /mapa (#218, PR 6, decisão do Pedro 27/10): a cor sai da
 * MESMA classificação do vento que o motor v6 usa (`ventoRel` em
 * `modalidades/avalia.ts`), em vez dos limiares próprios de
 * `getWindRelationToCoast` (67,5° / 112,5°):
 *
 * - `mar` (≤ 30°) e `lat-mar` (≤ 65°)       → onshore;
 * - `lat` (≤ 110°)                          → cross;
 * - `lat-terra` (≤ 150°) e `terra` (> 150°) → offshore.
 *
 * Mantém as 3 cores do anel. Módulo LEVE de propósito (vai no bundle do
 * /mapa): só os limiares, nada do motor — o teste
 * `ventoRelAnel.test.ts` garante que bate com `ventoRel` em todos os ângulos.
 * A praia é `praiaVirada` = `coastOrientation` (#178; o teste confirma que
 * os curados de `spotEditorial.json` também coincidem). Água interior
 * (`orientacaoVento` → `undefined`) não tem relação, como antes.
 */
import type { WindRelation } from '@/lib/wind';

export type VentoRelKAnel = 'mar' | 'lat-mar' | 'lat' | 'lat-terra' | 'terra';

/** Limites (graus, inclusivos) entre classes — os de `ventoRel`. */
export const VENTO_REL_LIMITES = { mar: 30, latMar: 65, lat: 110, latTerra: 150 } as const;

/** a − b em −180..180 (o `dif` do motor). */
const dif = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/** Classe do vento (de onde VEM, graus) face à praia (`praiaVirada`, para onde olha). */
export function ventoRelKAnel(windFromDeg: number, praiaVirada: number): VentoRelKAnel {
  const a = Math.abs(dif(windFromDeg, praiaVirada));
  if (a <= VENTO_REL_LIMITES.mar) return 'mar';
  if (a <= VENTO_REL_LIMITES.latMar) return 'lat-mar';
  if (a <= VENTO_REL_LIMITES.lat) return 'lat';
  if (a <= VENTO_REL_LIMITES.latTerra) return 'lat-terra';
  return 'terra';
}

/** Classe do `ventoRel` → cor do anel (3 cores). */
export function relacaoAnelDeK(k: VentoRelKAnel): WindRelation {
  if (k === 'mar' || k === 'lat-mar') return 'onshore';
  if (k === 'lat') return 'cross';
  return 'offshore';
}

/** Relação do anel do vento; `null` sem orientação (água interior / spot sem costa). */
export function relacaoAnelVento(windFromDeg: number, praiaVirada: number | undefined): WindRelation | null {
  if (praiaVirada === undefined || !Number.isFinite(praiaVirada) || !Number.isFinite(windFromDeg)) return null;
  return relacaoAnelDeK(ventoRelKAnel(windFromDeg, praiaVirada));
}
