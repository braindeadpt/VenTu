'use client';

import { useCallback, useEffect, useState } from 'react';
import { Send, Unlink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import { getTranslation } from '@/lib/i18n';
import {
  createTelegramLinkToken,
  fetchUserTelegram,
  isTelegramAlertsEnabled,
  isTelegramLinked,
  telegramDeepLink,
  unlinkTelegram,
  type UserTelegramRow,
} from '@/lib/userTelegram';

export default function TelegramLinkCard({ locale }: { locale: string }) {
  const f = getTranslation(locale).account;
  const { session } = useAuth();
  const [row, setRow] = useState<UserTelegramRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deepLink, setDeepLink] = useState('');

  const enabled = isTelegramAlertsEnabled();

  const reload = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb || !session?.user) {
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRow(await fetchUserTelegram(sb, session.user.id));
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!enabled || !session?.user) {
      setLoading(false);
      return;
    }
    void reload();
  }, [enabled, session?.user, reload]);

  if (!enabled || !session?.user) return null;

  const linked = isTelegramLinked(row);

  const startLink = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    setBusy(true);
    setError('');
    setDeepLink('');
    try {
      const result = await createTelegramLinkToken(sb);
      if (!result.ok) {
        setError(f.telegramErrorLink);
        return;
      }
      const url = telegramDeepLink(result.token);
      setDeepLink(url);
      window.open(url, '_blank', 'noopener,noreferrer');
      await reload();
    } catch {
      setError(f.telegramErrorStart);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    setBusy(true);
    setError('');
    try {
      const result = await unlinkTelegram(sb);
      if (!result.ok) {
        setError(f.telegramErrorUnlink);
        return;
      }
      setDeepLink('');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <section className="card-1 p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Send className="w-5 h-5 text-data-waves shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">Telegram</h2>
          <p className="text-meta-sm text-fg-muted mt-1">{f.telegramIntro}</p>
        </div>
      </div>

      {linked ? (
        <p className="text-xs text-score-good font-medium">
          {f.telegramLinked}
        </p>
      ) : (
        <p className="text-xs text-fg-muted">{f.telegramSteps}</p>
      )}

      {error && <p className="text-xs text-score-poor">{error}</p>}

      {deepLink && !linked && (
        <p className="text-xs text-fg-muted break-all">
          {f.telegramWindowHint}
          <a href={deepLink} className="text-accent underline" target="_blank" rel="noopener noreferrer">
            {f.telegramOpenBot}
          </a>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!linked ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void startLink()}
            className="inline-flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" aria-hidden />
            {busy ? f.telegramWorking : f.telegramLink}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void unlink()}
            className="inline-flex items-center gap-1.5 text-fg-muted"
          >
            <Unlink className="w-3.5 h-3.5" aria-hidden />
            {f.telegramUnlink}
          </Button>
        )}
        {deepLink && !linked && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void reload()}
          >
            {f.telegramRefresh}
          </Button>
        )}
      </div>
    </section>
  );
}
