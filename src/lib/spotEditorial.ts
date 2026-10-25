/**
 * Campos editoriais dos spots para o motor de modalidades e a página v6
 * (#184; a home #183 lê o mesmo). Os spots curados (os 19 da maquete v6, com
 * as variantes da Lagoa de Óbidos) estão em `spotEditorial.json`, ligados aos
 * ids reais de `src/lib/spots.ts` (`lagoa-obidos` → `obidos-lagoon`,
 * `caparica` → `costa-caparica`, `meia-praia` → `lagos`, `viana` → `cabedelo`).
 *
 * Regra dos defaults (spots sem entrada; `estimado: true`, a UI diz-o):
 * - `praiaVirada` = `coastOrientation` (#178);
 * - janela de ondulação = praiaVirada ± 30°, tolerância 25° (a dos curados);
 * - terral = (praiaVirada + 180°) ± 40°;
 * - vento bom (kite) = praiaVirada + 20° a + 100° (lateral de mar pelo norte:
 *   a nortada, como nos curados);
 * - água plana = não; tipo de água = mar aberto;
 * - zona pela latitude/longitude (ver `zonaDe`).
 * Só informam a tabela «Estudar o spot» e a janela do surf; os limiares da
 * nota estão todos em `modalidades-def.json`.
 */
import data from './spotEditorial.json';
import type { Spot } from '@/types';
import type { SpotModalidade } from '@/lib/modalidades';

export type TipoAgua = 'mar-aberto' | 'agua-plana';
export type Zona = 'norte' | 'oeste' | 'lisboa' | 'alentejo' | 'vicentina' | 'sagres' | 'algarve' | 'acores' | 'madeira';

export interface EditorialSpot {
  praiaVirada: number;
  zona: Zona;
  concelho?: string;
  kite: { bom: [number, number]; ideal?: [number, number] };
  surf: { janela: [number, number]; terral: [number, number]; tol: number };
  aguaPlana: boolean;
  tipoAgua: TipoAgua;
  /** Água interior (de `Spot.aguaInterior`): sem on/offshore. */
  aguaInterior?: true;
  atencao?: { pt: string; en: string };
  melhorMare?: { pt: string; en: string };
  /**
   * Rótulos da praia em 3D escolhidos à mão (como os da maquete no Guincho):
   * o nome da praia, o ponto onde fica e os lugares a mostrar. Sem isto, a
   * cena usa o nome do spot, o pico e as localidades OSM.
   */
  rotulos?: {
    praia: string;
    ll: [number, number];
    /** centro da vista plana (a caixa da maquete), quando difere do centro da câmara 3D */
    centroPlano?: [number, number];
    /** caixa das frentes de onda na vista plana [oeste, sul, este, norte] (a da maquete), quando difere da regra geral */
    caixaFrentes?: [number, number, number, number];
    lugares: Array<{ n: string; ll: [number, number]; ele?: number }>;
  };
  /** Valores derivados da orientação (sem entrada editorial). */
  estimado: boolean;
  maqueteId?: string;
}

type Entrada = Omit<EditorialSpot, 'estimado'>;
const CURADOS = (data as unknown as { spots: Record<string, Entrada> }).spots;

const n360 = (x: number) => ((Math.round(x) % 360) + 360) % 360;

/** Zona aproximada pela posição (só para agrupar; não entra na nota). */
export function zonaDe(lat: number, lon: number): Zona {
  if (lon < -20) return 'acores';
  if (lat < 34) return 'madeira';
  if (lat >= 40.9) return 'norte';
  if (lat >= 38.9) return 'oeste';
  if (lat >= 38.35) return 'lisboa';
  if (lat >= 37.6) return 'alentejo';
  if (lat >= 37.05 && lon < -8.75) return 'vicentina';
  if (lon < -8.8) return 'sagres';
  return 'algarve';
}

export function editorialDe(
  spot: Pick<Spot, 'id' | 'lat' | 'lon' | 'coastOrientation'> & Partial<Pick<Spot, 'aguaInterior'>>,
): EditorialSpot {
  const c = CURADOS[spot.id];
  const ai = spot.aguaInterior ? ({ aguaInterior: true } as const) : {};
  if (c) return { ...c, ...ai, estimado: false };
  const v = n360(spot.coastOrientation ?? 270);
  return {
    praiaVirada: v,
    zona: zonaDe(spot.lat, spot.lon),
    kite: { bom: [n360(v + 20), n360(v + 100)] },
    surf: { janela: [n360(v - 30), n360(v + 30)], terral: [n360(v + 140), n360(v + 220)], tol: 25 },
    aguaPlana: false,
    tipoAgua: spot.aguaInterior ? 'agua-plana' : 'mar-aberto',
    ...ai,
    estimado: true,
  };
}

/** O que o motor lê de um spot. */
export function spotModalidadeDe(e: EditorialSpot): SpotModalidade {
  return {
    praiaVirada: e.praiaVirada,
    surf: { janela: e.surf.janela, tol: e.surf.tol },
    aguaPlana: e.aguaPlana,
    ...(e.aguaInterior ? { aguaInterior: true } : {}),
  };
}

export const SPOTS_CURADOS = Object.keys(CURADOS);
