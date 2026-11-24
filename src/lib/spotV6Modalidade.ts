/**
 * Resolução e avaliação de modalidades na página de spot v6 (#459).
 *
 * A página de spot v6 aceita as 5 modalidades do motor v6 (`kite`, `surf`,
 * `windsurf`, `bodyboard`, `foil`) e ainda `sup` / `wakeboard` (motor de
 * água plana / `calculateSpotScore`, o mesmo do `/mapa`), respeitando sempre
 * `spot.compatibleSports`:
 *  - `?sport=` e `?d=` na URL têm prioridade (se compatíveis com o spot);
 *  - `localStorage['ventu.modalidade']` só se aplica quando compatível com o spot;
 *  - num spot exclusivo de kite (ex. lagoa-albufeira) nunca força Surf;
 *  - num wakepark (ex. castelo-bode, alqueva) abre em Wakeboard com nota real,
 *    nunca Surf «Sem dados».
 */
import {
  avaliaHorasSite,
  MODALIDADES_DEF,
  type AvaliacaoHoraSite,
  type Modalidade,
  type ModalidadeMotor,
  type ModalidadeSite,
  type SpotModalidade,
} from '@/lib/modalidades';
import type { HoraSpot } from '@/lib/horaSpot';
import { scoreToNota } from '@/lib/nota';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { getCompatibleSports, type SportType } from '@/lib/sportRatings';
import { getSportScore } from '@/lib/sportScore';
import type { Spot } from '@/types';

export const SPOT_MODALIDADES = ['kite', 'surf', 'windsurf', 'bodyboard', 'foil', 'sup', 'wakeboard'] as const;
export type SpotModalidadeAtiva = (typeof SPOT_MODALIDADES)[number];

const MS_PER_KT = 1 / 1.94384;

export function isSpotModalidadeAtiva(x: unknown): x is SpotModalidadeAtiva {
  return typeof x === 'string' && (SPOT_MODALIDADES as readonly string[]).includes(x);
}

export function isModalidadeV6Site(m: SpotModalidadeAtiva): m is ModalidadeSite {
  return m === 'kite' || m === 'surf' || m === 'windsurf' || m === 'bodyboard' || m === 'foil';
}

export function sportParaSpotMod(sport: SportType): SpotModalidadeAtiva {
  return sport === 'kitesurf' ? 'kite' : sport;
}

export function spotModParaSport(m: SpotModalidadeAtiva): SportType {
  return m === 'kite' ? 'kitesurf' : m;
}

/**
 * Mapeia para a modalidade base (`'kite' | 'surf'`) usada por fotos do hero e
 * rótulos curtos partilhados com a home: modalidades de vento → `'kite'`,
 * onda e água plana → `'surf'`.
 */
export function spotModParaBase(m: SpotModalidadeAtiva): Modalidade {
  return m === 'kite' || m === 'windsurf' || m === 'foil' ? 'kite' : 'surf';
}

/** Modalidades compatíveis com o spot, na ordem do catálogo (sem duplicados). */
export function modalidadesCompativeisSpot(spot: Pick<Spot, 'type' | 'compatibleSports'>): SpotModalidadeAtiva[] {
  const compat = getCompatibleSports(spot as Spot);
  const out: SpotModalidadeAtiva[] = [];
  for (const s of compat) {
    const m = sportParaSpotMod(s);
    if (!out.includes(m)) out.push(m);
  }
  return out.length ? out : ['surf'];
}

/** Lê `?sport=` (prioritário) ou `?d=` da query string. */
export function modalidadeSpotDaUrl(search: string | null | undefined): SpotModalidadeAtiva | null {
  if (!search) return null;
  const p = new URLSearchParams(search);
  const sp = p.get('sport');
  if (sp) {
    if (sp === 'kitesurf') return 'kite';
    if (isSpotModalidadeAtiva(sp)) return sp;
  }
  const d = p.get('d');
  if (d) {
    if (d === 'kitesurf') return 'kite';
    if (isSpotModalidadeAtiva(d)) return d;
  }
  return null;
}

/** Modalidade por omissão de um spot (sempre compatível com `spot.compatibleSports`). */
export function modalidadeOmissaoSpot(spot: Pick<Spot, 'type' | 'compatibleSports'>): SpotModalidadeAtiva {
  const compat = modalidadesCompativeisSpot(spot);
  if (compat.includes('kite')) return 'kite';
  if (compat.includes('surf')) return 'surf';
  return compat[0];
}

/**
 * Resolve a modalidade activa para um spot:
 * 1. URL (`?sport=` / `?d=`), se compatível com o spot;
 * 2. Preferência guardada (`ventu.modalidade`), SÓ se compatível com o spot;
 * 3. Omissão compatível do spot (`kite` → `surf` → primeira compatível).
 */
export function resolverModalidadeSpot(
  spot: Pick<Spot, 'type' | 'compatibleSports'>,
  search: string | null | undefined,
  prefSalva: Modalidade | null,
): SpotModalidadeAtiva {
  const compat = modalidadesCompativeisSpot(spot);
  const url = modalidadeSpotDaUrl(search);
  if (url && compat.includes(url)) return url;
  if (prefSalva && compat.includes(prefSalva)) return prefSalva;
  return modalidadeOmissaoSpot(spot);
}

/**
 * Avalia todas as horas da ficha de spot para qualquer `SpotModalidadeAtiva`:
 *  - As 5 modalidades do motor v6 (`kite`, `surf`, `windsurf`, `bodyboard`, `foil`)
 *    passam directamente por `avaliaHorasSite`.
 *  - `wakeboard` e `sup` usam o mesmo `calculateSpotScore` do `/mapa` e das listas,
 *    respeitando a noite (`sunEl < comum.noite`) e `semDados` de vento — assim um
 *    wakepark (`castelo-bode`, `alqueva`) ou spot exclusivo de SUP mostra a mesma
 *    nota /10 do `/mapa` em vez de Surf «Sem dados».
 */
export function avaliaHorasSpotV6(
  spot: Spot,
  sp: SpotModalidade,
  mod: SpotModalidadeAtiva,
  horas: readonly HoraSpot[],
): AvaliacaoHoraSite[] {
  if (isModalidadeV6Site(mod)) return avaliaHorasSite(sp, mod, horas);
  const sport = mod;
  const limiarNoite = MODALIDADES_DEF.comum.noite;
  const chave: ModalidadeMotor = 'kite';
  return horas.map((h) => {
    if (h.semDados?.includes('vento')) {
      return { n: null, f: { vento: 0, onda: 0, mare: 0 }, nMotor: null, seguranca: null, semDados: true as const, chave };
    }
    if (h.sunEl < limiarNoite) {
      return { n: null, f: { vento: 0, onda: 0, mare: 0 }, nMotor: null, seguranca: null, chave };
    }
    const input = rawToScoreInput({
      waveHeight: h.semDados?.includes('onda') ? 0 : h.hs,
      wavePeriod: h.semDados?.includes('onda') ? 0 : h.tp,
      waveDirection: h.sd,
      windSpeed: h.w * MS_PER_KT,
      windDirection: h.wd,
      windGust: h.g * MS_PER_KT,
      waterTemp: h.agua ?? 18,
      tideHeight: Number.isFinite(h.tide) ? h.tide : undefined,
    });
    const res = getSportScore(spot, sport, input);
    const n = scoreToNota(res.score);
    const ventoEfeito = h.w <= 10 ? 1 : h.w > 16 ? -1 : 0;
    const ondaEfeito = sp.aguaInterior || h.semDados?.includes('onda') ? 0 : h.hs <= 0.6 ? 1 : h.hs > 1.2 ? -1 : 0;
    return {
      n,
      f: { vento: ventoEfeito, onda: ondaEfeito, mare: 0 },
      motivo: n >= 5 ? 'banda' : 'picada',
      nMotor: n,
      seguranca: null,
      chave,
    };
  });
}
