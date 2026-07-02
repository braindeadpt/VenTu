/** Auth helpers — magic link (Supabase Auth) */

export function getSiteOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://ventu.surf';
}

export function getAuthCallbackUrl(locale: string): string {
  const loc = locale === 'en' ? 'en' : 'pt';
  return `${getSiteOrigin()}/${loc}/auth/callback/`;
}

export const FAVORITES_MIGRATED_KEY = 'ventu:favorites-migrated';
