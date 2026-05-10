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
  
  // Centro
  'Nazaré': 'Centro',
  'Oeste': 'Centro',
  'Santarém': 'Centro',
  
  // Lisboa
  'Cascais': 'Lisboa',
  'Ericeira': 'Lisboa',
  'Peniche': 'Lisboa',
  'Almada': 'Lisboa',
  'Sesimbra': 'Lisboa',
  
  // Alentejo
  'Alentejo': 'Alentejo',
  
  // Algarve
  'Algarve': 'Algarve',
  'Sagres': 'Algarve',
  'Portimão': 'Algarve',
  'Lagos': 'Algarve',
  
  // Açores
  'São Miguel': 'Açores',
  'Terceira': 'Açores',
  'Santa Maria': 'Açores',
  'Faial': 'Açores',
  'Açores': 'Açores',
  
  // Madeira
  'Madeira': 'Madeira',
};

export function getMacroRegion(municipality: string): string {
  return MUNICIPALITY_TO_REGION[municipality] || municipality;
}
