/** EUMETView (EUMETSAT) — Meteosat-11 SEVIRI IR10.8 «msg_fes:ir108» via
 *  WMS GetMap. Substitui o GOES-East (GIBS) como motor primário da camada
 *  «Satélite IR»: Portugal fica no centro do disco 0° (limite ±77° lat/lon)
 *  em vez do limbo oriental do GOES — ver docs/audits/SATELLITE-IR-OPTIONS.md.
 *
 *  Porquê WMS e não WMTS: o EUMETView publica GetMap (imagem recortada ao
 *  bbox) e não pirâmides {z}/{y}/{x} — `L.tileLayer.wms()` mantém o modelo
 *  por tile do Leaflet e cada tile é um GetMap. Cada frame do carrossel é
 *  um `L.WMSTileLayer` com `time=` fixo (mesmo pool de opacidades do GOES).
 *
 *  Provas de serviço (2026-10-01, docs/audits/SATELLITE-IR-OPTIONS.md):
 *  keyless, `Access-Control-Allow-Origin: *`, 512² sobre PT em 0,4–0,6 s,
 *  arquivo histórico responde 200 (carrossel do passado funciona).
 *
 *  Cadência real do produto: 15 min. O slot mais recente do capabilities
 *  acaba ~1,5–2 h atrás, MAS slots recentes respondem 200 — o atraso do
 *  capabilities não é o atraso dos dados (o Rapid Scan `nrt` respondeu à
 *  hora exacta). Usamos METEOSAT_IR_LAG_MS conservador (2 slots) e o badge
 *  de staleness existente cobre o resto. */

import type L from 'leaflet';

export const METEOSAT_IR_WMS_URL = 'https://view.eumetsat.int/geoserver/wms';
export const METEOSAT_IR_LAYER = 'msg_fes:ir108';
/** Atribuição exigida pelo serviço (título: «EUMETSAT visualizations»). */
export const METEOSAT_IR_ATTRIBUTION =
  'Imagery © <a href="https://user.eumetsat.int/data-access/eumetview" target="_blank" rel="noopener noreferrer">EUMETSAT</a> (Meteosat-11 SEVIRI IR10.8)';

/** Cadência do produto full-scan (15 min; o Rapid Scan de 5 min é outro
 *  layer, msg_rss:ir039_nrt — ver relatório, Opção B). */
export const METEOSAT_IR_CADENCE_MIN = 15;
/** Latência conservadora: pedir o slot mais recente só 30 min atrás. */
export const METEOSAT_IR_LAG_MS = 30 * 60 * 1000;
/** Disco completo 0°: ±77° em ambas as dimensões (EX_GeographicBoundingBox
 *  do capabilities). Fora disto o servidor devolve vazio — não pedir. */
export const METEOSAT_IR_BOUNDS: [[number, number], [number, number]] = [
  [-77, -77],
  [77, 77],
];

export interface MeteosatIrFrame {
  /** Slot TIME do produto (UTC, ISO com Z). */
  frameTime: string;
  /** Valor exacto do parâmetro `time=` do GetMap. */
  time: string;
}

function floorToCadence(ms: number, cadenceMin: number): number {
  return Math.floor(ms / (cadenceMin * 60_000)) * cadenceMin * 60_000;
}

function slotTime(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/** Frames do carrossel, mais recente primeiro. Mesma forma de
 *  `goesIrFrames()` para o pool do useMapLayers poder usar ambos os
 *  motores sem ramos especiais. */
export function meteosatIrFrames(
  nowMs: number = Date.now(),
  frameCount = 12,
): MeteosatIrFrame[] {
  const end = floorToCadence(nowMs - METEOSAT_IR_LAG_MS, METEOSAT_IR_CADENCE_MIN);
  const out: MeteosatIrFrame[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    const t = end - i * METEOSAT_IR_CADENCE_MIN * 60_000;
    out.push({ frameTime: slotTime(t), time: `${slotTime(t).replace('Z', '.000Z')}` });
  }
  return out;
}

/** URL de GetMap para UM TILE (usado por L.tileLayer.wms — o template é do
 *  Leaflet, aqui só para testes e prefetch). */
export function meteosatIrTileUrl(time: string): string {
  // Query à mão: URLSearchParams codifica ':' (%3A) e o GeoServer aceita,
  // mas o canónico WMS não o faz — e mantenho a URL legível nos logs.
  const q = [
    'service=WMS',
    'version=1.3.0',
    'request=GetMap',
    `layers=${METEOSAT_IR_LAYER}`,
    'styles=raster',
    'format=image/png',
    'transparent=true',
    `time=${time}`,
  ].join('&');
  return `${METEOSAT_IR_WMS_URL}?${q}`;
}

/** Cria o WMSTileLayer de um frame — factory isolada para o useMapLayers
 *  não duplicar a config (bounds, CRS, crossOrigin para máscara). O
 *  parâmetro `time` do GetMap vai via `wmsParameters` (WMSOptions do Leaflet
 *  aceita extras como pares arbitrários em runtime; aqui tipado por cast). */
export function createMeteosatIrLayer(
  Leaflet: typeof L,
  time: string,
  pane: string,
): L.TileLayer.WMS {
  const options = {
    pane,
    opacity: 0,
    layers: METEOSAT_IR_LAYER,
    styles: 'raster',
    format: 'image/png',
    transparent: true,
    attribution: METEOSAT_IR_ATTRIBUTION,
    className: 'ventu-meteosat-ir',
    // O disco é ±77°; fora o WMS devolve transparente — o bounds evita
    // pedir tiles vazios ao fazer zoom-out.
    bounds: Leaflet.latLngBounds(METEOSAT_IR_BOUNDS[0], METEOSAT_IR_BOUNDS[1]),
    crossOrigin: true,
    updateWhenZooming: false,
    updateWhenIdle: true,
    tileSize: 256,
    version: '1.3.0',
    // Parâmetro WMS extra (WMSOptions não o tipa mas o runtime passa todos
    // os pares do objeto para a query GetMap).
    time,
  } as unknown as L.WMSOptions;
  return Leaflet.tileLayer.wms(METEOSAT_IR_WMS_URL, options) as L.TileLayer.WMS;
}

const LISBON_TZ = 'Europe/Lisbon';

/** "14:35" em hora de Lisboa — slots UTC reais (mesmo contrato do GOES). */
export function meteosatIrFrameClock(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleTimeString('pt-PT', {
    timeZone: LISBON_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "2026-10-01 14:35" em hora de Lisboa — tooltip completo do badge. */
export function meteosatIrFrameFullClock(iso: string | null): string | null {
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
