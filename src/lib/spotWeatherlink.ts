/** Curated Davis WeatherLink embeds — on-site station UI only (no API). */

export interface SpotWeatherlinkStation {
  pageId: string;
  labelPt: string;
  labelEn: string;
}

const CABEDELO_VIANA_PAGE_ID = '0722f5db3b314dd9a179ba37f6c4b772';

const CABEDELO_VIANA: SpotWeatherlinkStation = {
  pageId: CABEDELO_VIANA_PAGE_ID,
  labelPt: 'Praia do Cabedelo — Viana do Castelo',
  labelEn: 'Cabedelo Beach — Viana do Castelo',
};

export const SPOT_WEATHERLINK: Record<string, SpotWeatherlinkStation> = {
  cabedelo: CABEDELO_VIANA,
  'foil-cabedelo': CABEDELO_VIANA,
};

export function getSpotWeatherlink(slug: string): SpotWeatherlinkStation | null {
  return SPOT_WEATHERLINK[slug] ?? null;
}

export function getWeatherlinkEmbedUrl(
  pageId: string,
  variant: 'fullscreen' | 'standard' = 'fullscreen',
): string {
  return `https://www.weatherlink.com/embeddablePage/show/${pageId}/${variant}`;
}

export function getWeatherlinkPageUrl(pageId: string): string {
  return getWeatherlinkEmbedUrl(pageId, 'fullscreen');
}
