/** Auth helpers — magic link (Supabase Auth) */

import { locales } from './i18n';

export function getSiteOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://ventu.surf';
}

export function getAuthCallbackUrl(locale: string): string {
  const loc = (locales as readonly string[]).includes(locale) ? locale : 'pt';
  return `${getSiteOrigin()}/${loc}/auth/callback/`;
}

export const FAVORITES_MIGRATED_KEY = 'ventu:favorites-migrated';
export const CHECKINS_MIGRATED_KEY = 'ventu:checkins-migrated';
