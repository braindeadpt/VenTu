/**
 * URL scheme helpers for the data pipeline (CJS mirror of src/lib/safeUrl.ts).
 * Used by the news pipeline to drop non-http(s) URLs and image srcs before
 * they reach public/data/*.json (S3).
 */

/**
 * Safe external URL — only http(s). Blocks javascript:/data:/vbscript: etc.
 */
function isSafeHttpUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Safe image src — http(s) URLs or site-relative paths rooted at `/`
 * (same origin; the documented events convention is `/images/events/*.jpg`).
 * Blocks javascript:, data:, vbscript:, protocol-relative `//host` and
 * backslash tricks (`\/evil`) that browsers may resolve as `//`.
 */
function isSafeImageUrl(url) {
  if (url == null) return false;
  const t = String(url).trim();
  if (!t) return false;
  if (t.startsWith('/')) {
    return !t.startsWith('//') && !t.startsWith('/\\');
  }
  return isSafeHttpUrl(t);
}

module.exports = { isSafeHttpUrl, isSafeImageUrl };
