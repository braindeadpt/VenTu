/**
 * <html lang> por locale — fonte única partilhada por
 * scripts/fixup-next-segment-paths.js (reescreve o atributo depois do build) e
 * scripts/check-export-routes.js (valida o export em CI). A raiz estática é
 * partilhada e hardcodes lang="pt-PT"; cada directório de locale deve
 * anunciar o seu próprio lang server-side (issue #457).
 */

/** O <html lang> que cada locale deve ter no export. */
const LANG_BY_LOCALE = { pt: 'pt-PT', en: 'en', es: 'es', de: 'de', fr: 'fr' };

/**
 * Primeiro <html ...> tag e o seu lang. O \s exigido antes de `lang` impede
 * casar com um xml:lang; grupo 1 = prefixo até a esse espaço, grupo 2 = valor
 * do atributo.
 */
const HTML_LANG_RE = /<html([^>]*?\s)lang="([^"]*)"/;

/**
 * Rewrite the lang attribute of the first <html ...> tag to `lang`, touching
 * nothing else in the file. Whitespace is required before `lang`, so an
 * xml:lang attribute can never be rewritten by mistake, and the replacement
 * keeps the tag byte-identical apart from the attribute value. Returns the
 * input unchanged when the tag already carries the right lang (or has none).
 */
function fixHtmlLang(html, lang) {
  // No "already correct" fast-path on the raw file: a body containing
  // lang="<target>" (e.g. a hreflang alternate link) must not skip a page
  // whose <html> tag still says pt-PT. The regex is idempotent — a correct
  // tag rewrites to the identical string and the caller skips the write.
  return html.replace(HTML_LANG_RE, (_match, pre) => `<html${pre}lang="${lang}"`);
}

module.exports = { LANG_BY_LOCALE, HTML_LANG_RE, fixHtmlLang };
