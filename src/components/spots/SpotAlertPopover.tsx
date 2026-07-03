'use client';

import { useState, useCallback } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import type { SportType, GridSportFilter } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { subscribeFavoritesAlerts, formatUserAlertsError } from '@/lib/userAlerts';
import { useAuth } from '@/contexts/AuthProvider';

interface SpotAlertPopoverProps {
  spotSlug: string;
  sport: SportType;
  score: number;
  locale: string;
  /** Callback to open the login modal. */
  onRequestLogin: () => void;
}

export default function SpotAlertPopover({
  spotSlug,
  sport,
  score,
  locale,
  onRequestLogin,
}: SpotAlertPopoverProps) {
  const isPt = locale === 'pt';
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [minScore, setMinScore] = useState(70);
  const [alertMode, setAlertMode] = useState<'digest' | 'immediate'>('digest');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleToggle = useCallback(() => {
    if (!session) {
      onRequestLogin();
      return;
    }
    setOpen((v) => !v);
    setError('');
  }, [session, onRequestLogin]);

  const handleSave = useCallback(async () => {
    setError('');
    setSaving(true);
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error(isPt ? 'Supabase não configurado' : 'Supabase not configured');

      const result = await subscribeFavoritesAlerts(sb, minScore, sport, locale, alertMode);
      if (!result.ok) {
        setError(formatUserAlertsError(result.error ?? 'unknown', isPt));
        return;
      }
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setOpen(false);
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : isPt ? 'Erro ao guardar' : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [minScore, sport, locale, alertMode, isPt]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-input text-meta-sm font-medium border border-divider bg-surface-1/[0.04] text-fg-muted hover:text-fg hover:border-divider-strong transition-colors duration-150"
        aria-label={isPt ? 'Avisa-me quando este spot estiver a bombar' : 'Alert me when this spot is firing'}
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
                    ? 'Recebes notificação quando as condições baterem o score definido.'
                    : 'You\'ll be notified when conditions meet your score threshold.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-body-sm font-semibold text-fg">
                  {isPt ? 'Avisa-me quando...' : 'Alert me when...'}
                </p>

                {/* Sport label (read-only) */}
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
