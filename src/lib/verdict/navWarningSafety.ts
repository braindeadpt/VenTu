/**
 * Classificação da faixa de segurança (§0): quais avisos à navegação do IH
 * são «aviso de segurança real» — perigo físico para quem está na água
 * (surf, kite, windsurf, SUP, natação) — vs. avisos para embarcações e
 * informativos/administrativos que continuam na secção «No local».
 *
 * O campo `category` do ih-coastal-warnings.json é texto livre (~120 valores
 * distintos). A lógica é uma LISTA DE INCLUSÃO curta sobre a categoria
 * normalizada (minúsculas, sem acentos) — tudo o que não corresponde fica
 * de fora. «Segurança da navegação» genérica não entra; se vier acompanhada
 * de uma palavra da lista (ex.: «… - EMBARCAÇÃO À DERIVA»), entra.
 *
 * Grupos incluídos:
 *  - objectos ou embarcações submersos ou à deriva: submers, deriva,
 *    naufrag, contentor; «objeto/objecto» só com deriva/flutuante;
 *  - arribas e derrocadas: arriba, falesia, derroc, desmoron, abatimento;
 *  - interdições/restrições de ÁREA ou de ACESSO a zonas de água ou costa
 *    (interdição de área, restrição de acesso, zona interdita, proibição
 *    de banhos/navegação) — NÃO as de fundear/pairar, que são para barcos;
 *  - exercícios militares, fogo real, tiro, explosivos, minas;
 *  - poluição, derrames, hidrocarbonetos;
 *  - operações de salvamento ou busca em curso.
 *
 * Ficam fora (avisos para embarcações, não para banhistas): assinalamento,
 * boias apagadas/retiradas/reposicionadas, farolins, mastros, sinais,
 * assoreamento e sondas, obras portuárias (cais, molhe, quebramar, pontão),
 * viveiros/aquicultura, campanhas científicas, editais, portarias,
 * regulamentos, normas, «aviso à navegação» genérico e animais marinhos
 * (`collection === 'orca_anavnet_point'` nunca entra).
 */

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Objectos/embarcações submersos ou à deriva — obstáculo na água. */
const FLOATING_HAZARD_RE = /(submers|deriva|naufrag|contentor)/;
const OBJECT_RE = /obje[ct]+o/;
const FLOATING_STATE_RE = /(deriva|flutuant)/;

/** Arribas instáveis e derrocadas — queda de terra/rocha sobre a água. */
const CLIFF_RE = /(arriba|falesia|derroc|desmoron|abatimento)/;

/** Interdições/restrições de área ou de acesso a zonas de água ou costa. */
const INTERDICTION_RE = /(interdi|restric|proibi)/;
/** …mas as que são só para embarcações ficam na «No local». */
const VESSEL_ONLY_RE = /(fundear|pairar)/;

/** Exercícios militares, fogo real, explosivos, minas. */
const MILITARY_RE = /(militar|artilharia|\btiros?\b|fogo real|explosiv|\bminas?\b)/;

/** Poluição, derrames, hidrocarbonetos. */
const POLLUTION_RE = /(poluic|derram|hidrocarbonet|mare negra)/;

/** Operações de salvamento/busca em curso (planos permanentes não entram). */
const RESCUE_RE = /(busca|operacao de salvamento|salvamento em curso|rescue|\bsar\b)/;

/**
 * true = entra na faixa §0. Decide-se só pela categoria/collection — o resto
 * do aviso (ref, url, polígono) não muda a classificação.
 */
export function isSafetyNavWarning(w: {
  category?: string | null;
  collection?: string | null;
}): boolean {
  if (w.collection === 'orca_anavnet_point') return false;
  const cat = norm(w.category ?? '');
  if (!cat) return false;
  if (FLOATING_HAZARD_RE.test(cat)) return true;
  if (OBJECT_RE.test(cat) && FLOATING_STATE_RE.test(cat)) return true;
  if (CLIFF_RE.test(cat)) return true;
  if (INTERDICTION_RE.test(cat) && !VESSEL_ONLY_RE.test(cat)) return true;
  if (MILITARY_RE.test(cat)) return true;
  if (POLLUTION_RE.test(cat)) return true;
  return RESCUE_RE.test(cat);
}

/** Filtra uma lista de avisos para a faixa — preserva a ordem da fonte. */
export function safetyNavWarnings<T extends { category?: string | null; collection?: string | null }>(
  warnings: readonly T[] | null | undefined,
): T[] {
  return (warnings ?? []).filter(isSafetyNavWarning);
}
