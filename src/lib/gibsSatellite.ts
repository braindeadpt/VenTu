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

/** Tiles «sem dados» do GIBS são JPEGs com zonas 100% pretas — acontece de
 *  noite (true-color não vê nada), fora do disco do satélite e antes do
 *  passe do dia; a nesga de swath do dia deixa o resto do tile preto também.
 *  Sem tratamento, a camada opaca cobre o mapa de preto e o utilizador lê
 *  «mapa avariado». Como o GIBS manda `Access-Control-Allow-Origin: *`,
 *  pedimos os tiles com `crossOrigin` e mascaramos os pixels sem dados para
 *  transparente — o basemap aparece por baixo e a imagem real fica visível.
 *
 *  O corte é deliberadamente baixo: o «sem dados» é #000 puro; o oceano
 *  real de dia é azul-escuro (max canal ~30-60), nunca <14. */
export const GIBS_BLANK_SAMPLE = 32;
export const GIBS_BLANK_CHANNEL_MAX = 14;

/** Fracção de pixels «vazios» (quase pretos) num buffer RGBA amostrado.
 *  Exportada para testes — as funções de tile tratam da parte DOM/canvas. */
export function gibsBlankPixelRatio(data: ArrayLike<number>, pixelCount: number): number {
  if (pixelCount <= 0) return 0;
  let blank = 0;
  for (let i = 0; i < pixelCount * 4; i += 4) {
    if (Math.max(data[i], data[i + 1], data[i + 2]) < GIBS_BLANK_CHANNEL_MAX) blank++;
  }
  return blank / pixelCount;
}

/** Marca pixels «sem dados» como transparentes num buffer RGBA in-place.
 *  Devolve quantos pixels têm conteúdo real. Exportada para testes. */
export function gibsMaskPixels(data: Uint8ClampedArray): number {
  let content = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (Math.max(data[i], data[i + 1], data[i + 2]) < GIBS_BLANK_CHANNEL_MAX) data[i + 3] = 0;
    else content++;
  }
  return content;
}

let blankCanvas: HTMLCanvasElement | null = null;
let maskCanvas: HTMLCanvasElement | null = null;

/** `img` é um tile GIBS já carregado (crossOrigin anónimo). Três saídas:
 *  — sem pixels pretos: não toca (devolve false);
 *  — 100% «sem dados»: esconde o tile (display:none);
 *  — misto: substitui o src por PNG com alpha — preto vira transparente e
 *    o basemap aparece por baixo, a nesga de imagem real fica visível.
 *  Em caso de erro devolve false: preferimos mostrar um tile suspeito a
 *  esconder um bom. */
export function gibsTileMaskBlank(img: HTMLImageElement): boolean {
  try {
    // Amostra barata primeiro: sem preto nenhum → nada a fazer.
    blankCanvas ??= document.createElement('canvas');
    blankCanvas.width = GIBS_BLANK_SAMPLE;
    blankCanvas.height = GIBS_BLANK_SAMPLE;
    const probe = blankCanvas.getContext('2d', { willReadFrequently: true });
    if (!probe) return false;
    probe.drawImage(img, 0, 0, GIBS_BLANK_SAMPLE, GIBS_BLANK_SAMPLE);
    const sample = probe.getImageData(0, 0, GIBS_BLANK_SAMPLE, GIBS_BLANK_SAMPLE).data;
    if (gibsBlankPixelRatio(sample, GIBS_BLANK_SAMPLE * GIBS_BLANK_SAMPLE) === 0) return false;

    // 100% sem dados → esconder (evita PNG transparente gigante).
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return false;
    maskCanvas ??= document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    if (gibsMaskPixels(imageData.data) === 0) {
      img.style.display = 'none';
      return true;
    }
    ctx.putImageData(imageData, 0, 0);
    img.src = maskCanvas.toDataURL('image/png');
    return true;
  } catch {
    return false;
  }
}
