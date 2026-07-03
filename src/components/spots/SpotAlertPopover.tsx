'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getSupabaseClient } from '@/lib/supabase';
import {
  fetchUserAlertPrefs,
  subscribeFavoritesAlerts,
  formatUserAlertsError,
  type AlertMode,
  type UserAlertPrefs,
} from '@/lib/userAlerts';
import { useAuth } from '@/contexts/AuthProvider';

interface SpotAlertPopoverProps {
  /** Spot id — added to favorites on save (alerts cover favorites). */
  spotId: string;
  sport: SportType;
  locale: string;
}

/**
 * "Alert me" button + popover in the spot hero score card.
 *
 * Honest scope: the alert backend is ONE preference per user covering all
 * their favorite spots (subscribe_favorites_alerts RPC). Saving here adds
 * the current spot to favorites (so the alert actually covers it) and the
 * copy says "your favorites", not "this spot". If a preference already
 * exists it is pre-filled and the user is told saving replaces it.
 */
export default function SpotAlertPopover({
  spotId,
  sport,
  locale,
}: SpotAlertPopoverProps) {
  const isPt = locale === 'pt';
  const { session, requestLogin, favorites, isFavorite, toggleFavorite } = useAuth();
  const [open, setOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [minScore, setMinScore] = useState(70);
  const [alertMode, setAlertMode] = useState<AlertMode>('digest');
  const [existing, setExisting] = useState<UserAlertPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  // If the user clicked while signed out, reopen after the login completes.
  useEffect(() => {
    if (pendingOpen && session) {
      setPendingOpen(false);
      setOpen(true);
    }
  }, [pendingOpen, session]);

  // Pre-fill from the existing preference so "save replaces it" is visible.
  useEffect(() => {
    if (!open || !session) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    let cancelled = false;
    fetchUserAlertPrefs(sb, session.user.id).then((prefs) => {
      if (cancelled || !prefs || !prefs.active) return;
      setExisting(prefs);
      setMinScore(prefs.min_score);
      setAlertMode(prefs.alert_mode);
    });
    return () => {
      cancelled = true;
    };
  }, [open, session]);

  const handleToggle = useCallback(() => {
    if (!session) {
      setPendingOpen(true);
      requestLogin('general');
      return;
    }
    setOpen((v) => !v);
    setError('');
  }, [session, requestLogin]);

  const handleSave = useCallback(async () => {
    setError('');
    setSaving(true);
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error(isPt ? 'Supabase não configurado' : 'Supabase not configured');

      // The alert covers favorites — make sure this spot is one of them.
      if (!isFavorite(spotId)) {
        await toggleFavorite(spotId);
      }

      const result = await subscribeFavoritesAlerts(sb, minScore, sport, locale, alertMode);
      if (!result.ok) {
        setError(formatUserAlertsError(result.error ?? 'unknown', isPt));
        return;
      }
      setSavedCount(result.favorite_count ?? null);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setOpen(false);
      }, 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : isPt ? 'Erro ao guardar' : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [minScore, sport, locale, alertMode, isPt, isFavorite, toggleFavorite, spotId]);

  const spotIsFavorite = isFavorite(spotId);
  const favoriteCountAfterSave = spotIsFavorite ? favorites.length : favorites.length + 1;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-input text-meta-sm font-medium border border-divider bg-surface-1/[0.04] text-fg-muted hover:text-fg hover:border-divider-strong transition-colors duration-150"
        aria-label={isPt ? 'Criar alerta de condições para os teus favoritos' : 'Create a conditions alert for your favorites'}
      >
        <Bell className="w-3.5 h-3.5" aria-hidden />
        {isPt ? 'Avisa-me' : 'Alert me'}
      </button>

      {open && (
        <>
          {/* Overlay backdrop — clicking anywhere outside closes the popover */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          {/* Popover positioned below the button */}
          <div
            className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-card border border-divider bg-bg-elevated shadow-modal p-3"
            role="dialog"
            aria-label={isPt ? 'Configurar alerta' : 'Configure alert'}
          >
            {saved ? (
              <div className="flex flex-col items-center gap-2 py-3 text-center">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-score-good/15 text-score-good">
                  <Check className="w-4 h-4" aria-hidden />
                </span>
                <p className="text-body-sm text-fg font-semibold">
                  {isPt ? 'Alerta ativo!' : 'Alert active!'}
                </p>
                <p className="text-meta-sm text-fg-muted">
                  {isPt
                    ? `Recebes email quando um dos teus ${savedCount ?? ''} favoritos bater o score definido.`
                    : `You'll get an email when one of your ${savedCount ?? ''} favorites meets your score.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-body-sm font-semibold text-fg">
                    {isPt ? 'Alerta de condições' : 'Conditions alert'}
                  </p>
                  <p className="text-meta-sm text-fg-muted mt-0.5">
                    {isPt
                      ? `Cobre os teus favoritos (${favoriteCountAfterSave} ${favoriteCountAfterSave === 1 ? 'spot' : 'spots'}).`
                      : `Covers your favorites (${favoriteCountAfterSave} ${favoriteCountAfterSave === 1 ? 'spot' : 'spots'}).`}
                    {!spotIsFavorite && (
                      <> {isPt ? 'Este spot será adicionado.' : 'This spot will be added.'}</>
                    )}
                  </p>
                </div>

                {/* Sport label */}
                <div className="flex items-center gap-2 text-meta-sm text-fg-muted">
                  <span className="font-medium text-fg">
                    {SPORT_LABELS[sport][isPt ? 'pt' : 'en']}
                  </span>
                </div>

                {/* Score threshold */}
                <div className="space-y-1">
                  <label className="text-meta-sm text-fg-muted">
                    {isPt ? 'Score mínimo' : 'Min. score'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={30}
                      max={100}
                      step={5}
                      value={minScore}
                      onChange={(e) => setMinScore(Number(e.target.value))}
                      className="flex-1 accent-accent"
                      aria-label={isPt ? 'Score mínimo' : 'Minimum score'}
                    />
                    <span className="font-mono tabular-nums text-meta font-semibold text-fg w-8 text-right">
                      {minScore}
                    </span>
                  </div>
                </div>

                {/* Frequency */}
                <div className="space-y-1">
                  <label className="text-meta-sm text-fg-muted">
                    {isPt ? 'Frequência' : 'Frequency'}
                  </label>
                  <div className="flex gap-1.5">
                    {(['digest', 'immediate'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setAlertMode(mode)}
                        className={`flex-1 py-1.5 rounded-input text-meta-sm font-medium border transition-colors duration-150 ${
                          alertMode === mode
                            ? 'bg-accent/15 text-accent border-accent/30'
                            : 'bg-surface-1/[0.04] text-fg-muted border-divider hover:text-fg'
                        }`}
                      >
                        {mode === 'digest'
                          ? (isPt ? 'Resumo' : 'Digest')
                          : (isPt ? 'Imediato' : 'Instant')}
                      </button>
                    ))}
                  </div>
                </div>

                {existing && (
                  <p className="text-meta-sm text-fg-muted border-l-2 border-score-fair/60 pl-2">
                    {isPt
                      ? `Substitui o alerta atual (${existing.sport} ≥ ${existing.min_score}).`
                      : `Replaces your current alert (${existing.sport} ≥ ${existing.min_score}).`}
                  </p>
                )}

                {error && (
                  <p className="text-meta-sm text-score-poor">{error}</p>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-2 rounded-input text-meta-sm font-semibold bg-accent text-bg-base hover:bg-accent-hover disabled:opacity-50 transition-colors duration-150 inline-flex items-center justify-center gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  ) : null}
                  {isPt ? 'Guardar alerta' : 'Save alert'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
