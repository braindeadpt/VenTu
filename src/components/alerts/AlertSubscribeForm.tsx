'use client';

import { useState } from 'react';
import { Bell, Send } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { SPORT_LABELS, ALL_SPORTS, type SportType } from '@/lib/sportRatings';

interface AlertSubscribeFormProps {
  spotSlug: string;
  spotName: string;
  defaultSport: SportType;
  locale: string;
}

const CLIENT_ID_KEY = 'ventu:client_id';

function getClientId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export default function AlertSubscribeForm({
  spotSlug,
  spotName,
  defaultSport,
  locale,
}: AlertSubscribeFormProps) {
  const isPt = locale === 'pt';
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sport, setSport] = useState<SportType>(defaultSport);
  const [minScore, setMinScore] = useState(70);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    if (!isSupabaseConfigured()) {
      setError(isPt ? 'Alertas indisponíveis (Supabase não configurado)' : 'Alerts unavailable (Supabase not configured)');
      return;
    }

    setSending(true);
    setError('');

    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Supabase unavailable');

      const verifyToken = crypto.randomUUID();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (sb as any).from('alert_subscriptions').insert({
        email: email.trim().toLowerCase(),
        spot_slug: spotSlug,
        sport,
        min_score: minScore,
        verify_token: verifyToken,
        verified: false,
        active: true,
        client_id: getClientId(),
        locale,
      });

      if (insertError) throw insertError;

      setSent(true);
      setEmail('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
      >
        <Bell className="w-4 h-4" />
        {isPt ? 'Alerta por email' : 'Email alert'}
      </button>
    );
  }

  return (
    <div className="card-1 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-data-waves" />
        <h3 className="text-sm font-semibold text-fg">
          {isPt ? `Alertas — ${spotName}` : `Alerts — ${spotName}`}
        </h3>
      </div>

      {sent ? (
        <p className="text-sm text-fg-muted">
          {isPt
            ? 'Subscrição registada. Receberás um email de confirmação antes dos alertas começarem.'
            : 'Subscription saved. You will receive a confirmation email before alerts start.'}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-fg-subtle">
            {isPt
              ? 'Aviso por email quando o score atingir o limiar (máx. 1× por 3h).'
              : 'Email when score hits your threshold (max once per 3h).'}
          </p>

          <div>
            <label className="block text-xs text-fg-muted mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-sm text-fg"
            />
          </div>

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
                className="w-full px-3 py-2 rounded-lg bg-surface-1/[0.04] border border-divider text-sm text-fg"
              />
            </div>
          </div>

          {error && <p className="text-xs text-score-poor">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={sending}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-surface-2/[0.08] border border-divider-strong text-sm font-medium hover:bg-surface-3/[0.12] disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? (isPt ? 'A guardar…' : 'Saving…') : (isPt ? 'Subscrever' : 'Subscribe')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 h-9 rounded-lg text-sm text-fg-muted hover:bg-surface-2/[0.08]"
            >
              {isPt ? 'Fechar' : 'Close'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
