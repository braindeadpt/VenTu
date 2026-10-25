/**
 * Dados da home v6 (#183), parte partilhada (servidor e cliente).
 *
 * Regra de ouro e paridade com a página de spot: cada hora de cada spot é o
 * objecto que `horaDeLinha` — a MESMA função da página de spot — dá para a
 * MESMA linha do forecast (`forecasts/<conditionsSource ?? id>.json`, com as
 * linhas vizinhas para o sentido da maré). A praia que o motor lê é a do spot
 * (`spotModalidadeDe(editorialDe(spot))`, em `MetaCosta`, calculada no
 * servidor: `dadosHomeServidor.ts`). Teste: `paridade-home-spot.test.ts`.
 *
 * Para o HTML não levar 19 forecasts, o servidor envia as horas já feitas em
 * colunas (`CostaCompacta`: 3 dias desde as 00h do build); o cliente remonta
 * os objectos e só recalcula o sol (`posicaoSol`, a mesma conta do spot).
 * Sem `src/lib/spots.ts` aqui: o bundle da home não leva a lista de spots.
 */
import { horaDeLinha, type HoraSpot, type LinhaForecast } from '@/lib/horaSpot';
import { lisbonHourKeyFromDate } from '@/lib/openMeteoTime';
import { instanteLisboa, posicaoSol } from '@/lib/sol';
import type { SpotModalidade } from '@/lib/modalidades';
import { COSTA_V6, type SpotHome } from './homeV6';

/** O que o cliente precisa de cada spot da costa (calculado no servidor). */
export interface MetaSpotCosta {
  slug: string;
  /** id da série do forecast (`conditionsSource ?? id`) */
  serie: string;
  lat: number;
  lon: number;
  praiaVirada: number;
  sp: SpotModalidade;
}
export type MetaCosta = Record<string, MetaSpotCosta>;

/** As horas de um spot em colunas (os campos do objecto da hora que a nota lê; sem o sol). */
export interface ColunasSpot {
  w: number[];
  g: number[];
  wd: number[];
  hs: number[];
  tp: number[];
  sd: number[];
  /** maré acima do ZH; `null` = sem dados (NaN no objecto da hora) */
  tide: Array<number | null>;
  up: Array<0 | 1>;
  cloud?: Array<number | null>;
  rain?: Array<number | null>;
}
export interface CostaCompacta {
  /** horas locais `YYYY-MM-DDTHH:MM`, as mesmas para todos os spots */
  horas: string[];
  spots: Record<string, ColunasSpot>;
}

const somaDias = (dia: string, n: number) =>
  new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10) + n)).toISOString().slice(0, 10);

/**
 * Horas de cada spot da costa em colunas: `dias` dias desde as 00h do dia de
 * `agoraMs` (Lisboa), construídas com `horaDeLinha` sobre as linhas inteiras
 * (`linhas[id]`, a série do spot). Só ficam os spots com todas as horas.
 */
export function compactarCosta(linhas: Record<string, readonly LinhaForecast[]>, agoraMs: number, meta: MetaCosta, dias = 3): CostaCompacta {
  const dia0 = lisbonHourKeyFromDate(new Date(agoraMs)).slice(0, 10);
  const fim = somaDias(dia0, dias - 1);
  let horas: string[] | null = null;
  const spots: Record<string, ColunasSpot> = {};
  for (const c of COSTA_V6.spots) {
    const m = meta[c.id];
    if (!m) continue;
    const validas = (linhas[c.id] ?? []).filter((l) => typeof l?.time === 'string');
    const local = { lat: m.lat, lon: m.lon, praiaVirada: m.praiaVirada };
    const H: HoraSpot[] = [];
    for (let j = 0; j < validas.length; j++) {
      const d = validas[j].time.slice(0, 10);
      if (d >= dia0 && d <= fim) H.push(horaDeLinha(validas, j, local));
    }
    if (!H.length || H[0].t.slice(0, 13) !== `${dia0}T00`) continue;
    const ts = H.map((h) => h.t);
    if (!horas) horas = ts;
    const n = Math.min(horas.length, ts.length);
    if (ts.slice(0, n).some((t, i) => t !== horas![i])) continue;
    if (n < horas.length) {
      horas = horas.slice(0, n);
      for (const k of Object.keys(spots)) for (const col of Object.values(spots[k])) (col as unknown[]).length = n;
    }
    const Hn = H.slice(0, n);
    const col: ColunasSpot = {
      w: Hn.map((h) => h.w),
      g: Hn.map((h) => h.g),
      wd: Hn.map((h) => h.wd),
      hs: Hn.map((h) => h.hs),
      tp: Hn.map((h) => h.tp),
      sd: Hn.map((h) => h.sd),
      tide: Hn.map((h) => (Number.isFinite(h.tide) ? h.tide : null)),
      up: Hn.map((h) => (h.tideUp ? 1 : 0)),
    };
    if (Hn.some((h) => h.cloud != null)) col.cloud = Hn.map((h) => h.cloud ?? null);
    if (Hn.some((h) => h.rain != null)) col.rain = Hn.map((h) => h.rain ?? null);
    spots[c.id] = col;
  }
  return { horas: horas ?? [], spots };
}

/**
 * Spots da home com as horas de hoje e amanhã (o objecto da hora completo,
 * com o sol do sítio) e o índice de «agora». `agoraI = -1` quando a previsão
 * não cobre a hora actual.
 */
export function montarCosta(compacta: CostaCompacta, agoraMs: number, meta: MetaCosta): { spots: SpotHome[]; agoraI: number } {
  const key = lisbonHourKeyFromDate(new Date(agoraMs));
  const dia0 = key.slice(0, 10);
  const d1 = somaDias(dia0, 1);
  const idx: number[] = [];
  compacta.horas.forEach((t, i) => {
    const d = t.slice(0, 10);
    if (d === dia0 || d === d1) idx.push(i);
  });
  if (!idx.length || compacta.horas[idx[0]].slice(0, 13) !== `${dia0}T00`) return { spots: [], agoraI: -1 };
  const out: SpotHome[] = [];
  for (const c of COSTA_V6.spots) {
    const m = meta[c.id];
    const col = compacta.spots[c.id];
    if (!m || !col) continue;
    const h: HoraSpot[] = idx.map((i) => {
      const t = compacta.horas[i];
      const s = posicaoSol(instanteLisboa(t), m.lat, m.lon);
      return {
        t,
        w: col.w[i],
        g: col.g[i],
        wd: col.wd[i],
        hs: col.hs[i],
        tp: col.tp[i],
        sd: col.sd[i],
        tide: col.tide[i] ?? NaN,
        tideUp: col.up[i] === 1,
        cloud: col.cloud?.[i] ?? null,
        rain: col.rain?.[i] ?? null,
        sunEl: s.el,
        sunAz: s.az,
      };
    });
    out.push({ ...c, lat: m.lat, lon: m.lon, sp: m.sp, h });
  }
  const agoraI = idx.findIndex((i) => compacta.horas[i].slice(0, 13) === key);
  return { spots: out, agoraI };
}
