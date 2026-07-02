import type { SupabaseClient } from '@supabase/supabase-js';
import type { SportType } from '@/lib/sportRatings';

export interface UserAlertPrefs {
  user_id: string;
  email: string;
  min_score: number;
  sport: string;
  verified: boolean;
  active: boolean;
  locale: string;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscribeFavoritesAlertsResult {
  ok: boolean;
  verified?: boolean;
  favorite_count?: number;
  error?: string;
}

export async function fetchUserAlertPrefs(
  sb: SupabaseClient,
  userId: string,
): Promise<UserAlertPrefs | null> {
  const { data, error } = await sb
    .from('user_alert_prefs')
    .select('user_id, email, min_score, sport, verified, active, locale, last_sent_at, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserAlertPrefs;
}

export async function subscribeFavoritesAlerts(
  sb: SupabaseClient,
  minScore: number,
  sport: SportType,
  locale: string,
): Promise<SubscribeFavoritesAlertsResult> {
  const { data, error } = await (sb as SupabaseClient).rpc('subscribe_favorites_alerts', {
    p_min_score: minScore,
    p_sport: sport,
    p_locale: locale,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('rate_limit')) {
      return { ok: false, error: 'rate_limit' };
    }
    if (message.includes('not_authenticated')) {
      return { ok: false, error: 'not_authenticated' };
    }
    return { ok: false, error: message || 'subscribe_failed' };
  }

  const row = data as { ok?: boolean; verified?: boolean; favorite_count?: number; error?: string } | null;
  if (!row?.ok) {
    return { ok: false, error: row?.error ?? 'subscribe_failed' };
  }

  return {
    ok: true,
    verified: row.verified,
    favorite_count: row.favorite_count,
  };
}

export async function deactivateUserAlerts(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await (sb as SupabaseClient).rpc('deactivate_user_alerts');
  return !error && data === true;
}

export function formatUserAlertsError(error: string | undefined, isPt: boolean): string {
  const fallback = isPt ? 'Não foi possível guardar. Tenta outra vez.' : 'Could not save. Please try again.';

  switch (error) {
    case 'no_favorites':
      return isPt
        ? 'Guarda pelo menos um spot nos favoritos antes de activar alertas.'
        : 'Save at least one favorite spot before enabling alerts.';
    case 'rate_limit':
      return isPt
        ? 'Demasiadas tentativas. Espera 1 minuto e tenta outra vez.'
        : 'Too many attempts. Wait a minute and try again.';
    case 'invalid_score':
      return isPt ? 'Score inválido.' : 'Invalid score.';
    case 'not_authenticated':
      return isPt ? 'Tens de estar logado.' : 'You must be signed in.';
    default:
      return fallback;
  }
}
