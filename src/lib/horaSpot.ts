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
 * - maré: `tideHeight` vem relativo ao nível médio (MSL); o motor usa alturas
 *   acima do zero hidrográfico (como as tabelas de marés e a maquete), por isso
 *   soma-se `NIVEL_MEDIO_ZH` (2,0 m: nível médio acima do ZH na costa
 *   continental, Cascais 2,08 / Leixões 2,00 / Lagos 2,04). `tideUp` deriva da
 *   curva (a hora seguinte é mais alta). Sem maré: `NaN` (o motor não penaliza
 *   e a UI diz «sem dados»);
 * - sol: `sunEl`/`sunAz` calculados em cliente (`src/lib/sol.ts`, NOAA);
 * - chuva e nuvens: os forecasts não as têm → `null`. O motor degrada sem
 *   penalização (`degrau(chuva, null) = 0`) e a UI diz-o (`faltam`).
 */
import type { HoraModalidade } from '@/lib/modalidades';
import { findCoveredHourIndex, lisbonHourKeyFromDate } from '@/lib/openMeteoTime';
import { findTideExtrema } from '@/lib/tideSchedule';
import { instanteLisboa, nascerPor, posicaoSol } from '@/lib/sol';

export const NIVEL_MEDIO_ZH = 2.0;
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
}

export interface HoraSpot extends HoraModalidade {
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
  faltam: Array<'rain' | 'cloud' | 'tide'>;
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
  const expirada = semAgora && lisbonHourKeyFromDate(new Date(agoraMs)) > tempos[tempos.length - 1].slice(0, 13);
  const i0 = semAgora ? (expirada ? Math.max(0, validas.length - n) : 0) : coberta;
  const fatia = validas.slice(i0, i0 + n);
  const mareZH = (l: LinhaForecast | undefined) => {
    const t = num(l?.tideHeight);
    return t == null ? NaN : r1(t + NIVEL_MEDIO_ZH);
  };
  const horas: HoraSpot[] = fatia.map((l, k) => {
    const t = l.time.slice(0, 16);
    const j = i0 + k;
    const tide = mareZH(l);
    const prox = mareZH(validas[j + 1]);
    const ant = mareZH(validas[j - 1]);
    const tideUp = Number.isFinite(prox) ? prox > tide || (prox === tide && tide > ant) : tide > ant;
    const s = posicaoSol(instanteLisboa(t), local.lat, local.lon);
    return {
      t,
      w: Math.round((num(l.windSpeed) ?? 0) * KT),
      g: Math.round((num(l.windGust) ?? num(l.windSpeed) ?? 0) * KT),
      wd: n360(num(l.windDirection) ?? 0),
      hs: r1(num(l.waveHeight) ?? 0),
      tp: Math.round(num(l.wavePeriod) ?? 0),
      sd: n360(num(l.waveDirection) ?? num(l.swellDirection) ?? local.praiaVirada),
      tide,
      tideUp: !!tideUp,
      cloud: null,
      rain: null,
      sunEl: s.el,
      sunAz: s.az,
      agua: num(l.waterTemp),
      ar: num(l.airTemp),
    };
  });
  const sol: DadosHoras['sol'] = {};
  for (const h of horas) {
    const dia = h.t.slice(0, 10);
    if (!sol[dia]) {
      const np = nascerPor(dia, local.lat, local.lon);
      if (np) sol[dia] = np;
    }
  }
  const mares: MareExtremo[] = findTideExtrema(
    validas.slice(Math.max(0, i0 - 8), i0 + n + 14).map((l) => ({ time: l.time, tideHeight: num(l.tideHeight) })),
  )
    .filter((e) => typeof e.time === 'string')
    .map((e) => {
      const l = validas.find((x) => x.time === e.time);
      return { t: (e.time as string).slice(0, 16), tipo: e.type === 'high' ? 'PM' : 'BM', h: mareZH(l) } as MareExtremo;
    });
  const faltam: DadosHoras['faltam'] = ['rain', 'cloud'];
  if (horas.every((h) => !Number.isFinite(h.tide))) faltam.push('tide');
  return { horas, sol, mares, faltam, semAgora };
}
