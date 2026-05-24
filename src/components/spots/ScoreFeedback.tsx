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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (sb as any).from('score_feedback').insert({
        spot_slug: spotSlug,
        sport,
        predicted_score: predictedScore,
        verdict,
        conditions_snapshot: conditionsSnapshot,
        client_id: getClientId(),
        locale,
      });

      if (insertError) throw insertError;
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
      <p className="text-xs text-fg-muted text-center">
        {isPt ? 'Obrigado — o teu feedback ajuda a calibrar scores.' : 'Thanks — your feedback helps calibrate scores.'}
      </p>
    );
  }

  return (
    <div className="space-y-2 pt-2 border-t border-divider/50 w-full">
      <p className="text-xs text-fg-subtle text-center">
        {isPt ? 'As condições reais foram…' : 'Were real conditions…'}
      </p>
      <div className="flex justify-center gap-2">
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
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-surface-2 border border-divider text-fg-muted hover:text-fg hover:bg-surface-3 transition-colors disabled:opacity-50"
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-score-poor text-center">{error}</p>}
    </div>
  );
}
