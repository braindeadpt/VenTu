/**
 * Nota v6 de UMA linha de condições (conditions.json ou uma hora do forecast),
 * para os scripts que ainda não lêem o forecast por hora (alertas por email e
 * Telegram: `scripts/lib/scoreSpotConditions.js`). Auditoria de dados 16/10
 * (C1, #218): os alertas avaliavam com o `sportScore` + *gust proxy* e
 * disparavam «condições boas» com 7 kt de média e 22 kt de rajada; o v6 dá 0.
 *
 * O caminho é o mesmo da home e da página de spot:
 * - a linha passa por `rawToScoreInput` (boia fresca e vento observado, como
 *   no resto do site; sem *gust proxy*);
 * - vira uma hora v6 com `horaDeLinha` (nós inteiros, maré ZH, sol);
 * - o motor avalia com a mesma praia (`editorialDe`) e o mesmo tecto de
 *   segurança do vento (`tectoSeguranca`).
 * De noite o motor devolve `null` e não há nota (os alertas não disparam).
 */
import type { Spot } from '@/types';
import { horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import { MOTOR, MODALIDADES_DEF, tectoSeguranca, type DefModalidade } from '@/lib/modalidades';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { windSportDirectionSafety } from '@/lib/sportScore';
import { lisbonHourKeyFromDate } from '@/lib/openMeteoTime';

/** Desporto das subscrições (Supabase) → chave do motor v6. `null`: sem v6. */
export const DESPORTO_V6: Record<string, string> = {
  kitesurf: 'kite',
  kite: 'kite',
  windsurf: 'windsurf',
  foil: 'kitefoil',
  surf: 'surf',
  bodyboard: 'bodyboard',
  wakeboard: 'wakeboard',
};

export function chaveV6(sport: string): string | null {
  const k = DESPORTO_V6[sport];
  if (!k) return null;
  const d = MODALIDADES_DEF.def[k] as DefModalidade | undefined;
  return d && (d.logica === 'vento' || d.logica === 'onda' || d.logica === 'plana') ? k : null;
}

export interface NotaV6 {
  /** Nota inteira /10, já com o tecto de segurança; `null` = noite (sem nota). */
  n: number | null;
  /** Nota do motor antes do tecto. */
  nMotor: number | null;
  /** Hora avaliada (Lisboa, AAAA-MM-DDTHH:00). */
  t: string;
}

/**
 * Avalia a linha `raw` como a hora `t` (etiqueta da série, com ou sem desvio;
 * sem desvio = Lisboa; por omissão, a hora actual).
 * `null` se o desporto não tem v6.
 */
export function notaV6DeCondicoes(
  spot: Pick<Spot, 'id' | 'lat' | 'lon' | 'coastOrientation'> & Partial<Pick<Spot, 'aguaInterior'>>,
  sport: string,
  raw: Record<string, unknown>,
  opc: { nowMs?: number; t?: string } = {},
): NotaV6 | null {
  const k = chaveV6(sport);
  if (!k) return null;
  // etiqueta completa (com desvio, #240) para o sol; `t` devolvido fica com 16 caracteres
  const tCompleta = opc.t ?? `${lisbonHourKeyFromDate(new Date(opc.nowMs ?? Date.now()))}:00`;
  const t = tCompleta.slice(0, 16);
  const c = rawToScoreInput(raw);
  const fin = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x);
  const tide = fin(raw.tideHeight) ? (raw.tideHeight as number) : undefined;
  const linha: LinhaForecast = {
    time: tCompleta,
    windSpeed: c.windSpeed,
    windGust: c.windGust,
    windDirection: c.windDirection,
    waveHeight: c.waveHeight,
    wavePeriod: c.wavePeriod,
    waveDirection: c.waveDirection,
    waterTemp: c.waterTemp,
    tideHeight: tide,
    // chuva e nuvens da hora do forecast (#218): o alerta penaliza a chuva como a página do spot
    ...(fin(raw.precipitation) ? { precipitation: raw.precipitation as number } : {}),
    ...(fin(raw.cloudCover) ? { cloudCover: raw.cloudCover as number } : {}),
  };
  const ed = editorialDe(spot);
  const sp = spotModalidadeDe(ed);
  const h = horaDeLinha([linha], 0, { lat: spot.lat, lon: spot.lon, praiaVirada: ed.praiaVirada });
  const r = MOTOR.para(sp).avalia(k, h);
  const def = MODALIDADES_DEF.def[k] as DefModalidade;
  if (def.logica !== 'vento' || r.n == null) return { n: r.n, nMotor: r.n, t };
  const s = windSportDirectionSafety({ coastOrientation: sp.praiaVirada, aguaInterior: sp.aguaInterior ? true : undefined }, h.wd);
  const tecto = tectoSeguranca(s.scoreCap);
  return { n: tecto != null ? Math.min(r.n, tecto) : r.n, nMotor: r.n, t };
}
