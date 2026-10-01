/** NASA GIBS — imagem real de satélite (MODIS Terra true-color), keyless.
 *
 *  O segmento `default` no slot TIME do REST WMTS serve sempre a data mais
 *  recente disponível do produto (~3 h após o passe) — sem lógica de data no
 *  cliente. A resposta vem com `Cache-Control: no-store`, por isso o browser
 *  revalida e o «hoje» nunca fica parado a um dia anterior.
 *
 *  ATENÇÃO — `default` é HOJE, e o mosaico de hoje só se preenche depois do
 *  passe (Terra ~10:30 UTC sobre Ibéria + ~3 h de processamento): de manhã
 *  o tile de hoje é o tile «sem dados» em TODOS os satélites (medido a 30 set
 *  09:34 UTC: 1665 B contra 10 KB do dia anterior) e a camada ficava ligada
 *  sem mostrar nada. Como o Worldview da NASA, empilha-se o mosaico de
 *  ONTEM (completo) por baixo do de hoje (parcial, sem dados → transparente):
 *  onde o passe de hoje já existe vê-se hoje, onde não, vê-se ontem.
 *
 *  Cobertura útil: nuvens e frentes a chegar à costa — não é um basemap (o
 *  basemap satélite Esri é fotografia histórica), é o céu de agora.
 *
 *  Resolução: GoogleMapsCompatible_Level9 (~250 m/px no tile z9). Acima de
 *  z9 não há tiles — `maxNativeZoom: 9` faz o Leaflet esticar o último nível
 *  (a imagem é nuvens, não detalhe de rua — o stretch é aceitável). */

import type L from 'leaflet';

const GIBS_SATELLITE_BASE =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default';
const GIBS_SATELLITE_TAIL = 'GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg';

/** Mosaico de HOJE (slot `default`): parcial até o passe ser processado. */
export const GIBS_SATELLITE_URL = `${GIBS_SATELLITE_BASE}/default/${GIBS_SATELLITE_TAIL}`;

/** Mosaico de um dia UTC concreto (YYYY-MM-DD) — a camada de baixo. */
export function gibsSatelliteDayUrl(day: string): string {
  return `${GIBS_SATELLITE_BASE}/${day}/${GIBS_SATELLITE_TAIL}`;
}

/** Dia UTC anterior ao de `nowMs`, em YYYY-MM-DD (o GIBS data em UTC). */
export function gibsPreviousDayUtc(nowMs: number = Date.now()): string {
  return new Date(nowMs - 86_400_000).toISOString().slice(0, 10);
}

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

/** Flag de idempotência no dataset do próprio <img>: reescrever `img.src`
 *  com o PNG mascarado dispara novo `tileload` (novo carregamento do
 *  data-URL) e sem guarda cada tile misto pagava a máscara completa —
 *  `getImageData` 256² + `toDataURL` — duas vezes, com uma repintura a
 *  meio. Os tiles mistos (limbo do disco, terminador noite/dia, nesga de
 *  swath) são precisamente os que dominam ao fazer zoom-out: flashes e
 *  jank até a camada parecer «crashada». */
const TILE_MASKED_FLAG = 'ventuMasked';

/** `img` é um tile GIBS já carregado (crossOrigin anónimo). Três saídas:
 *  — sem pixels pretos: não toca (devolve false);
 *  — 100% «sem dados»: esconde o tile (display:none);
 *  — misto: substitui o src por PNG com alpha — preto vira transparente e
 *    o basemap aparece por baixo, a nesga de imagem real fica visível.
 *  Tiles já processados devolvem true sem tocar em nada (ver
 *  TILE_MASKED_FLAG) — o segundo `tileload` do data-URL é indistinguível
 *  do primeiro.
 *  Em caso de erro devolve false: preferimos mostrar um tile suspeito a
 *  esconder um bom. */
export function gibsTileMaskBlank(img: HTMLImageElement): boolean {
  try {
    // Verificado ANTES de tocar no canvas/document: também torna a função
    // testável em Node (ambiente dos testes unitários) com um fake.
    const dataset = (img as unknown as { dataset?: DOMStringMap } | null)?.dataset;
    if (dataset?.[TILE_MASKED_FLAG]) return true;
    const markMasked = () => {
      try {
        if (dataset) dataset[TILE_MASKED_FLAG] = '1';
      } catch {
        /* noop — dataset só de leitura num fake esquisito */
      }
    };
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
      markMasked();
      return true;
    }
    ctx.putImageData(imageData, 0, 0);
    img.src = maskCanvas.toDataURL('image/png');
    markMasked();
    return true;
  } catch {
    return false;
  }
}

interface MaskableStyle {
  visibility?: string;
  display?: string;
}

type MaskableImg =
  | HTMLImageElement
  | { dataset?: DOMStringMap | Record<string, string>; style?: MaskableStyle };

function asMaskable(img: unknown): Exclude<MaskableImg, HTMLImageElement> | null {
  if (!img || typeof img !== 'object') return null;
  return img as { dataset?: DOMStringMap; style?: CSSStyleDeclaration };
}

/** Esconde o tile ao arrancar o pedido — a decisão da máscara só existe no
 *  `tileload`, e sem isto os tiles «sem dados» pintavam pretos e eram
 *  escondidos um a um: flashes pretos a cada zoom/pan. Testável em Node. */
export function gibsTileHideUntilMasked(img: MaskableImg | null | undefined): void {
  try {
    const el = asMaskable(img);
    if (!el || el.dataset?.[TILE_MASKED_FLAG]) return;
    if (el.style) el.style.visibility = 'hidden';
  } catch {
    /* noop — esconder é optimização, nunca pode partir */
  }
}

/** Revela o tile após a máscara — menos os 100% «sem dados»
 *  (`display:none`), que continuam escondidos. Também usada no `tileerror`:
 *  um tile partido é melhor que um buraco. Testável em Node. */
export function gibsTileReveal(img: MaskableImg | null | undefined): void {
  try {
    const el = asMaskable(img);
    if (!el?.style || el.style.display === 'none') return;
    el.style.visibility = '';
  } catch {
    /* noop */
  }
}

/** Liga a tríade anti-flash numa camada de tiles GIBS (true-color e IR
 *  usam-na): esconder ao arrancar → mascarar ao carregar → revelar o que
 *  tem conteúdo. Sem isto, cada zoom-out repintava dezenas de tiles pretos
 *  antes de os esconder — o «flash» reportado no desktop. */
export function gibsAttachTileMask(layer: L.TileLayer): void {
  layer.on('tileloadstart', (e: L.TileEvent) => {
    gibsTileHideUntilMasked(e.tile as HTMLImageElement | undefined);
  });
  layer.on('tileload', (e: L.TileEvent) => {
    const tile = e.tile as HTMLImageElement | undefined;
    if (!tile) return;
    gibsTileMaskBlank(tile);
    gibsTileReveal(tile);
  });
  layer.on('tileerror', (e: L.TileEvent) => {
    gibsTileReveal(e.tile as HTMLImageElement | undefined);
  });
}
