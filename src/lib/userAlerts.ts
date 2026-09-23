import type { SupabaseClient } from '@supabase/supabase-js';
import type { SportType } from '@/lib/sportRatings';
import { getTranslation } from '@/lib/i18n';

export type AlertMode = 'digest' | 'immediate';

export interface UserAlertPrefs {
  user_id: string;
  email: string;
  min_score: number;
  sport: string;
  alert_mode: AlertMode;
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
  alert_mode?: AlertMode;
  error?: string;
}

export function alertModeLabel(mode: AlertMode, locale: string): string {
  const t = getTranslation(locale).alerts;
  return mode === 'immediate' ? t.modeImmediate : t.modeDigest;
}

export async function fetchUserAlertPrefs(
  sb: SupabaseClient,
  userId: string,
): Promise<UserAlertPrefs | null> {
  const { data, error } = await sb
    .from('user_alert_prefs')
    .select(
      'user_id, email, min_score, sport, alert_mode, verified, active, locale, last_sent_at, created_at, updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as UserAlertPrefs;
  return {
    ...row,
    alert_mode: row.alert_mode === 'immediate' ? 'immediate' : 'digest',
  };
}

export async function subscribeFavoritesAlerts(
  sb: SupabaseClient,
  minScore: number,
  sport: SportType,
  locale: string,
  alertMode: AlertMode = 'digest',
): Promise<SubscribeFavoritesAlertsResult> {
  const { data, error } = await (sb as SupabaseClient).rpc('subscribe_favorites_alerts', {
    p_min_score: minScore,
    p_sport: sport,
    p_locale: locale,
    p_alert_mode: alertMode,
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

  const row = data as {
    ok?: boolean;
    verified?: boolean;
    favorite_count?: number;
    alert_mode?: AlertMode;
    error?: string;
  } | null;
  if (!row?.ok) {
    return { ok: false, error: row?.error ?? 'subscribe_failed' };
  }

  return {
    ok: true,
    verified: row.verified,
    favorite_count: row.favorite_count,
    alert_mode: row.alert_mode === 'immediate' ? 'immediate' : 'digest',
  };
}

export async function deactivateUserAlerts(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await (sb as SupabaseClient).rpc('deactivate_user_alerts');
  return !error && data === true;
}

export function formatUserAlertsError(error: string | undefined, locale: string): string {
  const t = getTranslation(locale).alerts;
  const fallback = t.errFallback;

  switch (error) {
    case 'no_favorites':
      return t.errNoFavorites;
    case 'rate_limit':
      return t.errRateLimited;
    case 'invalid_score':
      return t.errInvalidScore;
    case 'not_authenticated':
      return t.errNotAuthenticated;
    default:
      return fallback;
  }
}
