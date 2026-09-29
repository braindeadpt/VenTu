/** NASA GIBS — imagem real de satélite (MODIS Terra true-color), keyless.
 *
 *  O segmento `default` no slot TIME do REST WMTS serve sempre a data mais
 *  recente disponível do produto (~3 h após o passe) — sem lógica de data no
 *  cliente. A resposta vem com `Cache-Control: no-store`, por isso o browser
 *  revalida e o «hoje» nunca fica parado a um dia anterior.
 *
 *  Cobertura útil: nuvens e frentes a chegar à costa — não é um basemap (o
 *  basemap satélite Esri é fotografia histórica), é o céu de agora.
 *
 *  Resolução: GoogleMapsCompatible_Level9 (~250 m/px no tile z9). Acima de
 *  z9 não há tiles — `maxNativeZoom: 9` faz o Leaflet esticar o último nível
 *  (a imagem é nuvens, não detalhe de rua — o stretch é aceitável). */

export const GIBS_SATELLITE_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg';

export const GIBS_SATELLITE_NATIVE_MAX_ZOOM = 9;

export const GIBS_SATELLITE_ATTRIBUTION =
  'Imagery © <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a> (EOSDIS/MODIS Terra)';

/** Pane própria imediatamente acima do tilePane (200) e por baixo da
 *  batimetria (210): a imagem é opaca e substitui o basemap enquanto ligada
 *  — fields (345+), radar (400) e marcadores (600+) continuam por cima. */
export const MAP_GIBS_SAT_PANE = 'ventu-gibs-sat';
export const MAP_GIBS_SAT_PANE_Z = '205';
