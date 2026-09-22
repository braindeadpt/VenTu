/**
 * Classificação da faixa de segurança (§0): quais avisos à navegação do IH
 * são «aviso de segurança real» — perigo físico para quem está na água —
 * vs. avisos informativos/administrativos que continuam na secção «No local».
 *
 * O campo `category` do ih-coastal-warnings.json é texto livre (~120 valores
 * distintos: editais, portarias, regulamentos, normas, assinalamentos, boias,
 * animais marinhos…). A classificação é por palavras-chave sobre a categoria
 * normalizada (minúsculas, sem acentos):
 *
 *  - EXCLUI primeiro: documentos administrativos permanentes (edital,
 *    portaria, regulamento, normas, requisitos, cancelamentos, pesca) e os
 *    avisos genéricos «aviso à navegação» sem mais conteúdo.
 *  - INCLUI depois: perigo/segurança à navegação, objectos e embarcações
 *    submersas ou à deriva, ajudas à navegação fora de serviço ou de posição,
 *    assinalamento, assoreamento/sondas, interdições/restrições/zonas
 *    condicionadas, obras e estruturas (cais, molhe, quebramar, viveiros,
 *    aquicultura, ODA/LiDAR), arribas instáveis, fogo de artifício e
 *    salvamento marítimo.
 *  - `collection === 'orca_anavnet_point'` (avistamentos/interacções de
 *    animais marinhos) nunca é faixa de segurança — é informação, e punha
 *    uma faixa de alarme permanente nos spots da zona.
 */

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Documentos administrativos/estáticos — começam assim, não são incidentes. */
const ADMIN_RE =
  /^(\d+ª?\s*alteracao\s+ao\s+)?(edital|portaria|regulamento|normas?|requisitos|cancelamento|pesca)\b|^aviso a navegacao\s*(n[ºo.]?\s*\d|$)/;

/** Perigo físico para a navegação/banhistas — palavras-chave na categoria. */
const DANGER_RE =
  /(perigo|seguranca\s+(da|de|para a|a)\s+navegacao|submers|deriva|embarca|apagad|inoperativ|desativad|avariad|retirad|fora d[ae] posi|reposicionamento|assinalamento|sinalizacao|sinal sonoro|farolim|baliza|mastro|boia|assoreamento|sondas|interdi|restri|condicionamento|zona em evol|delimita|danificad|abatimento|edifica|constru|quebramar|molhe|cais|pontao|barreira|reforco|prolongamento|viveiro|aquicol|subaquatic|armacao|windfloat|lidar|odas|instalacao|colocacao|equipamento|arriba|falesia|fogo de artif|salvamento|enfiamento|ondografo)/;

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
  if (ADMIN_RE.test(cat)) return false;
  return DANGER_RE.test(cat);
}

/** Filtra uma lista de avisos para a faixa — preserva a ordem da fonte. */
export function safetyNavWarnings<T extends { category?: string | null; collection?: string | null }>(
  warnings: readonly T[] | null | undefined,
): T[] {
  return (warnings ?? []).filter(isSafetyNavWarning);
}
