import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSiteOrigin, getAuthCallbackUrl } from '@/lib/auth';
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

describe('getAuthCallbackUrl (sem window)', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it('usa NEXT_PUBLIC_SITE_URL quando não há browser', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.ventu.surf';
    expect(getAuthCallbackUrl('pt')).toBe(
      'https://staging.ventu.surf/pt/auth/callback/',
    );
  });
});

describe('getSiteOrigin', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.CI;
  });

  it('usa NEXT_PUBLIC_SITE_URL quando definida (sem trailing slash)', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.ventu.surf/';
    expect(getSiteOrigin()).toBe('https://staging.ventu.surf');
  });

  it('mantém o default de produção fora de CI', () => {
    expect(getSiteOrigin()).toBe('https://ventu.surf');
  });

  it('exige NEXT_PUBLIC_SITE_URL em CI', () => {
    process.env.CI = 'true';
    expect(() => getSiteOrigin()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it('em CI com a env definida devolve-a', () => {
    process.env.CI = 'true';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ventu.surf';
    expect(getSiteOrigin()).toBe('https://ventu.surf');
  });
});
