'use client';

import { useState } from 'react';
import { ThumbsDown, Minus, ThumbsUp } from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import type { SportType } from '@/lib/sportRatings';

type Verdict = 'better' | 'same' | 'worse';

interface ScoreFeedbackProps {
  spotSlug: string;
  sport: SportType;
  predictedScore: number;
  conditionsSnapshot: Record<string, number>;
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

export default function ScoreFeedback({
  spotSlug,
  sport,
  predictedScore,
  conditionsSnapshot,
  locale,
}: ScoreFeedbackProps) {
  const isPt = locale === 'pt';
  const [sent, setSent] = useState<Verdict | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (verdict: Verdict) => {
    if (sent || sending) return;

    if (!isSupabaseConfigured()) {
      setError(isPt ? 'Feedback indisponível (Supabase não configurado)' : 'Feedback unavailable (Supabase not configured)');
      return;
    }

    setSending(true);
    setError('');

    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Supabase unavailable');

      // Anon writes go through the hardened RPC (per-IP rate limit) — direct
      // INSERT is revoked in supabase-contributions-harden-rpc.sql.
      const { data, error: rpcError } = await (sb as any).rpc('submit_score_feedback', {
        p_spot_slug: spotSlug,
        p_sport: sport,
        p_predicted_score: predictedScore,
        p_verdict: verdict,
        p_conditions_snapshot: conditionsSnapshot,
        p_client_id: getClientId(),
        p_locale: locale,
      });

      if (rpcError) throw rpcError;
      if (!data?.ok) {
        setError(
          data?.error === 'rate_limit'
            ? (isPt ? 'Demasiados votos — tenta novamente dentro de um minuto.' : 'Too many votes — try again in a minute.')
            : (isPt ? 'Erro ao enviar feedback' : 'Error sending feedback')
        );
        return;
      }
      setSent(verdict);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <p className="text-meta-sm text-fg-muted">
        {isPt ? 'Obrigado — o teu feedback ajuda a calibrar scores.' : 'Thanks — your feedback helps calibrate scores.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
      <p className="text-meta-sm text-fg-muted">
        {isPt ? 'As condições reais foram…' : 'Were real conditions…'}
      </p>
      <div className="flex flex-wrap gap-2">
        {([
          ['worse', ThumbsDown, isPt ? 'Piores' : 'Worse'],
          ['same', Minus, isPt ? 'Iguais' : 'Same'],
          ['better', ThumbsUp, isPt ? 'Melhores' : 'Better'],
        ] as const).map(([verdict, Icon, label]) => (
          <button
            key={verdict}
            type="button"
            disabled={sending}
            onClick={() => submit(verdict)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-input text-meta-sm bg-surface-2/[0.08] border border-divider text-fg-muted hover:text-fg hover:border-divider-strong transition-colors duration-150 disabled:opacity-50"
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-meta-sm text-score-poor sm:col-span-2">{error}</p>}
    </div>
  );
}
