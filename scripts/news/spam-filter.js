/**
 * VenTu — Anti-spam keyword blacklist (deterministic, zero LLM cost)
 *
 * Items whose title OR summary contain any of these keywords are
 * discarded automatically. Case-insensitive, partial match.
 */
const BLACKLIST = [
  'subscribe',
  'buy now',
  'shop now',
  'newsletter',
  '% off',
  'win a',
  'giveaway',
  'discount',
  'promo code',
  'limited offer',
  'click here',
  'sponsored',
  'advertorial',
  'affiliate',
  'free shipping',
  'order now',
  'sign up',
  'exclusive offer',
  'coupon',
  'save big',
];

// Pre-compiled regexes for word-boundary matching to reduce false positives
// (e.g. "subscribe" won't match inside "subscribers" context in article text).
const BLACKLIST_PATTERNS = BLACKLIST.map(
  (kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
);

/**
 * Check if a piece of text contains any blacklisted keyword (word-boundary match).
 * @param {string} text
 * @returns {boolean}
 */
function isSpam(text) {
  if (!text) return false;
  return BLACKLIST_PATTERNS.some((re) => re.test(text));
}

/**
 * Check if a news item should be discarded.
 * Checks both title and summary.
 * @param {{ title?: string; summary?: string }} item
 * @returns {boolean} true if item should be discarded
 */
function canDiscard(item) {
  if (!item) return true;
  if (!item.title) return true;
  if (!item.url) return true;
  if (isSpam(item.title)) return true;
  if (item.summary && isSpam(item.summary)) return true;
  return false;
}

module.exports = { isSpam, canDiscard, BLACKLIST };
