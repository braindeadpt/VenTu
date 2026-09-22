/**
 * Sanitização de texto vindo de feeds/HTML de terceiros (RSS, emails).
 *
 * Contrato: **nenhum `<` ou `>` sai das funções deste módulo**. Todo o texto
 * externo passa por aqui antes de ser cozido em HTML/JSON-LD.
 *
 * Porque não um simples `replace(/<[^>]*>/g, '')` (CodeQL
 * `js/incomplete-multi-character-sanitization`): um strip por regex é
 * incompleto — `<<script>script>` perde o `<script>` interior e deixa
 * `<script>` vivo. Remover os caracteres de markup é mais forte e trivial de
 * verificar.
 *
 * Porque não cadeias de `replace` entidade a entidade (CodeQL
 * `js/double-escaping`): `&amp;`→`&` seguido de `&lt;`→`<` descodifica DUAS
 * vezes uma única ronda de escape, pelo que `&amp;lt;script&amp;gt;` chega a
 * markup vivo. A descodificação é feita numa só passagem de regex, por isso
 * cada entidade é consumida no máximo uma vez.
 */

/** Entidades nomeadas usadas pelos feeds que consumimos. */
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  // Mapeamentos numéricos → ASCII que o pipeline sempre usou (comportamento
  // intencional: os resumos ficam em texto simples, sem aspas curvas/travessões
  // Unicode). Chaves SEM `&`/`;` — a regex captura só o corpo da entidade.
  '#8216': "'",
  '#8217': "'",
  '#8220': '"',
  '#8221': '"',
  '#8230': '...',
  '#8211': '-',
  '#8212': '--',
  '#038': '&',
};

function codePointToString(code, fallback) {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return fallback;
  return String.fromCodePoint(code);
}

/**
 * Descodifica entidades HTML numa única passagem.
 * @param {unknown} text
 * @returns {string}
 */
function decodeEntities(text) {
  if (text == null) return '';
  return String(text).replace(/&(#[0-9]+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (NAMED_ENTITIES[key] != null) return NAMED_ENTITIES[key];
    if (key.startsWith('#x')) return codePointToString(Number.parseInt(key.slice(2), 16), match);
    if (key.startsWith('#')) return codePointToString(Number.parseInt(key.slice(1), 10), match);
    return match;
  });
}

/**
 * Remove markup: strip de tags → descodifica (uma passagem) → strip repetido
 * até estabilizar → remove os `<`/`>` residuais (a garantia do contrato).
 *
 * O strip repetido é necessário porque a descodificação revela tags novas
 * (`&lt;script&gt;` → `<script>`), e o limite de passagens evita ciclos num
 * texto patológico. A remoção final de `<`/`>` cobre os bypasses clássicos de
 * um só strip (`<<script>script>` sobrevive à primeira passagem) — CodeQL
 * `js/incomplete-multi-character-sanitization`.
 *
 * @param {unknown} raw
 * @returns {string}
 */
function stripTags(raw) {
  if (raw == null) return '';
  let text = String(raw).replace(/<[^>]*>/g, '');
  text = decodeEntities(text);
  // Ponto fixo: repetir o strip ATÉ o texto parar de mudar (padrão que o
  // CodeQL reconhece para js/incomplete-multi-character-sanitization), porque
  // a descodificação revela tags novas (`&lt;script&gt;` → `<script>`).
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  // Garantia final do contrato: nenhum `<` ou `>` sai daqui — cobre os
  // bypasses que sobrevivem a um strip (`<<script>script>`).
  return text.replace(/[<>]/g, '').trim();
}

/**
 * Converte um corpo HTML em texto simples (fallback de email, onde filtros
 * penalizam HTML-only): mantém os hrefs em parênteses, preserva quebras de
 * bloco e garante o contrato «sem `<`/`>`».
 * @param {unknown} html
 * @returns {string}
 */
function htmlToText(html) {
  if (html == null) return '';
  const withLinks = String(html).replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)');
  const unmarked = withLinks.replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, '');
  // Mesmo padrão do stripTags: descodifica uma vez e remove os `<`/`>` que
  // possam ter emergido da descodificação (contrato «sem markup»).
  const decoded = decodeEntities(unmarked).replace(/[<>]/g, '');
  return decoded.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { decodeEntities, stripTags, htmlToText };
