/** NASA GIBS — GOES-East ABI Band 13 «Clean IR», keyless (B5 do
 *  docs/STORM-STUDY.md).
 *
 *  O produto é infravermelho limpo a 10 min: os topos frios das nuvens
 *  mostram células de tempestade a formar-se sobre o Atlântico — a peça
 *  «a aproximar-se» que o radar (chuva já a cair) não dá. O slot TIME do
 *  REST WMTS aceita `default` (mais recente) ou um ISO exacto — para o
 *  carrossel animado usamos slots explícitos de 10 min.
 *
 *  Latência observada no GIBS: a gama mais recente do capabilities acabava
 *  ~35-40 min atrás do wall-clock real (ex.: fim 21:30Z às 22:08Z). O
 *  carrossel termina por isso GOES_IR_LAG_MS atrás — pedir um slot ainda
 *  não publicado daria tiles 404.
 *
 *  Resolução: GoogleMapsCompatible_Level6 (~2 km/px no tile z6). Acima de
 *  z6 o Leaflet estica — a imagem é massa de nuvens, não detalhe de rua.
 *  Cobertura GOES-East: disco completo centrado ~75°W — Ibéria/Açores/
 *  Madeira ficam no limbo oriental (válido para massas de nuvens; a costa
 *  exacta pertence ao radar IPMA, camada separada). */

export const GOES_IR_LAYER = 'GOES-East_ABI_Band13_Clean_Infrared';
export const GOES_IR_MATRIX_SET = 'GoogleMapsCompatible_Level6';
export const GOES_IR_NATIVE_MAX_ZOOM = 6;
export const GOES_IR_CADENCE_MIN = 10;
/** Quantos frames de 10 min compõem o carrossel (~2 h passadas). */
export const GOES_IR_FRAME_COUNT = 12;
/** Latência conservadora — o slot mais recente pedido fica ~45 min atrás
 *  para todos os tiles existirem quando o browser os pede. */
export const GOES_IR_LAG_MS = 45 * 60 * 1000;
/** Idade do slot mais recente a partir da qual o badge mostra «atrasado»
 *  — com lag próprio de ~45 min, passar de ~2 h significa produto em falta. */
export const GOES_IR_STALE_MAX_AGE_MIN = 120;

const GOES_IR_BASE = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${GOES_IR_LAYER}/default`;

/** URL de tile para um slot TIME exacto (ISO `YYYY-MM-DDTHH:MM:00Z`). */
export function goesIrTileUrl(isoTime: string): string {
  return `${GOES_IR_BASE}/${isoTime}/${GOES_IR_MATRIX_SET}/{z}/{y}/{x}.png`;
}

export interface GoesIrFrame {
  /** URL do template de tiles Leaflet para o frame. */
  url: string;
  /** Slot TIME real do produto (UTC, ISO com Z). */
  frameTime: string;
}

/** Alinha ao slot de 10 min igual ou anterior a `ms`. */
function floorToCadence(ms: number): number {
  return Math.floor(ms / (GOES_IR_CADENCE_MIN * 60_000)) * GOES_IR_CADENCE_MIN * 60_000;
}

function slotIso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Frames do carrossel, mais recente primeiro: `GOES_IR_FRAME_COUNT` slots
 * de 10 min a terminar GOES_IR_LAG_MS atrás de agora. Os slots são tempos
 * REAIS de aquisição do satélite — honestos por construção (um slot sem
 * tiles publicados simplesmente não pinta; nunca é inventado).
 */
export function goesIrFrames(nowMs: number = Date.now()): GoesIrFrame[] {
  const end = floorToCadence(nowMs - GOES_IR_LAG_MS);
  const out: GoesIrFrame[] = [];
  for (let i = 0; i < GOES_IR_FRAME_COUNT; i += 1) {
    const t = end - i * GOES_IR_CADENCE_MIN * 60_000;
    const frameTime = slotIso(t);
    out.push({ url: goesIrTileUrl(frameTime), frameTime });
  }
  return out;
}

const LISBON_TZ = 'Europe/Lisbon';

/** "18:35" em hora de Lisboa — os slots são UTC reais, a hora mostrada é
 *  a do utilizador (ao contrário do radar IPMA, cujo ISO já é wall-clock
 *  de Lisboa com Z falso). */
export function goesIrFrameClock(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleTimeString('pt-PT', {
    timeZone: LISBON_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "2026-09-29 21:20" em hora de Lisboa — tooltip completo do badge. */
export function goesIrFrameFullClock(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LISBON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** Rectângulo lat/lon que contém o disco GOES-East com margem (~10°): o
 *  capabilities do GIBS declara o mundo inteiro mas fora do disco só serve
 *  preto. Passado como `bounds` ao TileLayer para ao fazer zoom-out não
 *  pedir o vazio (Pacífico/Ásia) — menos tiles pretos a mascarar, menos
 *  flashes. Generoso de propósito: cortar um pixel válido do limbo seria
 *  pior que mascarar um tile preto.
 *
 *  Nota honesta de cobertura: o sub-satélite é ~75°W, por isso Portugal
 *  continental (~9°W) fica mesmo no limbo oriental do disco — a imagem aí
 *  é esborratada por física, não por código (o GIBS keyless não tem
 *  Meteosat). O IR vale pelos sistemas no Atlântico/Açores a aproximar-se;
 *  o detalhe da costa pertence ao radar IPMA, camada separada. */
export const GOES_IR_BOUNDS: [[number, number], [number, number]] = [
  [-65, -170],
  [80, 15],
];

export const GOES_IR_ATTRIBUTION =
  'Imagery © <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a> (GOES-East ABI Band 13 Clean IR)';

/** Pane própria: mesmo nível do GIBS true-color (205) — a imagem IR é
 *  contexto de céu por baixo de bathymetry (210), fields (345+) e radar
 *  (400). Se o MODIS estiver ligado ao mesmo tempo, o IR fica por cima
 *  (o utilizador pediu a camada mais recente por último). */
export const MAP_GOES_IR_PANE = 'ventu-goes-ir';
export const MAP_GOES_IR_PANE_Z = '206';
