'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export default function AlertUnsubscribeClient({ locale, token }: { locale: string; token: string }) {
  const isPt = locale === 'pt';
  const [status, setStatus] = useState<'loading' | 'ok' | 'fail'>('loading');

  useEffect(() => {
    if (!token || !isSupabaseConfigured()) {
      setStatus('fail');
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      setStatus('fail');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb as any).rpc('unsubscribe_alert', { p_token: token })
      .then(({ error }: { error: Error | null }) => setStatus(error ? 'fail' : 'ok'))
      .catch(() => setStatus('fail'));
  }, [token]);

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
      {status === 'loading' && (
        <p className="text-fg-muted">{isPt ? 'A cancelar…' : 'Unsubscribing…'}</p>
      )}
      {status === 'ok' && (
        <p className="text-lg text-fg font-semibold">
          {isPt ? 'Alerta cancelado.' : 'Alert unsubscribed.'}
        </p>
      )}
      {status === 'fail' && (
        <p className="text-score-poor">
          {isPt ? 'Link inválido.' : 'Invalid link.'}
        </p>
      )}
      <Link href={`/${locale}/`} className="text-data-waves hover:underline text-sm">
        {isPt ? '← Voltar ao VenTu' : '← Back to VenTu'}
      </Link>
    </div>
  );
}
