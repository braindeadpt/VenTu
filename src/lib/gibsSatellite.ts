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

/** Tiles «sem dados» do GIBS são JPEGs 100% pretos — acontece de noite
 *  (true-color não vê nada), fora do disco do satélite e antes do passe do
 *  dia. Sem tratamento, a camada opaca cobre o mapa inteiro de preto e o
 *  utilizador lê «mapa avariado». Como o GIBS manda
 *  `Access-Control-Allow-Origin: *`, pedimos os tiles com `crossOrigin` e
 *  amostramos os pixels — tiles ~todo pretos são escondidos e o basemap
 *  aparece por baixo.
 *
 *  O corte é deliberadamente baixo: o «sem dados» é #000 puro; o oceano
 *  real de dia é azul-escuro (max canal ~30-60), nunca <14. */
export const GIBS_BLANK_SAMPLE = 32;
export const GIBS_BLANK_CHANNEL_MAX = 14;
export const GIBS_BLANK_TILE_RATIO = 0.9;

/** Fracção de pixels «vazios» (quase pretos) num buffer RGBA amostrado.
 *  Exportada para testes — `gibsTileIsBlank` trata da parte DOM/canvas. */
export function gibsBlankPixelRatio(data: ArrayLike<number>, pixelCount: number): number {
  if (pixelCount <= 0) return 0;
  let blank = 0;
  for (let i = 0; i < pixelCount * 4; i += 4) {
    if (Math.max(data[i], data[i + 1], data[i + 2]) < GIBS_BLANK_CHANNEL_MAX) blank++;
  }
  return blank / pixelCount;
}

let blankCanvas: HTMLCanvasElement | null = null;

/** `img` é um tile GIBS já carregado. Devolve true quando ≥90% do tile é
 *  quase preto — «sem dados». Em caso de erro (canvas indisponível, etc.)
 *  devolve false: preferimos mostrar um tile suspeito a esconder um bom. */
export function gibsTileIsBlank(img: HTMLImageElement): boolean {
  try {
    blankCanvas ??= document.createElement('canvas');
    blankCanvas.width = GIBS_BLANK_SAMPLE;
    blankCanvas.height = GIBS_BLANK_SAMPLE;
    const ctx = blankCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, GIBS_BLANK_SAMPLE, GIBS_BLANK_SAMPLE);
    const { data } = ctx.getImageData(0, 0, GIBS_BLANK_SAMPLE, GIBS_BLANK_SAMPLE);
    return gibsBlankPixelRatio(data, GIBS_BLANK_SAMPLE * GIBS_BLANK_SAMPLE) >= GIBS_BLANK_TILE_RATIO;
  } catch {
    return false;
  }
}
