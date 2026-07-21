/**
 * Escape user-controlled strings before embedding in HTML email bodies.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Locale path segment for ventu.surf URLs (`pt` | `en`).
 * @param {unknown} locale
 * @returns {'pt' | 'en'}
 */
function safeLocale(locale) {
  return locale === 'en' ? 'en' : 'pt';
}

module.exports = { escapeHtml, safeLocale };
