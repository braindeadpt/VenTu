'use client';

import { useCallback, useEffect, useState } from 'react';
import { Send, Unlink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase';
import Button from '@/components/ui/Button';
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
  const isPt = locale === 'pt';
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
        setError(isPt ? 'Não foi possível gerar o link.' : 'Could not create link.');
        return;
      }
      const url = telegramDeepLink(result.token);
      setDeepLink(url);
      window.open(url, '_blank', 'noopener,noreferrer');
      await reload();
    } catch {
      setError(isPt ? 'Erro ao ligar Telegram.' : 'Error linking Telegram.');
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
        setError(isPt ? 'Não foi possível desligar.' : 'Could not unlink.');
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
          <p className="text-meta-sm text-fg-muted mt-1">
            {isPt
              ? 'Recebe o mesmo aviso dos favoritos no Telegram (após activares alertas por email).'
              : 'Get the same favorites alert on Telegram (after enabling email alerts).'}
          </p>
        </div>
      </div>

      {linked ? (
        <p className="text-xs text-score-good font-medium">
          {isPt ? 'Telegram ligado' : 'Telegram linked'}
        </p>
      ) : (
        <p className="text-xs text-fg-muted">
          {isPt
            ? '1) Clica em Ligar · 2) Abre o bot e toca Start · 3) Em ~15 min fica activo'
            : '1) Tap Link · 2) Open the bot and tap Start · 3) Active within ~15 min'}
        </p>
      )}

      {error && <p className="text-xs text-score-poor">{error}</p>}

      {deepLink && !linked && (
        <p className="text-xs text-fg-muted break-all">
          {isPt ? 'Se a janela não abriu: ' : 'If the window did not open: '}
          <a href={deepLink} className="text-accent underline" target="_blank" rel="noopener noreferrer">
            {isPt ? 'abrir bot' : 'open bot'}
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
            {busy ? (isPt ? 'A gerar…' : 'Working…') : isPt ? 'Ligar Telegram' : 'Link Telegram'}
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
            {isPt ? 'Desligar' : 'Unlink'}
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
            {isPt ? 'Já fiz Start — actualizar' : 'I tapped Start — refresh'}
          </Button>
        )}
      </div>
    </section>
  );
}
