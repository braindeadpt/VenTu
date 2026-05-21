// Mapa de municípios/distritos para regiões macro
// Usado em filtros de região — os spots guardam municípios, mas os filtros usam regiões macro

export const MACRO_REGIONS = [
  'Todos', 'Norte', 'Centro', 'Lisboa', 'Alentejo', 'Algarve', 'Açores', 'Madeira'
] as const;

export type MacroRegion = typeof MACRO_REGIONS[number];

const MUNICIPALITY_TO_REGION: Record<string, MacroRegion> = {
  // Norte
  'Porto': 'Norte',
  'Viana do Castelo': 'Norte',
  'Braga': 'Norte',
  'Esposende': 'Norte',
  'Vila do Conde': 'Norte',
  'Caminha': 'Norte',
  'Ovar': 'Norte',
  'Aveiro': 'Norte',
  'Espinho': 'Norte',

  // Centro
  'Nazaré': 'Centro',
  'Oeste': 'Centro',
  'Santarém': 'Centro',
  'Figueira da Foz': 'Centro',
  'Óbidos': 'Centro',
  'Cantanhede': 'Centro',
  'Lourinhã': 'Centro',
  'Caldas da Rainha': 'Centro',

  // Lisboa
  'Cascais': 'Lisboa',
  'Ericeira': 'Lisboa',
  'Peniche': 'Lisboa',
  'Almada': 'Lisboa',
  'Sesimbra': 'Lisboa',
  'Sintra': 'Lisboa',
  'Torres Vedras': 'Lisboa',
  'Costa da Caparica': 'Lisboa',
  'Seixal': 'Lisboa',

  // Alentejo
  'Alentejo': 'Alentejo',
  'Zambujeira do Mar': 'Alentejo',

  // Algarve
  'Algarve': 'Algarve',
  'Sagres': 'Algarve',
  'Portimão': 'Algarve',
  'Lagos': 'Algarve',
  'Aljezur': 'Algarve',
  'Faro': 'Algarve',
  'Lagoa': 'Algarve',
  'Olhão': 'Algarve',
  'Tavira': 'Algarve',
  'Vila do Bispo': 'Algarve',
  'Carrapateira': 'Algarve',
  'Albufeira': 'Algarve',
  'Alvor': 'Algarve',
  'Vila Real de Santo António': 'Algarve',

  // Açores
  'São Miguel': 'Açores',
  'Terceira': 'Açores',
  'Santa Maria': 'Açores',
  'Faial': 'Açores',
  'Açores': 'Açores',
  'Pico': 'Açores',
  'São Jorge': 'Açores',

  // Madeira
  'Madeira': 'Madeira',
};

export function getMacroRegion(municipality: string): string {
  return MUNICIPALITY_TO_REGION[municipality] || '';
}
