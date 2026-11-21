/** Auth helpers — magic link (Supabase Auth) */

import { locales } from './i18n';

export function getSiteOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (env) return env;
  // Audit 2026-11-21 (baixa): o fallback hardcoded escondia builds/deploys com
  // o origin errado. Em CI a env é obrigatória; localmente mantemos o default
  // de produção para não rebentar scripts e testes fora do pipeline.
  if (process.env.CI) {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is required in CI (e.g. https://ventu.surf)',
    );
  }
  return 'https://ventu.surf';
}

export function getAuthCallbackUrl(locale: string): string {
  const loc = (locales as readonly string[]).includes(locale) ? locale : 'pt';
  return `${getSiteOrigin()}/${loc}/auth/callback/`;
}

export const FAVORITES_MIGRATED_KEY = 'ventu:favorites-migrated';
export const CHECKINS_MIGRATED_KEY = 'ventu:checkins-migrated';
