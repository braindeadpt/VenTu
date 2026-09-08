/**
 * VenTu — Deterministic PT-PT post-processing for news copy
 *
 * Runs after LLM translate (and on merge backfill) to strip WordPress
 * footers, fix known MT/BR artifacts, and clean promo chrome.
 * Not a full literary rewrite — safe lexical + pattern fixes only.
 */

/** WordPress / Magento-style “appeared first on …” footers (EN + PT MT). */
const WP_FOOTER_RE =
  /\s*(?:O\s+post|O\s+artigo|A\s+publica[cç][aã]o|The\s+post|The\s+article)\s+[\s\S]{0,200}?(?:apareceu\s+pela\s+primeira\s+vez\s+(?:no|em|na)|apareceu\s+primeiro\s+(?:no|em|na)|appeared\s+first\s+on)\s+[^.]*\.?\s*/gi;

/** Trailing social chrome often left on IKSURF Mag titles. */
const TRAILING_HASHTAG_RE = /(?:\s*[#@][\w.]+)+\s*$/g;

/**
 * Safe BR / MT → PT-PT (or keep EN sport jargon) replacements.
 * Order matters for overlapping patterns.
 */
const LEXICON = [
  // Literal MT of “unhooked”
  { re: /\bDESENGANCADO\b/g, to: 'UNHOOKED' },
  { re: /\bDesengancado\b/g, to: 'Unhooked' },
  { re: /\bdesengancado\b/g, to: 'unhooked' },
  // PT-BR CTA / shoppy openers
  { re: /\bConfira\b/g, to: 'Descobre' },
  { re: /\bconfira\b/g, to: 'descobre' },
  // BR demonstrative → PT-PT (specific first)
  { re: /\bEssa vibra[cç][aã]o\b/gi, to: 'Aquela vibração' },
  { re: /\bEssa\b(?=\s+[A-ZÁÉÍÓÚÂÊÔÃÕ])/g, to: 'Aquela' },
  // BR “você” forms (rare in sports RSS but appears in MT)
  { re: /\bVoc[eê]\b/g, to: 'Tu' },
  { re: /\bvoc[eê]\b/g, to: 'tu' },
  // Formal “o seu / a sua” → neutral PT-PT where it’s clearly product copy
  { re: /\bonde está o seu kite\b/gi, to: 'onde está o kite' },
  { re: /\bcom o seu último truque\b/gi, to: 'com o último truque' },
  { re: /\bsabendo que o seu equipamento\b/gi, to: 'sabendo que o equipamento' },
  { re: /\bQual a sua prefer[eê]ncia\b/gi, to: 'Qual a preferência' },
  // Title case promo leftovers
  { re: /\bOutono\/Inverno\b/g, to: 'Outono/inverno' },
  { re: /\bFall\/Winter\b/g, to: 'outono/inverno' },
  // Truncated MT endings
  { re: /\blogo antes de\.?\s*$/i, to: '' },
  { re: /\bpouco antes do sinal\.?\s*$/i, to: 'pouco antes do sinal.' },
];

/**
 * Collapse whitespace / weird punctuation left after stripping.
 * @param {string} text
 * @returns {string}
 */
function tidy(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    // Collapse run-on punctuation but keep ellipsis (…)
    .replace(/\.{4,}/g, '...')
    .replace(/([!?])\1+/g, '$1')
    .replace(/\s+\.\s*$/g, '.')
    .trim();
}

/**
 * Normalise a single PT (or mixed) string.
 * @param {string} text
 * @param {{ stripHashtags?: boolean }} [opts]
 * @returns {string}
 */
function normalizePtText(text, opts = {}) {
  if (!text || typeof text !== 'string') return text;
  let out = text;

  out = out.replace(WP_FOOTER_RE, ' ');

  for (const { re, to } of LEXICON) {
    out = out.replace(re, to);
  }

  if (opts.stripHashtags !== false) {
    out = out.replace(TRAILING_HASHTAG_RE, '');
  }

  // Drop orphan emoji-only tails after footer strip
  out = out.replace(/(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*)+$/u, '');

  return tidy(out);
}

/**
 * Apply PT-PT normalisation to a news item (mutates and returns).
 * Only touches PT-facing fields (`title`, `summary`). EN fields stay as-is
 * except EN WP footers are stripped from `summaryEn` when present.
 *
 * @param {object} item
 * @returns {object}
 */
function normalizeNewsItem(item) {
  if (!item || typeof item !== 'object') return item;

  if (item.title) item.title = normalizePtText(item.title, { stripHashtags: true });
  if (item.summary) item.summary = normalizePtText(item.summary, { stripHashtags: false });

  // EN side: strip WP footers only (keep original EN wording)
  if (item.summaryEn) {
    item.summaryEn = tidy(String(item.summaryEn).replace(WP_FOOTER_RE, ' '));
  }
  if (item.titleEn) {
    item.titleEn = tidy(String(item.titleEn).replace(TRAILING_HASHTAG_RE, ''));
  }

  return item;
}

/**
 * Map over an array of news items.
 * @param {object[]} items
 * @returns {object[]}
 */
function normalizeNewsItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => normalizeNewsItem({ ...item }));
}

module.exports = {
  normalizePtText,
  normalizeNewsItem,
  normalizeNewsItems,
  WP_FOOTER_RE,
  LEXICON,
};
