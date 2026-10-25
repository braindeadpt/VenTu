/**
 * Um objecto por spot e hora (regra de ouro, #184): converte as linhas do
 * forecast do pipeline (`public/data/forecasts/<id>.json`) nas horas que o
 * motor de modalidades, o veredicto, a régua, o Porquê, a cena 3D e a tabela
 * lêem. Nenhum componente volta a ler a linha crua.
 *
 * Unidades e derivações:
 * - vento e rajadas: m/s (Open-Meteo, `wind_speed_unit=ms`) → nós inteiros;
 * - onda: `waveHeight` (m, 1 casa), `wavePeriod` (s, inteiro),
 *   `waveDirection` (ou `swellDirection`);
 * - maré: `tideHeight` vem relativo ao nível médio da própria série (o
 *   pipeline retira a média do `sea_level_height_msl`, deslocada −0,35 a
 *   −0,41 m no continente: auditoria de dados 16/10, A4); o motor usa alturas
 *   acima do zero hidrográfico (como as tabelas de marés e a maquete), por isso
 *   soma-se o nível médio do porto IH de referência (`nivelMedioZH`: Tabela de
 *   Marés IH 2026 — 2,00 m na costa continental, Cascais 2,08, Lisboa 2,20,
 *   Funchal 1,40, Açores 1,00). `tideUp` deriva da curva (a hora seguinte é
 *   mais alta). Sem maré: `NaN` (o motor não penaliza e a UI diz «sem dados»);
 * - em falta na fonte (`null`, auditoria 16/10, M2): a hora leva `semDados`
 *   ('vento' / 'onda') e o motor não a avalia (a UI diz «sem dados», não 0);
 * - sol: `sunEl`/`sunAz` calculados em cliente (`src/lib/sol.ts`, NOAA);
 * - chuva e nuvens (#218): `precipitation` (mm/h) e `cloudCover` (%) da mesma
 *   fonte e hora do vento. Formato compacto do pipeline
 *   (`updateConditionsMerge.js:rainCloudFields`): `cloudCover` vem sempre que
 *   há dados de tempo e `precipitation` só quando chove, por isso uma linha
 *   com `cloudCover` e sem `precipitation` é 0 mm/h. Sem os dois (forecasts
 *   antigos, fixture): `null`, o motor degrada sem penalização
 *   (`degrau(chuva, null) = 0`) e a UI diz-o (`faltam`).
 */
import type { HoraModalidade } from '@/lib/modalidades';
import { findCoveredHourIndex, seriesTimeMs } from '@/lib/openMeteoTime';
import { findTideExtrema } from '@/lib/tideSchedule';
import { instanteLisboa, nascerPor, posicaoSol } from '@/lib/sol';

/** Nível médio acima do ZH na costa continental (Tabela de Marés IH 2026, Viana a VRSA). */
export const NIVEL_MEDIO_ZH = 2.0;

/**
 * Portos de referência da Tabela de Marés do IH (2026, vol. I): posição do
 * marégrafo e «Nível médio» (m acima do ZH). Sesimbra, Vila do Porto e Flores
 * sem coordenadas no volume: posição do porto.
 */
export const PORTOS_MARE: ReadonlyArray<{ nome: string; lat: number; lon: number; nm: number }> = [
  { nome: 'Viana do Castelo', lat: 41.685, lon: -8.8397, nm: 2.0 },
  { nome: 'Leixões', lat: 41.1867, lon: -8.7045, nm: 2.0 },
  { nome: 'Aveiro', lat: 40.6442, lon: -8.7487, nm: 2.0 },
  { nome: 'Figueira da Foz', lat: 40.1483, lon: -8.8562, nm: 2.0 },
  { nome: 'Peniche', lat: 39.3498, lon: -9.3747, nm: 2.0 },
  { nome: 'Cascais', lat: 38.6932, lon: -9.4153, nm: 2.08 },
  { nome: 'Lisboa', lat: 38.7, lon: -9.1583, nm: 2.2 },
  { nome: 'Sesimbra', lat: 38.441, lon: -9.104, nm: 2.0 },
  { nome: 'Setúbal (Tróia)', lat: 38.4945, lon: -8.9008, nm: 2.0 },
  { nome: 'Sines', lat: 37.9482, lon: -8.8878, nm: 2.0 },
  { nome: 'Lagos', lat: 37.0988, lon: -8.6683, nm: 2.0 },
  { nome: 'Faro-Olhão', lat: 36.9782, lon: -7.8662, nm: 2.0 },
  { nome: 'Vila Real de Santo António', lat: 37.1933, lon: -7.4133, nm: 2.0 },
  { nome: 'Funchal', lat: 32.644, lon: -16.913, nm: 1.4 },
  { nome: 'Vila do Porto', lat: 36.944, lon: -25.146, nm: 1.0 },
  { nome: 'Ponta Delgada', lat: 37.736, lon: -25.6712, nm: 1.0 },
  { nome: 'Angra do Heroísmo', lat: 38.65, lon: -27.2223, nm: 1.0 },
  { nome: 'Horta', lat: 38.5332, lon: -28.6207, nm: 1.0 },
  { nome: 'Lajes das Flores', lat: 39.377, lon: -31.172, nm: 1.0 },
];

/** Interior do estuário do Tejo (a montante da Trafaria/Belém): o porto de Lisboa (2,20 m). */
const noEstuarioTejo = (lat: number, lon: number) => lat > 38.6 && lat < 38.95 && lon >= -9.235 && lon < -8.85;

/**
 * Porto de marés de referência de um spot: Lisboa só dentro do estuário do
 * Tejo; fora dele o porto mais próximo do mesmo arquipélago/costa (Lisboa
 * excluído, para a Caparica ou Carcavelos não herdarem o nível do estuário).
 */
export function portoMareDe(lat: number, lon: number): { nome: string; nm: number } {
  if (noEstuarioTejo(lat, lon)) return PORTOS_MARE[6];
  const ilhaA = lon < -20;
  const ilhaM = !ilhaA && lat < 34;
  let best = PORTOS_MARE[0];
  let bd = Infinity;
  for (const p of PORTOS_MARE) {
    if (p.nome === 'Lisboa') continue;
    const pa = p.lon < -20;
    const pm = !pa && p.lat < 34;
    if (pa !== ilhaA || pm !== ilhaM) continue;
    const dy = p.lat - lat;
    const dx = (p.lon - lon) * Math.cos((lat * Math.PI) / 180);
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Nível médio (m acima do ZH) do porto de referência do spot. */
export function nivelMedioZH(lat: number, lon: number): number {
  return portoMareDe(lat, lon).nm;
}
export const HORAS_REGUA = 48;
const KT = 1.94384;

export interface LinhaForecast {
  time: string;
  waveHeight?: number;
  wavePeriod?: number;
  waveDirection?: number;
  swellDirection?: number;
  windSpeed?: number;
  windDirection?: number;
  windGust?: number;
  waterTemp?: number;
  airTemp?: number;
  tideHeight?: number;
  /** Precipitação (mm/h). O pipeline só a escreve quando chove: sem o campo e com `cloudCover` = 0 mm/h. */
  precipitation?: number;
  /** Nebulosidade (%). Presente = a hora tem dados de tempo (marca da chuva a 0). */
  cloudCover?: number;
}

export interface HoraSpot extends HoraModalidade {
  /** A fonte não traz vento / onda nesta hora (`null`): sem nota nessa lógica, a UI diz «sem dados». */
  semDados?: Array<'vento' | 'onda'>;
  /** Temperatura da água (°C), quando existe. */
  agua?: number;
  /** Temperatura do ar (°C), quando existe. */
  ar?: number;
}

export interface MareExtremo {
  t: string;
  tipo: 'PM' | 'BM';
  h: number;
}

export interface DadosHoras {
  horas: HoraSpot[];
  sol: Record<string, { nascer: string; por: string }>;
  mares: MareExtremo[];
  /** Campos que a fonte não traz (a nota não os conta). */
  faltam: Array<'rain' | 'cloud' | 'tide' | 'onda' | 'agua'>;
  /**
   * «Agora» está fora da cobertura da previsão (expirada ou ainda por começar):
   * a régua mostra as últimas (ou primeiras) `n` horas da série, datadas, e
   * nenhuma delas é apresentada como «agora».
   */
  semAgora: boolean;
}

const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const r1 = (x: number) => Math.round(x * 10) / 10;
const n360 = (x: number) => ((Math.round(x) % 360) + 360) % 360;

/**
 * Hora e altura de um extremo de maré afinadas ao minuto: a série é horária,
 * por isso o extremo encontrado cai na hora cheia mais próxima; uma parábola
 * pelos três pontos (j-1, j, j+1) dá o instante do vértice (±30 min) e a sua
 * altura, como as tabelas de marés («preia-mar às 16h50»).
 */
function extremoAfinado(validas: readonly LinhaForecast[], j: number, t: string, nm: number): { t: string; h: number } {
  const zh = (l: LinhaForecast | undefined) => {
    const v = num(l?.tideHeight);
    return v == null ? NaN : v + nm;
  };
  const y1 = zh(validas[j]);
  const base = { t: t.slice(0, 16), h: Number.isFinite(y1) ? r1(y1) : NaN };
  const y0 = zh(validas[j - 1]);
  const y2 = zh(validas[j + 1]);
  if (j <= 0 || !Number.isFinite(y0) || !Number.isFinite(y1) || !Number.isFinite(y2)) return base;
  const den = y0 - 2 * y1 + y2;
  if (Math.abs(den) < 1e-9) return base;
  const dx = Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den));
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t);
  if (!m) return base;
  // aritmética de relógio local (as horas da série são de Lisboa, sem fuso): UTC só como calculadora
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + Math.round(dx * 60) * 60000;
  const d = new Date(ms);
  const p2 = (x: number) => String(x).padStart(2, '0');
  const tt = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  return { t: tt, h: r1(y1 - 0.25 * (y0 - y2) * dx) };
}

/**
 * Chuva da linha (mm/h): o valor, 0 quando a linha tem `cloudCover` sem
 * `precipitation` (o pipeline omite os zeros) e `null` sem dados de tempo.
 */
export function chuvaDe(l: Pick<LinhaForecast, 'precipitation' | 'cloudCover'>): number | null {
  const p = num(l.precipitation);
  if (p != null) return p;
  return num(l.cloudCover) != null ? 0 : null;
}

const mareZH = (l: LinhaForecast | undefined, nm: number) => {
  const t = num(l?.tideHeight);
  return t == null ? NaN : r1(t + nm);
};

/**
 * O objecto de UMA hora (regra de ouro): a linha `j` de `validas` (as linhas
 * vizinhas só dão o sentido da maré). A página de spot (`construirHoras`) e a
 * home (#183, `src/lib/home/dadosHome.ts`) usam esta mesma função, por isso o
 * mesmo spot e hora dão o mesmo objecto — e a mesma nota — nas duas páginas.
 */
export function horaDeLinha(
  validas: readonly LinhaForecast[],
  j: number,
  local: { lat: number; lon: number; praiaVirada: number },
): HoraSpot {
  const l = validas[j];
  const t = l.time.slice(0, 16);
  const nm = nivelMedioZH(local.lat, local.lon);
  const tide = mareZH(l, nm);
  const prox = mareZH(validas[j + 1], nm);
  const ant = mareZH(validas[j - 1], nm);
  const tideUp = Number.isFinite(prox) ? prox > tide || (prox === tide && tide > ant) : tide > ant;
  // instante pela etiqueta COMPLETA (com desvio): o 01:00 repetido e os Açores (M1/B3)
  const s = posicaoSol(instanteLisboa(l.time), local.lat, local.lon);
  const semDados: Array<'vento' | 'onda'> = [];
  if (num(l.windSpeed) == null) semDados.push('vento');
  if (num(l.waveHeight) == null) semDados.push('onda');
  return {
    ...(semDados.length ? { semDados } : {}),
    t,
    w: Math.round((num(l.windSpeed) ?? 0) * KT),
    g: Math.round((num(l.windGust) ?? num(l.windSpeed) ?? 0) * KT),
    wd: n360(num(l.windDirection) ?? 0),
    hs: r1(num(l.waveHeight) ?? 0),
    tp: Math.round(num(l.wavePeriod) ?? 0),
    sd: n360(num(l.waveDirection) ?? num(l.swellDirection) ?? local.praiaVirada),
    tide,
    tideUp: !!tideUp,
    cloud: num(l.cloudCover) ?? null,
    rain: chuvaDe(l),
    sunEl: s.el,
    sunAz: s.az,
    agua: num(l.waterTemp),
    ar: num(l.airTemp),
  };
}

export function construirHoras(
  linhas: readonly LinhaForecast[],
  local: { lat: number; lon: number; praiaVirada: number },
  agoraMs: number,
  n = HORAS_REGUA,
): DadosHoras {
  const validas = linhas.filter((l) => typeof l?.time === 'string');
  if (!validas.length) return { horas: [], sol: {}, mares: [], faltam: ['rain', 'cloud'], semAgora: true };
  const tempos = validas.map((l) => l.time);
  const coberta = findCoveredHourIndex(tempos, new Date(agoraMs));
  const semAgora = coberta < 0;
  // Fora da cobertura: previsão expirada → últimas n horas; ainda por começar → primeiras n.
  const expirada = semAgora && agoraMs > seriesTimeMs(tempos[tempos.length - 1]);
  const i0 = semAgora ? (expirada ? Math.max(0, validas.length - n) : 0) : coberta;
  const fatia = validas.slice(i0, i0 + n);
  const horas: HoraSpot[] = fatia.map((_, k) => horaDeLinha(validas, i0 + k, local));
  const sol: DadosHoras['sol'] = {};
  for (const h of horas) {
    const dia = h.t.slice(0, 10);
    if (!sol[dia]) {
      const np = nascerPor(dia, local.lat, local.lon);
      if (np) sol[dia] = np;
    }
  }
  const nm = nivelMedioZH(local.lat, local.lon);
  const mares: MareExtremo[] = findTideExtrema(
    validas.slice(Math.max(0, i0 - 8), i0 + n + 14).map((l) => ({ time: l.time, tideHeight: num(l.tideHeight) })),
  )
    .filter((e) => typeof e.time === 'string')
    .map((e) => {
      const j = validas.findIndex((x) => x.time === e.time);
      return { ...extremoAfinado(validas, j, e.time as string, nm), tipo: e.type === 'high' ? 'PM' : 'BM' } as MareExtremo;
    });
  const faltam: DadosHoras['faltam'] = [];
  if (horas.every((h) => h.rain == null)) faltam.push('rain');
  if (horas.every((h) => h.cloud == null)) faltam.push('cloud');
  if (horas.every((h) => !Number.isFinite(h.tide))) faltam.push('tide');
  if (horas.every((h) => h.semDados?.includes('onda'))) faltam.push('onda');
  if (horas.every((h) => h.agua == null)) faltam.push('agua');
  return { horas, sol, mares, faltam, semAgora };
}
