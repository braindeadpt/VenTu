import { describe, it, expect, afterEach } from 'vitest';
import { getSiteOrigin, getAuthCallbackUrl } from '../auth';

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

describe('getAuthCallbackUrl', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it('constrói o callback com o origin configurado', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.ventu.surf';
    expect(getAuthCallbackUrl('pt')).toBe(
      'https://staging.ventu.surf/pt/auth/callback/',
    );
  });
});
