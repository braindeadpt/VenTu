/**
 * Basemap do lab: estilo «dark» do OpenFreeMap (público, sem chave, sem
 * cookies, uso comercial permitido — https://openfreemap.org), retingido para
 * um mar azul-ardósia e uma terra mais escura que o mar, para que a água seja
 * o protagonista.
 */
import type { StyleSpecification, LayerSpecification, FilterSpecification } from 'maplibre-gl';

export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export const OCEAN = '#0a1828';
export const LAND = '#0d131c';
export const COAST = 'rgba(148, 163, 184, 0.38)';

/** Primeira camada de símbolos (etiquetas): o vento passa por baixo dos nomes. */
export const LABELS_BEFORE = 'highway_name_other';

export async function loadBaseStyle(signal?: AbortSignal): Promise<StyleSpecification> {
  const res = await fetch(OPENFREEMAP_STYLE_URL, { signal });
  if (!res.ok) throw new Error(`style ${res.status}`);
  const style = (await res.json()) as StyleSpecification;

  const layers: LayerSpecification[] = [];
  for (const layer of style.layers) {
    const l = { ...layer } as LayerSpecification & { paint?: Record<string, unknown> };
    if (l.id === 'background') {
      l.paint = { 'background-color': OCEAN };
    } else if (l.id === 'water') {
      // O oceano fica a cargo do fundo + cristas; aqui só lagos, rios e estuários,
      // desenhados POR CIMA da máscara de terra (ver MarVivoMap).
      const f = (l as { filter?: FilterSpecification }).filter;
      (l as { filter?: FilterSpecification }).filter = [
        'all',
        ...(f ? [f] : []),
        ['!=', ['get', 'class'], 'ocean'],
      ] as FilterSpecification;
      l.paint = { ...(l.paint ?? {}), 'fill-color': OCEAN };
    } else if (l.id === 'waterway') {
      l.paint = { ...(l.paint ?? {}), 'line-color': '#11233a' };
    } else if (l.id === 'water_name') {
      continue; // nomes de oceano/rio competem com as cristas
    } else if (l.type === 'fill' && (l.id.startsWith('landuse') || l.id.startsWith('landcover'))) {
      l.paint = { ...(l.paint ?? {}), 'fill-opacity': 0.35 };
    }
    layers.push(l);
  }
  return { ...style, layers };
}
