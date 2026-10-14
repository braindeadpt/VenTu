/**
 * Modalidade escolhida (#184, partilhada com a home #183).
 *
 * Chave `localStorage['ventu.modalidade']` no formato `{"d": "<modalidade>",
 * "v": {}}` (`v` fica para opções da modalidade, extensível). Lê também a
 * string simples da maquete v6 (`"kite"`) e migra-a. `?d=` na URL tem
 * prioridade sobre a chave.
 *
 * Ponte com a home actual: escolher Kite/Surf aqui também grava a escolha da
 * home (`ventu:sport-chosen` / `ventu:sport`, `kitesurf`/`surf`), e escolher
 * Surf/Kitesurf nos pills da home grava esta chave (`rememberChosenSport`).
 */
import { isModalidade, type Modalidade } from '@/lib/modalidades';

export const LS_MODALIDADE = 'ventu.modalidade';
export const MODALIDADE_EVENT = 'ventu:modalidade-change';

export interface PrefModalidade {
  d: Modalidade;
  v: Record<string, unknown>;
}

/** Interpreta o valor guardado (`{d, v}` ou a string antiga). */
export function parsePrefModalidade(raw: string | null): PrefModalidade | null {
  if (!raw) return null;
  if (isModalidade(raw)) return { d: raw, v: {} };
  try {
    const o = JSON.parse(raw) as { d?: unknown; v?: unknown };
    if (o && isModalidade(o.d)) return { d: o.d, v: o.v && typeof o.v === 'object' ? (o.v as Record<string, unknown>) : {} };
  } catch {
    /* valor estragado: ignora */
  }
  return null;
}

/** Modalidade pedida na URL (`?d=kite|surf`). */
export function modalidadeDaUrl(search: string | null | undefined): Modalidade | null {
  if (!search) return null;
  const d = new URLSearchParams(search).get('d');
  return isModalidade(d) ? d : null;
}

/** Lê a escolha guardada; migra a string antiga para `{d, v}`. */
export function lerPrefModalidade(): PrefModalidade | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_MODALIDADE);
    const p = parsePrefModalidade(raw);
    if (p && raw === p.d) window.localStorage.setItem(LS_MODALIDADE, JSON.stringify(p));
    return p;
  } catch {
    return null;
  }
}

/** URL primeiro, depois a chave. */
export function modalidadeInicial(search: string | null | undefined): Modalidade | null {
  return modalidadeDaUrl(search) ?? lerPrefModalidade()?.d ?? null;
}

const PARA_HOME: Record<Modalidade, string> = { kite: 'kitesurf', surf: 'surf' };

/** Grava a escolha (formato `{d, v}`) e avisa a página. */
export function gravarPrefModalidade(d: Modalidade, v: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  try {
    const actual = lerPrefModalidade();
    window.localStorage.setItem(LS_MODALIDADE, JSON.stringify({ d, v: { ...(actual?.d === d ? actual.v : {}), ...v } }));
    window.localStorage.setItem('ventu:sport-chosen', PARA_HOME[d]);
    window.localStorage.setItem('ventu:sport', PARA_HOME[d]);
  } catch {
    /* modo privado: fica só na sessão */
  }
  window.dispatchEvent(new CustomEvent(MODALIDADE_EVENT, { detail: d }));
}

/** Desporto da home → modalidade v6 (só os dois visíveis). */
export function modalidadeDoDesporto(sport: string): Modalidade | null {
  if (sport === 'surf') return 'surf';
  if (sport === 'kitesurf') return 'kite';
  return null;
}
