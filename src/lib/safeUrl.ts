/**
 * Safe external hrefs for user-controlled URLs (directory website, etc.).
 * Only http(s) — blocks javascript:/data:/vbscript: stored XSS.
 */

export function safeExternalUrl(url: string | null | undefined): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return null;
  }

  return parsed.href;
}

/**
 * Build a tel: href from user phone text. Strips characters that could
 * break out of the tel scheme; returns null if nothing usable remains.
 */
export function safeTelHref(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  // Leading phone-shaped run only — stops before junk that could break tel:
  const match = trimmed.match(/^\+?[\d\s().\-]+/);
  if (!match) return null;
  const cleaned = match[0].trim();
  if (!cleaned.replace(/\D/g, '')) return null;
  return `tel:${cleaned}`;
}
