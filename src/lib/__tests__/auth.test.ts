import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAuthCallbackUrl } from '@/lib/auth';
import { locales } from '@/lib/i18n';

describe('getAuthCallbackUrl', () => {
  const ORIGIN = 'https://ventu.test';

  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: ORIGIN } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(locales)('keeps supported locale %s in the callback path', (locale) => {
    expect(getAuthCallbackUrl(locale)).toBe(`${ORIGIN}/${locale}/auth/callback/`);
  });

  it.each(['es-ES', 'de-DE', 'fr-FR', 'en-US', 'xx', ''])(
    'falls back to pt for unsupported locale %s',
    (locale) => {
      expect(getAuthCallbackUrl(locale)).toBe(`${ORIGIN}/pt/auth/callback/`);
    },
  );
});
