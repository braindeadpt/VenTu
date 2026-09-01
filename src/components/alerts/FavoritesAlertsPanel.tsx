'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Send, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';
import { SPORT_LABELS, ALL_SPORTS, type SportType } from '@/lib/sportRatings';
import { getTranslation } from '@/lib/i18n';
import {
  deactivateUserAlerts,
  fetchUserAlertPrefs,
  formatUserAlertsError,
  subscribeFavoritesAlerts,
  alertModeLabel,
  type AlertMode,
  type UserAlertPrefs,
} from '@/lib/userAlerts';
import Button from '@/components/ui/Button';

interface FavoritesAlertsPanelProps {
  locale: string;
  favoriteCount: number;
}

export default function FavoritesAlertsPanel({ locale, favoriteCount }: FavoritesAlertsPanelProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale);
  const a = t.alerts;
  const { session, favoritesReady } = useAuth();
  const [prefs, setPrefs] = useState<UserAlertPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState<SportType>('kitesurf');
  const [minScore, setMinScore] = useState(70);
  const [alertMode, setAlertMode] = useState<AlertMode>('digest');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const loadPrefs = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb || !session?.user) {
      setPrefs(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const row = await fetchUserAlertPrefs(sb, session.user.id);
      setPrefs(row);
      if (row) {
        setSport(row.sport as SportType);
        setMinScore(row.min_score);
        setAlertMode(row.alert_mode);
      }
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user || !favoritesReady) {
      setPrefs(null);
      setLoading(false);
      return;
    }
    void loadPrefs();
  }, [session?.user, favoritesReady, loadPrefs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb || !session?.user) return;

    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const result = await subscribeFavoritesAlerts(sb, minScore, sport, locale, alertMode);
      if (!result.ok) {
        setError(formatUserAlertsError(result.error, isPt));
        return;
      }

      await loadPrefs();
      setSaved(true);
    } catch {
      setError(formatUserAlertsError(undefined, isPt));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;

    setSaving(true);
    setError('');
    try {
      await deactivateUserAlerts(sb);
      await loadPrefs();
      setSaved(false);
    } catch {
      setError(formatUserAlertsError(undefined, isPt));
    } finally {
      setSaving(false);
    }
  };

  if (!session?.user || loading) return null;

  const isActive = prefs?.active === true;
  const isVerified = prefs?.verified === true;
  const pendingConfirm = isActive && !isVerified;

  return (
    <section id="alertas" className="card-1 p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Bell className="w-5 h-5 text-data-waves shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">{a.emailAlerts}</h2>
          <p className="text-meta-sm text-fg-muted mt-1">
            {a.introNotify
              .replace('{count}', String(favoriteCount))
              .replace('{favs}', favoriteCount === 1 ? a.favOne : a.favMany)}
          </p>
        </div>
      </div>

      {isActive && isVerified && (
        <p className="text-xs text-score-good font-medium">
          {a.alertsActive}
          {' · '}
          {SPORT_LABELS[prefs!.sport as SportType]?.[isPt ? 'pt' : 'en'] ?? prefs!.sport}
          {' · '}
          score ≥ {prefs!.min_score}
          {' · '}
          {alertModeLabel(prefs!.alert_mode, isPt)}
        </p>
      )}

      {pendingConfirm && (
        <p className="text-xs text-fg-muted">{a.confirmLinkFirst}</p>
      )}

      {saved && !pendingConfirm && isActive && (
        <p className="text-xs text-fg-muted">{a.prefsSaved}</p>
      )}

      {saved && pendingConfirm && (
        <p className="text-xs text-fg-muted">{a.subSavedConfirm}</p>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-fg-muted mb-1">{t.spotVerify.sportTabsAria}</label>
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value as SportType)}
              className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-sm text-fg"
            >
              {ALL_SPORTS.map((s) => (
                <option key={s} value={s}>
                  {SPORT_LABELS[s][isPt ? 'pt' : 'en']}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-fg-muted mb-1">{a.minScore}</label>
            <input
              type="number"
              min={30}
              max={100}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-sm text-fg font-mono tabular-nums"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-fg-muted mb-1">{a.frequency}</label>
          <select
            value={alertMode}
            onChange={(e) => setAlertMode(e.target.value as AlertMode)}
            className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-sm text-fg"
          >
            <option value="digest">{a.dailyDigest}</option>
            <option value="immediate">{a.immediate}</option>
          </select>
        </div>

        {error && <p className="text-xs text-score-poor">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={saving || favoriteCount === 0}
            className="inline-flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" aria-hidden />
            {saving
              ? a.saving
              : isActive
                ? a.updateAlerts
                : a.enableAlerts}
          </Button>
          {isActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => void deactivate()}
              className="inline-flex items-center gap-1.5 text-fg-muted"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
              {a.disable}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
