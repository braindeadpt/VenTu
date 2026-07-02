'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export default function AlertConfirmClient({ locale, token }: { locale: string; token: string }) {
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

     
    (sb as any).rpc('verify_alert_token', { p_token: token })
      .then(({ data, error }: { data: boolean | null; error: Error | null }) => {
        setStatus(error || data !== true ? 'fail' : 'ok');
      })
      .catch(() => setStatus('fail'));
  }, [token]);

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
      {status === 'loading' && (
        <p className="text-fg-muted">{isPt ? 'A confirmar…' : 'Confirming…'}</p>
      )}
      {status === 'ok' && (
        <>
          <p className="text-lg text-fg font-semibold">
            {isPt ? 'Alerta confirmado!' : 'Alert confirmed!'}
          </p>
          <p className="text-fg-muted text-sm">
            {isPt
              ? 'Receberás um email quando algum dos teus favoritos atingir o limiar.'
              : 'You will receive an email when any of your favorites hits your threshold.'}
          </p>
        </>
      )}
      {status === 'fail' && (
        <p className="text-score-poor">
          {isPt ? 'Link inválido ou expirado.' : 'Invalid or expired link.'}
        </p>
      )}
      <Link href={`/${locale}/`} className="text-data-waves hover:underline text-sm">
        {isPt ? '← Voltar ao VenTu' : '← Back to VenTu'}
      </Link>
    </div>
  );
}
