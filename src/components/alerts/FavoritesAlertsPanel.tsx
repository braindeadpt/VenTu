'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Send, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';
import { SPORT_LABELS, ALL_SPORTS, type SportType } from '@/lib/sportRatings';
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
          <h2 className="text-sm font-semibold text-fg">
            {isPt ? 'Alertas por email' : 'Email alerts'}
          </h2>
          <p className="text-meta-sm text-fg-muted mt-1">
            {isPt
              ? `Avisa-te quando algum dos teus ${favoriteCount} favorito${favoriteCount === 1 ? '' : 's'} atingir o score mínimo. Por defeito: resumo diário (~7h30); opcional: alerta imediato (máx. 1×/3h).`
              : `Get notified when any of your ${favoriteCount} favorite${favoriteCount === 1 ? '' : 's'} hits the minimum score. Default: daily digest (~7:30 AM); optional: immediate alert (max once per 3h).`}
          </p>
        </div>
      </div>

      {isActive && isVerified && (
        <p className="text-xs text-score-good font-medium">
          {isPt ? 'Alertas activos' : 'Alerts active'}
          {' · '}
          {SPORT_LABELS[prefs!.sport as SportType]?.[isPt ? 'pt' : 'en'] ?? prefs!.sport}
          {' · '}
          {isPt ? 'score ≥' : 'score ≥'} {prefs!.min_score}
          {' · '}
          {alertModeLabel(prefs!.alert_mode, isPt)}
        </p>
      )}

      {pendingConfirm && (
        <p className="text-xs text-fg-muted">
          {isPt
            ? 'Confirma o link que enviámos para o teu email antes dos alertas começarem.'
            : 'Confirm the link we sent to your email before alerts start.'}
        </p>
      )}

      {saved && !pendingConfirm && isActive && (
        <p className="text-xs text-fg-muted">
          {isPt ? 'Preferências guardadas.' : 'Preferences saved.'}
        </p>
      )}

      {saved && pendingConfirm && (
        <p className="text-xs text-fg-muted">
          {isPt
            ? 'Subscrição registada. Receberás um email de confirmação.'
            : 'Subscription saved. You will receive a confirmation email.'}
        </p>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-fg-muted mb-1">{isPt ? 'Modalidade' : 'Sport'}</label>
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
            <label className="block text-xs text-fg-muted mb-1">{isPt ? 'Score mín.' : 'Min score'}</label>
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
          <label className="block text-xs text-fg-muted mb-1">{isPt ? 'Frequência' : 'Frequency'}</label>
          <select
            value={alertMode}
            onChange={(e) => setAlertMode(e.target.value as AlertMode)}
            className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-sm text-fg"
          >
            <option value="digest">
              {isPt ? 'Resumo diário (~7h30) — recomendado' : 'Daily digest (~7:30 AM) — recommended'}
            </option>
            <option value="immediate">
              {isPt ? 'Imediato quando estiver bom (máx. 1×/3h)' : 'Immediate when conditions fire (max once per 3h)'}
            </option>
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
              ? isPt
                ? 'A guardar…'
                : 'Saving…'
              : isActive
                ? isPt
                  ? 'Actualizar alertas'
                  : 'Update alerts'
                : isPt
                  ? 'Activar alertas'
                  : 'Enable alerts'}
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
              {isPt ? 'Desactivar' : 'Disable'}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
